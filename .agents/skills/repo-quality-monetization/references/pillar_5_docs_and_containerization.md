# Pillar 5: Docs, Containerization & The 1-Command Clone-to-Run Standard

> **Core Axiom**: *Buyers evaluate repositories in isolated sandboxes. A single command that boots the application with all backing services in isolation makes the repository immediately valuable; one requiring external cloud accounts or undocumented steps is worth $0.*

---

## 1. The 1-Command Clone-to-Run Standard

A new engineer, code buyer, or automated CI runner should be able to execute the following sequence with **zero manual edits** and zero external account registrations:

```bash
git clone <repo-url>
cd <repo-folder>
cp .env.example .env
docker compose up -d
# or
npm install && npm test
```

If any step fails or requires creating an unmocked third-party cloud account (e.g. OpenAI, Stripe, Groq, Neon, Alchemy), the onboarding and reproducibility dimension receives an automatic failure.

---

## 2. Production Docker Compose Template (`docker-compose.yml`)

Every multi-tier application (Next.js, Vite frontend, FastAPI, Express, or Worker) needing backing stores (PostgreSQL, MySQL, Redis) must provide a root `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/app_dev
      - REDIS_URL=redis://redis:6379/0
      - MOCK_MODE=true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=app_dev
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg_data:
```

---

## 3. The Offline MOCK_MODE Architecture

When code utilizes expensive or rate-limited external AI/Web3 APIs (OpenAI, Gemini, Anthropic, Solana RPC, Helius, Etherscan), implement an explicit `MOCK_MODE=true` default in `.env.example` that routes through deterministic in-memory stubs:

```typescript
// src/lib/ai/client.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIProvider {
  generateText(prompt: string): Promise<string>;
}

export class MockAIProvider implements AIProvider {
  async generateText(prompt: string): Promise<string> {
    return JSON.stringify({
      status: 'success',
      mocked: true,
      analysis: 'Simulated response for prompt: ' + prompt.slice(0, 50),
      metrics: { score: 95, confidence: 0.98 },
    });
  }
}

export class GeminiAIProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }
  async generateText(prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const res = await model.generateContent(prompt);
    return res.response.text();
  }
}

export function getAIProvider(): AIProvider {
  if (process.env.MOCK_MODE === 'true' || !process.env.GEMINI_API_KEY) {
    return new MockAIProvider();
  }
  return new GeminiAIProvider(process.env.GEMINI_API_KEY);
}
```

---

## 4. The 10/10 Enterprise README Blueprint

Never leave a README blank, as unedited starter boilerplate, or as voice dictation notes. Follow this 8-section blueprint:

```markdown
# [Project Name]

> Brief 1-2 sentence value proposition describing the problem solved and core technology stack.

[![CI Status](https://github.com/org/repo/actions/workflows/ci.yml/badge.svg)](https://github.com/org/repo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen.svg)]()

---

## 1. Overview & Key Features
- **Feature A**: Description and business capability.
- **Feature B**: Description and performance metric.
- **Feature C**: Integration or protocol support.

---

## 2. Architecture & Tech Stack

```
┌──────────────────────────────────────────────────────────┐
│ Frontend: Next.js 14 / React 19 / Tailwind CSS / Radix  │
├──────────────────────────────────────────────────────────┤
│ API Layer: Hono / tRPC / Zod Validated Handlers          │
├──────────────────────────────────────────────────────────┤
│ Data Layer: PostgreSQL / Drizzle ORM / Redis Cache       │
└──────────────────────────────────────────────────────────┘
```

- **Frontend**: Next.js (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend / APIs**: Node.js / Python FastAPI, Drizzle ORM / SQLAlchemy.
- **Storage & Infrastructure**: PostgreSQL 16, Redis 7, Docker.

---

## 3. Quickstart (Clone to Run in 60s)

### Prerequisites
- Node.js 20+ (or Python 3.11+)
- Docker & Docker Compose
- pnpm (recommended) or npm

```bash
# 1. Clone the repository
git clone https://github.com/org/repo.git
cd repo

# 2. Setup environment configuration
cp .env.example .env

# 3. Start backing services & app via Docker
docker compose up -d

# Or run locally with mock mode:
npm install
npm run dev
```

The application will be live at `http://localhost:3000`.

---

## 4. Environment Variables Matrix

| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `PORT` | HTTP Server port | `3000` | Optional |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/app` | Required |
| `MOCK_MODE` | Enable offline third-party provider mocks | `true` | Required for test |
| `GEMINI_API_KEY` | Google Gemini API key | `your_key_here` | Optional (if MOCK_MODE=true) |

---

## 5. Testing & Verification Runbook

```bash
# Run all unit and integration tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run strict typechecking
npm run typecheck

# Run linter
npm run lint
```

---

## 6. Project Structure

```
├── .github/workflows/   # CI/CD pipelines
├── src/
│   ├── app/             # Application routes & layout
│   ├── components/      # Modular UI components (<300 LOC)
│   ├── hooks/           # Reusable client hooks
│   ├── lib/             # Core business logic, db, and logger
│   └── tests/           # Automated test suites
├── docker-compose.yml   # One-command container setup
├── .env.example         # 100% complete environment template
└── README.md            # Project documentation
```

---

## 7. Contributing Guidelines
1. Ensure all features arrive with corresponding tests in `src/tests/`.
2. Keep individual files under 500 LOC.
3. Verify `npm run lint && npm run typecheck && npm test` pass before submitting a PR.

---

## 8. License
This project is licensed under the [MIT License](LICENSE).
```
