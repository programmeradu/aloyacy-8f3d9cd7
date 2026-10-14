"""Generate migrations-d1/0001_init.sql and src/lib/db/schema-meta.ts from the
final-state model of supabase/migrations (run parse-pg.py first).

Conventions (see src/lib/db/README.md):
  * timestamps  -> TEXT ISO-8601 UTC with ms ('2026-10-15T00:00:00.000Z')
  * json/jsonb, arrays -> TEXT (JSON), parsed/serialised by the query builder
  * boolean -> INTEGER 0/1, mapped to true/false by the query builder
  * uuid -> TEXT (generated in JS by the builder when omitted, SQL default as backstop)
  * bigint unix seconds stay INTEGER
  * foreign keys to auth.users are dropped (no auth schema); ON DELETE
    CASCADE for trip_group_members -> trip_groups is kept.
"""
import json,re,os
m=json.load(open('/tmp/pgmodel.json'))
SKIP={'subscriptions','trip_history_cloud','trial_grants','alert_counters','suppressed_emails','email_unsubscribe_tokens'}
NOW="(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
UUID="(lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))"
def kind(t):
    t=t.lower()
    if t.endswith('[]'): return 'json'
    if t in('json','jsonb'): return 'json'
    if t=='boolean' or t=='bool': return 'bool'
    if 'timestamp' in t: return 'ts'
    if t in('integer','int','bigint','smallint','bigserial','serial','int4','int8'): return 'int'
    if t.startswith('numeric') or t in('real','double precision','float8','float4'): return 'real'
    return 'text'
def sqltype(k): return {'json':'TEXT','bool':'INTEGER','ts':'TEXT','int':'INTEGER','real':'REAL','text':'TEXT'}[k]
def default(c,k):
    d=c.get('default')
    if d is None: return None
    d=d.strip()
    if d.lower()=='now()': return NOW
    mm=re.match(r"\(?now\(\)\s*\+\s*interval\s*'(\d+) (hour|hours|day|days|minutes)'\)?",d,re.I)
    if mm:
        n,u=mm.groups(); u=u if u.endswith('s') else u+'s'
        return f"(strftime('%Y-%m-%dT%H:%M:%fZ','now','+{n} {u}'))"
    if d.lower()=='gen_random_uuid()': return UUID
    if k=='json':
        v=re.sub(r"::jsonb?$","",d).strip("'")
        if v=='{}' and c['type'].endswith('[]'): v='[]'
        return "'"+v.replace("'","''")+"'"
    if k=='bool': return '1' if d.lower()=='true' else '0'
    d=re.sub(r"::[a-z ]+$","",d)
    return d
out=["-- Aloya D1 schema (translated from supabase/migrations by scripts/d1/gen-d1.py).",
     "-- Fresh database: no data was exported from Supabase project xbidevhyloeetxfjdjiy.",""]
meta={}
for t,v in sorted(m['tables'].items()):
    if t in SKIP: continue
    cols=v['cols']; lines=[]; pk=[c['name'] for c in cols.values() if c['pk']]
    tm={'cols':{}, 'pk':pk, 'uuid':[], 'unique':[]}
    for c in cols.values():
        k=kind(c['type']); tm['cols'][c['name']]=k
        if c['type']=='bigserial' and c['pk']:
            lines.append(f"  {c['name']} INTEGER PRIMARY KEY AUTOINCREMENT"); continue
        s=f"  {c['name']} {sqltype(k)}"
        if c['pk'] and len(pk)==1: s+=" PRIMARY KEY"
        if c['notnull'] and not c['pk']: s+=" NOT NULL"
        if c['unique']: s+=" UNIQUE"; tm['unique'].append([c['name']])
        d=default(c,k)
        if d: s+=f" DEFAULT {d}"
        if c.get('default','').lower()=='gen_random_uuid()': tm['uuid'].append(c['name'])
        if 'check' in c and 'char_length' not in c['check']: s+=f" CHECK {c['check']}"
        if c.get('ref') and c['ref'][0]=='trip_groups': s+=" REFERENCES trip_groups(id) ON DELETE CASCADE"
        lines.append(s)
    for con in v['cons']:
        con=' '.join(con.split())
        mm=re.search(r'PRIMARY KEY\s*\(([^)]*)\)',con,re.I)
        if mm:
            tm['pk']=[x.strip() for x in mm.group(1).split(',')]
            lines.append(f"  PRIMARY KEY ({', '.join(tm['pk'])})"); continue
        mm=re.search(r'UNIQUE\s*\(([^)]*)\)',con,re.I)
        if mm:
            u=[x.strip() for x in mm.group(1).split(',')]; tm['unique'].append(u)
            lines.append(f"  UNIQUE ({', '.join(u)})"); continue
        mm=re.search(r'CHECK\s*(\(.*\))',con,re.I)
        if mm: lines.append(f"  CHECK {mm.group(1)}")
    out.append(f"CREATE TABLE IF NOT EXISTS {t} (\n"+",\n".join(lines)+"\n);")
    meta[t]=tm
