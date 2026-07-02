# Pillar 4: Architecture, Observability & Modular Cleanliness

> **Core Axiom**: *God files (>500 LOC), unhandled error swallowing, hanging requests, and missing health endpoints signal brittle, prototype-quality software that cannot be maintained, debugged in production, or acquired safely.*

---

## 1. The 500-LOC God-File Prevention Law

In the 24-repo portfolio audit, massive files (e.g., `handlers.ts` at 11,756 LOC, `old-atlas.tsx` at 4,825 LOC, `DashboardDemo.tsx` at 2,359 LOC) dragged code cleanliness scores down to 5–30/100.

### The Golden Limits
- **Maximum File Limit**: **500 LOC** (Hard ceiling). Any file exceeding 500 LOC MUST be split.
- **Ideal Target**: **150–300 LOC** per module or component.
- **Single Responsibility**: One React component per file; one domain service per module; separate data structures/types from implementation logic.

### Modular Extraction Recipe (Refactoring God Files)

When breaking up an oversized file (e.g., `src/routes/trips.tsx` at 1,589 LOC):

```
Before (Monolith):
src/routes/trips.tsx (1589 LOC)
  ├── State & Geolocation Logic
  ├── Supabase Fetch & Query Handlers
  ├── Map Visual Rendering Math
  └── 12 Inline Card JSX Components

After (Layered & Modular):
src/
  ├── routes/trips.tsx (< 200 LOC - High-level layout composition)
  ├── hooks/useTripQueries.ts (Data fetching & mutations)
  ├── hooks/useGeolocationSync.ts (Browser location state)
  ├── lib/mapVisuals.ts (Pure math & marker cluster helpers with unit tests)
  └── components/trip-plan/
        ├── ParkAndRideCard.tsx
        ├── LastMileChainCard.tsx
        └── BikeShareCard.tsx
```

---

## 2. Zero Hardcoded Machine Paths Policy

### The Defect
Hardcoding local developer filesystem paths (such as `/Users/zhoukk/autoclip/venv/bin/yt-dlp` in `autoclip`) breaks the codebase on every other machine, CI runner, and container.

### The Rule
All paths MUST be resolved dynamically via environment variables or relative module paths:

```python
# ❌ DANGEROUS / HARDCODED
YTDLP_PATH = "/Users/zhoukk/autoclip/venv/bin/yt-dlp"

# ✅ PORTABLE / DYNAMIC RESOLUTION
import os
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("AUTOCLIP_DATA_DIR", BASE_DIR / "data"))

def get_ytdlp_executable() -> str:
    env_path = os.getenv("YTDLP_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    system_path = shutil.which("yt-dlp")
    if system_path:
        return system_path
    raise FileNotFoundError("yt-dlp executable not found in PATH or YTDLP_PATH.")
```

---

## 3. Mandatory Request Timeouts & Resiliency

Never execute outbound network requests without an explicit timeout. An un-timeouted `fetch()` or `requests.get()` can cause worker threads to hang indefinitely.

```typescript
// Safe fetch wrapper with AbortController timeout
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
```

---

## 4. Production Structured Logging Standard

Replace all unformatted `console.log`, `console.warn`, `console.error`, and raw Python `print()` calls with structured, leveled JSON logging.

### TypeScript / Node.js with `pino`

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'privateKey', 'apiKey'],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(moduleName: string, context?: Record<string, unknown>) {
  return logger.child({ module: moduleName, ...context });
}
```

---

## 5. Graceful Process Shutdown Architecture

Every backend server or worker daemon must listen for termination signals (`SIGTERM`, `SIGINT`) to close open database connections and drain active requests cleanly:

```typescript
// src/server.ts
import http from 'http';
import { logger } from '@/lib/logger';
import { closeDatabasePool } from '@/lib/db';

export function setupGracefulShutdown(server: http.Server) {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal. Starting graceful teardown...');
    server.close(async () => {
      logger.info('HTTP server closed. Draining database connections...');
      await closeDatabasePool();
      logger.info('Teardown complete. Exiting.');
      process.exit(0);
    });

    // Force shutdown after 10s if connections refuse to drain
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing termination.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

---

## 6. Typed Error Domains & Clean Error Hierarchy

Never swallow errors with empty `catch {}` blocks or generic string responses. Use typed domain error classes that serialize clean HTTP status codes:

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code = 'INTERNAL_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}
```

---

## 7. Mandatory Healthcheck & Observability Endpoints

Every API, worker, or backend service MUST provide a lightweight healthcheck route (`GET /healthz` or `GET /api/health`) that checks backing service connectivity and returns `200 OK` or `503 Service Unavailable`:

```typescript
// src/routes/health.ts (Express / Hono / TanStack Start)
import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '@/lib/db';
import { checkRedisConnection } from '@/lib/redis';

export const healthRouter = Router();

healthRouter.get('/healthz', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const checks = {
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: 'unknown',
    redis: 'unknown',
  };

  try {
    const dbOk = await checkDatabaseConnection();
    checks.database = dbOk ? 'healthy' : 'degraded';
  } catch {
    checks.database = 'unreachable';
  }

  try {
    const redisOk = await checkRedisConnection();
    checks.redis = redisOk ? 'healthy' : 'degraded';
  } catch {
    checks.redis = 'unreachable';
  }

  const isHealthy = checks.database !== 'unreachable';
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    responseTimeMs: Date.now() - startTime,
    checks,
  });
});
```
