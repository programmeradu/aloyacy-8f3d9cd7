# Pillar 1: Testing, Test:Source Ratios & Zero-External Isolation

> **Core Axiom**: *Code without automated verification has zero commercial value and zero evaluation trust. Quality times zero tasks equals zero payout.*

---

## 1. The 10/10 Test Infrastructure Benchmark

In enterprise code assessments and AI dataset licensing (such as DataFactor), test suites are built and executed in strictly isolated, ephemeral sandboxes. If a repository has no test suite, or if the test suite attempts to make network calls to external APIs (`devnet.solana.com`, `api.groq.com`, `preview.emergentagent.com`), the test suite **fails at HEAD**, collapsing the score to Grade F.

### Mandatory Baseline Metrics
- **Test-to-Source File Ratio**: Minimum `1:5` for small repos, targeting `1:2` to `1:1` for core business domains.
- **Coverage Floor**: Minimum `70%` line coverage across pure logic and API boundary routes; CI must fail if coverage drops below the set floor.
- **Isolation Guarantee**: `100%` offline runnable. `git clone && npm test` (or `pytest`) must succeed with zero `.env` setup and zero active network connection.

---

## 2. Test Stack Specifications by Ecosystem

### TypeScript / JavaScript (Frontend, Full-stack, Node.js)
- **Runner**: `Vitest` (preferred for Vite/Next.js/Node) or `Jest`.
- **DOM / Component Testing**: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- **API / Network Mocking**: `MSW` (Mock Service Worker) or `vi.fn()` / `vi.spyOn()`.

#### Standard `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 70,
      functions: 70,
      branches: 65,
      statements: 70,
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        'tests/**',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

#### Shared `tests/setup.ts` (Zero-External Isolation)
```typescript
import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';

// Global mocks for third-party browser APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Supabase / Database Client to prevent remote calls
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      update: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      delete: vi.fn().mockResolvedValue({ data: [{}], error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});
```

---

### Python (Backend, FastAPIs, Data Pipelines)
- **Runner**: `pytest` with `pytest-cov`, `pytest-asyncio`.
- **HTTP Mocking**: `responses`, `httpx` mock transports, or `unittest.mock`.
- **Database Isolation**: In-memory SQLite (`sqlite:///:memory:`) or test-scoped Postgres containers via `testcontainers-python`.

#### Standard `pytest.ini`
```ini
[pytest]
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
addopts = --cov=src --cov=backend --cov-report=term-missing --cov-fail-under=70 -v
asyncio_mode = auto
```

#### In-Process Test Fixtures (`tests/conftest.py`)
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.main import app
from backend.core.database import Base, get_db

# Isolated In-Memory SQLite Engine
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

---

## 3. Tiered Testing Architecture (The 3-Layer Rule)

Every non-trivial codebase must implement tests across three distinct layers:

```
┌──────────────────────────────────────────────────────────┐
│ 1. Pure Unit Tests (Business logic, math, formatting)    │ -> 60% of suite
├──────────────────────────────────────────────────────────┤
│ 2. Contract & API Route Tests (Boundary schemas, status) │ -> 30% of suite
├──────────────────────────────────────────────────────────┤
│ 3. State & Flow Integration Tests (Mocked multi-step)    │ -> 10% of suite
└──────────────────────────────────────────────────────────┘
```

### Layer 1: Pure Unit Test Pattern
Target pure helper functions, calculations, transformations, and parser routines. No mocking required.
```typescript
import { describe, it, expect } from 'vitest';
import { calculateLoanAmortization, parseEvmTransaction } from '@/lib/finance';

describe('calculateLoanAmortization', () => {
  it('correctly calculates monthly payments and principal breakdown', () => {
    const result = calculateLoanAmortization({ principal: 100000, rate: 0.05, termsMonths: 12 });
    expect(result.monthlyPayment).toBeCloseTo(8560.75, 2);
    expect(result.totalInterest).toBeGreaterThan(0);
  });
  
  it('throws a ValidationError when terms are negative or zero', () => {
    expect(() => calculateLoanAmortization({ principal: 1000, rate: 0.05, termsMonths: 0 }))
      .toThrowError(/termsMonths must be greater than 0/);
  });
});
```

### Layer 2: API Route & Contract Test Pattern
Target input validation boundaries, status codes, and error responses.
```typescript
import { describe, it, expect, vi } from 'vitest';
import { createServer } from '@/server';
import request from 'supertest';

describe('POST /api/v1/statements', () => {
  const app = createServer();

  it('returns 400 with structured validation errors when body is empty', async () => {
    const res = await request(app)
      .post('/api/v1/statements')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
  });

  it('returns 201 and statement metadata when payload is valid', async () => {
    const res = await request(app)
      .post('/api/v1/statements')
      .send({ walletAddress: '0x71C...8976F', network: 'ethereum' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
  });
});
```

---

## 4. Anti-Patterns & Disqualification Traps

1. ❌ **Network Dependent Tests**: Calling live URLs like `https://api.openai.com` or `https://api.devnet.solana.com`. If internet is disconnected or rate limits hit, CI dies.
2. ❌ **Scaffold Hello-World Tests**: Keeping only the default generator test file (`test('renders learn react link')`) while source files number in the hundreds.
3. ❌ **Untested God Modules**: Large files (>500 LOC) containing core state machines with 0 corresponding `.test.ts` files.
4. ❌ **Test-Free Commits**: Writing 500 lines of code across 10 commits and dumping a single test file at the very end.