# indexes
seen=set()
for i in m['indexes']:
    t=i['table']
    if t in SKIP or t not in meta or i['name'] in seen: continue
    seen.add(i['name'])
    cols=' '.join(i['cols'].split())
    if '::' in cols or 'round(' in cols: continue
    cols=cols.replace('lower(email)','email COLLATE NOCASE')
    where=i['where'].replace("'","'") if i['where'] else ''
    u='UNIQUE ' if i['unique'] else ''
    if i['unique'] and not where: meta[t]['unique'].append([x.strip() for x in cols.split(',')])
    if i['unique'] and where: meta[t].setdefault('partialUnique',[]).append([x.strip() for x in cols.split(',')])
    out.append(f"CREATE {u}INDEX IF NOT EXISTS {i['name']} ON {t} ({cols}){(' '+where) if where else ''};")
extra=open('scripts/d1/extra.sql').read()
out.append(extra)
os.makedirs('migrations-d1',exist_ok=True)
open('migrations-d1/0001_init.sql','w').write("\n".join(out)+"\n")
json.dump(meta,open('/tmp/d1meta.json','w'))
print(len(meta),'tables')

# ---- schema-meta.ts --------------------------------------------------------
meta['users']={'cols':{'id':'text','email':'text','is_anonymous':'bool','email_confirmed_at':'ts','created_at':'ts','updated_at':'ts','last_sign_in_at':'ts'},'pk':['id'],'uuid':[],'unique':[['email']]}
meta['auth_otp_codes']={'cols':{'email':'text','code_hash':'text','user_id':'text','purpose':'text','attempts':'int','expires_at':'int','created_at':'ts'},'pk':['email'],'uuid':[],'unique':[]}
meta['auth_challenges']={'cols':{'id':'text','challenge':'text','user_id':'text','kind':'text','expires_at':'int'},'pk':['id'],'uuid':[],'unique':[]}
meta['email_queue']={'cols':{'msg_id':'int','queue_name':'text','message':'json','read_ct':'int','vt':'int','enqueued_at':'ts'},'pk':['msg_id'],'uuid':[],'unique':[]}
meta['stop_conditions']={'cols':{'stop_id':'text','attribute':'text','value':'text','n':'int','source':'text','updated_at':'ts'},'pk':[],'uuid':[],'unique':[],'view':True}
meta['user_profiles']={'cols':{'id':'text','email':'text'},'pk':['id'],'uuid':[],'unique':[],'view':True}
ts=["// GENERATED by scripts/d1/gen-d1.py from supabase/migrations — do not edit by hand.",
    "// Column kinds drive value mapping in the D1 query builder:",
    "//   json -> TEXT (JSON.stringify / JSON.parse), bool -> INTEGER 0/1,",
    "//   ts -> TEXT ISO-8601 UTC (normalised with Date#toISOString), int/real/text as-is.",
    "export type ColumnKind = 'json' | 'bool' | 'ts' | 'int' | 'real' | 'text';",
    "export type TableMeta = { cols: Record<string, ColumnKind>; pk: string[]; uuid: string[]; unique: string[][]; partialUnique?: string[][]; view?: boolean };",
    "export const SCHEMA: Record<string, TableMeta> = "+json.dumps(meta,indent=1,sort_keys=True)+";",""]
os.makedirs('src/lib/db',exist_ok=True)
open('src/lib/db/schema-meta.ts','w').write("\n".join(ts))
