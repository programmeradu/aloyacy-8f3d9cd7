"""Parse supabase/migrations into a final-state table model (json) for D1 translation."""
import re,glob,json,sys
tables={}; uniques={}; indexes=[]
def split_top(s):
    out=[];d=0;cur=''
    for ch in s:
        if ch=='(' :d+=1
        if ch==')' :d-=1
        if ch==',' and d==0: out.append(cur.strip()); cur=''
        else: cur+=ch
    if cur.strip(): out.append(cur.strip())
    return out
def strip_comments(s):
    s=re.sub(r'--[^\n]*','',s)
    return s
def parse_col(c):
    m=re.match(r'"?([a-z_0-9]+)"?\s+(.*)$',c,re.S|re.I)
    name,rest=m.group(1),m.group(2)
    tm=re.match(r'([a-z_ ]+?(?:\[\])?(?:\([^)]*\))?(?:\[\])?)(?=\s+(?:NOT|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|CHECK|GENERATED|CONSTRAINT|COLLATE)\b|$)',rest.strip(),re.I|re.S)
    typ=(tm.group(1) if tm else rest.split()[0]).strip().lower()
    col={'name':name,'type':typ,'notnull':bool(re.search(r'NOT NULL',rest,re.I)),
         'pk':bool(re.search(r'PRIMARY KEY',rest,re.I)),'unique':bool(re.search(r'\bUNIQUE\b',rest,re.I))}
    dm=re.search(r'DEFAULT\s+(.+?)(?=\s+(?:NOT NULL|NULL|PRIMARY|UNIQUE|REFERENCES|CHECK|GENERATED|CONSTRAINT)\b|$)',rest,re.I|re.S)
    if dm: col['default']=dm.group(1).strip()
    rm=re.search(r'REFERENCES\s+(?:public\.)?([a-z_\.]+)\s*(?:\(([^)]*)\))?([^,]*)',rest,re.I)
    if rm: col['ref']=[rm.group(1),rm.group(2),'cascade' if re.search('ON DELETE CASCADE',rest,re.I) else ('set null' if re.search('ON DELETE SET NULL',rest,re.I) else '')]
    if re.search(r'GENERATED',rest,re.I): col['generated']=rest
    if re.search(r'\bCHECK\b',rest,re.I): col['check']=re.search(r'CHECK\s*(\(.*\))',rest,re.I|re.S).group(1)
    return col
for f in sorted(glob.glob('supabase/migrations/*.sql'))+sorted(glob.glob('deploy/supabase/sql/*.sql')):
    s=strip_comments(open(f).read())
    # remove function bodies
    s=re.sub(r'\$([a-z_]*)\$.*?\$\1\$','$$BODY$$',s,flags=re.S)
    for st in s.split(';'):
        st=st.strip()
        m=re.match(r'CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z_]+)"?\s*\((.*)\)',st,re.S|re.I)
        if m:
            t=m.group(1)
            if t in tables and 'IF NOT EXISTS' in st.upper(): continue
            cols={};cons=[]
            for part in split_top(m.group(2)):
                if re.match(r'(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)',part,re.I): cons.append(part)
                else:
                    c=parse_col(part); cols[c['name']]=c
            tables[t]={'cols':cols,'cons':cons,'file':f[-45:]}; continue
        m=re.match(r'ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:public\.)?"?([a-z_]+)"?\s+(.*)',st,re.S|re.I)
        if m and m.group(1) in tables:
            t=m.group(1)
            for act in split_top(m.group(2)):
                a=re.match(r'ADD COLUMN (?:IF NOT EXISTS )?(.*)',act,re.I|re.S)
                if a: c=parse_col(a.group(1)); tables[t]['cols'].setdefault(c['name'],c); continue
                a=re.match(r'DROP COLUMN (?:IF EXISTS )?"?([a-z_]+)',act,re.I)
                if a: tables[t]['cols'].pop(a.group(1),None); continue
                a=re.match(r'RENAME COLUMN ([a-z_]+) TO ([a-z_]+)',act,re.I)
                if a:
                    c=tables[t]['cols'].pop(a.group(1)); c['name']=a.group(2); tables[t]['cols'][a.group(2)]=c; continue
                a=re.match(r'ADD (CONSTRAINT .*|PRIMARY KEY.*|UNIQUE.*)',act,re.I|re.S)
                if a: tables[t]['cons'].append(a.group(1)); continue
                a=re.match(r'DROP CONSTRAINT (?:IF EXISTS )?([a-z_0-9]+)',act,re.I)
                if a: tables[t]['cons']=[c for c in tables[t]['cons'] if a.group(1) not in c]; tables[t].setdefault('dropped',[]).append(a.group(1)); continue
                a=re.match(r'ALTER COLUMN ([a-z_]+) (.*)',act,re.I|re.S)
                if a and a.group(1) in tables[t]['cols']:
                    c=tables[t]['cols'][a.group(1)];r=a.group(2)
                    if re.match('SET NOT NULL',r,re.I): c['notnull']=True
                    elif re.match('DROP NOT NULL',r,re.I): c['notnull']=False
                    elif re.match('SET DEFAULT',r,re.I): c['default']=r[11:].strip()
                    elif re.match('DROP DEFAULT',r,re.I): c.pop('default',None)
                    elif re.match('(SET DATA )?TYPE',r,re.I): c['type']=re.sub(r'(?i)^(SET DATA )?TYPE\s+','',r).split(' USING')[0].strip().lower()
                    continue
                tables[t].setdefault('other',[]).append(act[:120])
            continue
        m=re.match(r'DROP TABLE (?:IF EXISTS )?(?:public\.)?([a-z_]+)',st,re.I)
        if m: tables.pop(m.group(1),None); continue
        m=re.match(r'CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?"?([a-z_0-9]+)"?\s+ON (?:public\.)?([a-z_]+)(?: USING \w+)?\s*\((.*?)\)\s*(WHERE .*)?$',st,re.I|re.S)
        if m:
            indexes.append({'unique':bool(m.group(1)),'name':m.group(2),'table':m.group(3),'cols':m.group(4),'where':(m.group(5) or '').strip()}); continue
        m=re.match(r'DROP INDEX (?:IF EXISTS )?(?:public\.)?([a-z_0-9]+)',st,re.I)
        if m: indexes=[i for i in indexes if i['name']!=m.group(1)]
json.dump({'tables':tables,'indexes':indexes},open('/tmp/pgmodel.json','w'),indent=1)
for t,v in sorted(tables.items()):
    print(t, ', '.join(f"{c['name']}:{c['type']}{'!' if c['notnull'] else ''}{'*PK' if c['pk'] else ''}{'=' + c['default'][:30] if 'default' in c else ''}" for c in v['cols'].values()))
    for c in v['cons']: print('   CONS', ' '.join(c.split())[:150])
    for o in v.get('other',[]): print('   OTHER',' '.join(o.split()))
for i in indexes:
    if i['unique']: print('UIDX',i['table'],i['cols'],i['where'])
