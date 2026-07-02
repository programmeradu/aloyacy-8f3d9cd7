# Pillar 2: Security Hygiene, Secret Eradication & Input Validation

> **Core Axiom**: *A single committed secret, private key, or unvalidated API boundary instantly disqualifies a codebase from commercial purchase, enterprise compliance, and automated acquisition.*

---

## 1. The Zero-Secret Mandate

Code buyers and automated scanners execute high-entropy regex sweeps and token signature audits across the entire git commit graph (`git log -p --all`). If any commit in history contains an AWS key (`AKIA...`), a private key (`0x...` or Base58 Solana keypair), an API token, or a committed `.env` file, the security dimension drops to Grade F (10-15/100).

### Mandatory Security Checkpoints
1. **Zero Secret Literals in Source Code**: No strings containing API keys, passwords, database URLs with passwords, or private keys.
2. **Zero Tracked `.env*` Files in VCS**: Only `.env.example` may be tracked by Git.
3. **100% Parity in `.env.example`**: Every single environment variable referenced in source code MUST appear with a placeholder and a one-line comment in `.env.example`.
4. **Automated Secret Scanning in CI**: Gitleaks or TruffleHog must execute as a non-bypassable CI gate.
5. **Strict Runtime Input Schema Validation**: No untyped body ingestion (`as any`, `req.body` directly).

---

## 2. Git Environment File Isolation Matrix

Ensure your root `.gitignore` includes the exact ignore matrix:

```gitignore
# Environment files (NEVER COMMIT)
.env
.env.*
!.env.example
!.env.test.example

# Local development credentials
*.pem
*.key
*.p12
*.keystore
id_rsa
id_ed25519
deployer-keypair.json
service-account.json
```

### Protocol for Purging Accidentally Tracked `.env` or Keys
If a secret or `.env` file was previously committed:
```bash
# 1. Untrack the file without deleting local copy
git rm --cached .env .env.production .env.development

# 2. Add to .gitignore and commit
git commit -m "fix(security): remove tracked environment files and ignore .env*"

# 3. Rotate the compromised key immediately at the provider dashboard

# 4. If purging from entire git history (required for clean audit):
# Using git-filter-repo (recommended over BFG):
git filter-repo --invert-paths --path .env --path .env.production --path .env.development
```

---

## 3. The 100% `.env.example` Parity Protocol

Every codebase must have a comprehensive, self-documenting `.env.example`. 

### Parity Audit Script (`scripts/check-env-parity.js` / `.py`)
Include this pre-commit or CI check to ensure zero undocumented environment variables:

```typescript
// scripts/check-env-parity.ts
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '../src');
const EXAMPLE_PATH = path.resolve(__dirname, '../.env.example');

function getAllSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && file !== 'node_modules' && file !== '.git') {
      results = results.concat(getAllSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|py|go|rs)$/.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllSourceFiles(SRC_DIR);
const referencedVars = new Set<string>();

const envRegex = /process\.env\.([A-Z0-9_]+)|import\.meta\.env\.([A-Z0-9_]+)|os\.environ\[['"]([A-Z0-9_]+)['"]\]|os\.getenv\(['"]([A-Z0-9_]+)['"]\)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = envRegex.exec(content)) !== null) {
    const varName = match[1] || match[2] || match[3] || match[4];
    if (varName && !['NODE_ENV', 'PORT', 'DEV', 'PROD', 'SSR'].includes(varName)) {
      referencedVars.add(varName);
    }
  }
}

const exampleContent = fs.existsSync(EXAMPLE_PATH) ? fs.readFileSync(EXAMPLE_PATH, 'utf8') : '';
const missingVars: string[] = [];

for (const v of referencedVars) {
  if (!exampleContent.includes(`${v}=`)) {
    missingVars.push(v);
  }
}

if (missingVars.length > 0) {
  console.error('\x1b[31m[ENV AUDIT FAILED] Missing variables in .env.example:\x1b[0m');
  missingVars.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
} else {
  console.log('\x1b[32m[ENV AUDIT PASSED] 100% environment variable parity verified.\x1b[0m');
}
```

---

## 4. Strict Boundary Request Schema Validation

### TypeScript with Zod (Eliminating `as any` Casts)
Never accept raw request payloads or query parameters. Parse and validate synchronously with Zod before processing.

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const CreateTripSchema = z.object({
  origin: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1).max(255),
  }),
  destination: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1).max(255),
  }),
  mode: z.enum(['transit', 'driving', 'walking', 'cycling']),
  departureTime: z.string().datetime().optional(),
});

export type CreateTripInput = z.infer<typeof CreateTripSchema>;

// Middleware for Express / Hono / Cloudflare Workers
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Validation failed for one or more fields',
          issues: result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }
    req.body = result.data;
    next();
  };
}
```

### Python with Pydantic v2
```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

class SiteAnalysisRequest(BaseModel):
    domain: str = Field(..., min_length=3, max_length=255, pattern=r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    prompts: List[str] = Field(..., min_items=1, max_items=20)
    models: Optional[List[str]] = Field(default=["gemini-2.0", "claude-3-5-sonnet"])
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("domain")
    def clean_domain(cls, v: str) -> str:
        return v.lower().strip()
```

---

## 5. Dangerous Patterns & Execution Vulnerabilities

1. ❌ **Unsanitized Command Execution (`execSync` / `eval` / `subprocess.Popen(shell=True)`)**:
   - Never construct shell commands by string concatenation with client-supplied arguments (e.g. `execSync(`git clone ${repoUrl}`)`).
   - Use parameterized execution without shell parsing (e.g. `execFile('git', ['clone', repoUrl])`).
2. ❌ **Unauthenticated Admin Endpoints**:
   - Dev endpoints (`/api/github/push`, `/debug/run-sql`) must NEVER ship in production builds or listen on open interfaces without cryptographic bearer token or HMAC verification.
3. ❌ **Plaintext Secret References in Config**:
   - Never embed fallback tokens like `const apiKey = process.env.API_KEY || "AIzaSy..."`.
