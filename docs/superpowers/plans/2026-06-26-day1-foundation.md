# Sentinel Day 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Sentinel monorepo with a running Next.js 15 app, shadcn/ui design system, and all four backing services (PostgreSQL 16, Redis 7, MinIO, ClickHouse 24) running healthy via Docker Compose.

**Architecture:** pnpm workspace monorepo managed by Turborepo. `apps/web` is the Next.js 15 App Router shell with TypeScript and Tailwind CSS v3. Four Docker services stand up the full data layer immediately so Day 2 can wire real persistence without revisiting infrastructure.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.x, Tailwind CSS 3.x, shadcn/ui, Vitest 2.x, pnpm 9.x, Turborepo 2.x, Docker Compose, PostgreSQL 16-alpine, Redis 7-alpine, MinIO RELEASE.2025, ClickHouse 24-alpine.

## Global Constraints

- Node.js >= 20.0.0; pnpm >= 9.0.0 — verify before starting
- All JS package names scoped: `@sentinel/web`, `@sentinel/core`, `@sentinel-ai/sdk`
- No `src/` directory in `apps/web` — App Router pages live at `apps/web/app/`
- Import alias `@/*` maps to the root of `apps/web/` (i.e., `apps/web/lib/x` → `@/lib/x`)
- Tailwind CSS v3 (not v4) — shadcn/ui has stable support for v3
- Vitest (not Jest) for all JS/TS tests
- Docker Compose file: `docker/docker-compose.yml`
- Environment variables documented in `.env.example` at repo root; actual secrets in `.env` (gitignored)
- Commit after every task with message format `feat(day1): <description>`

## Prerequisites Check

Before Task 1, verify:
```bash
node --version    # must be >= 20.0.0
pnpm --version    # must be >= 9.0.0
docker --version  # Docker Desktop must be running
git --version
```

If pnpm is missing: `npm install -g pnpm@latest`

---

### Task 1: Monorepo Root Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.prettierrc`

**Interfaces:**
- Produces: `turbo` CLI available at repo root; `pnpm install` resolves workspace packages

---

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "sentinel",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "check-types": "turbo run check-types",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\" --ignore-path .gitignore"
  },
  "devDependencies": {
    "prettier": "^3.5.3",
    "turbo": "^2.5.4",
    "typescript": "^5.8.3"
  },
  "packageManager": "pnpm@9.15.5",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    }
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
# dependencies
node_modules/
.pnp
.pnp.js

# next.js
apps/web/.next/
apps/web/out/

# build outputs
dist/
build/
*.tsbuildinfo
next-env.d.ts

# env files
.env
.env.local
.env.*.local

# turbo
.turbo/

# testing
coverage/

# OS
.DS_Store
Thumbs.db

# python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
.pytest_cache/
.mypy_cache/

# editor
.idea/
.vscode/settings.json
*.swp

# docker volumes
docker/volumes/
```

- [ ] **Step 5: Write `.env.example`**

```bash
# ── PostgreSQL ──────────────────────────────────────────────
DATABASE_URL=postgresql://sentinel:sentinel@localhost:5432/sentinel

# ── Redis ───────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── MinIO ───────────────────────────────────────────────────
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=sentinel
MINIO_SECRET_KEY=sentinel123
MINIO_BUCKET=sentinel

# ── ClickHouse ──────────────────────────────────────────────
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DB=sentinel
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# ── NextAuth ────────────────────────────────────────────────
NEXTAUTH_SECRET=change-me-in-production-use-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# ── Sentinel Engine (Python FastAPI) ────────────────────────
ENGINE_URL=http://localhost:8000
ENGINE_API_KEY=internal-secret-change-me
```

- [ ] **Step 6: Write `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": []
}
```

- [ ] **Step 7: Copy `.env.example` to `.env`**

```bash
cp .env.example .env
```

- [ ] **Step 8: Install root dependencies**

```bash
pnpm install
```

Expected output: `Done in Xs`. No errors.

- [ ] **Step 9: Verify turbo is available**

```bash
pnpm turbo --version
```

Expected: prints a version like `2.5.4`

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .env.example .prettierrc
git commit -m "feat(day1): monorepo root scaffold with pnpm + turborepo"
```

---

### Task 2: Next.js 15 App — `apps/web`

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/.eslintrc.json`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: pnpm workspace from Task 1
- Produces: `pnpm --filter @sentinel/web dev` starts Next.js on `http://localhost:3000`; `pnpm --filter @sentinel/web build` compiles without errors

---

- [ ] **Step 1: Create `apps/web` directory**

```bash
mkdir -p apps/web/app apps/web/components apps/web/lib apps/web/public
```

- [ ] **Step 2: Write `apps/web/package.json`**

```json
{
  "name": "@sentinel/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000 --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.3.3",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.19.0",
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "@vitejs/plugin-react": "^4.5.2",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.29.0",
    "eslint-config-next": "^15.3.3",
    "jsdom": "^26.1.0",
    "postcss": "^8.5.4",
    "tailwindcss": "^3.4.17",
    "vitest": "^2.2.5"
  }
}
```

- [ ] **Step 3: Write `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig
```

- [ ] **Step 4: Write `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Write `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 6: Write `apps/web/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
```

- [ ] **Step 7: Write `apps/web/.eslintrc.json`**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"]
}
```

- [ ] **Step 8: Write `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 9: Write `apps/web/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sentinel — AI Quality Engineering',
  description: 'Enterprise AI Quality Engineering Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 10: Write `apps/web/app/page.tsx`**

```typescript
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Sentinel
        </h1>
        <p className="text-muted-foreground">
          AI Quality Engineering Platform
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Day 1 — Foundation complete</p>
    </main>
  )
}
```

- [ ] **Step 11: Install web dependencies**

```bash
pnpm install
```

Expected: resolves workspace, installs all packages for `@sentinel/web`.

- [ ] **Step 12: Verify type checking passes**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: exits 0, no errors.

- [ ] **Step 13: Start dev server and verify**

```bash
pnpm --filter @sentinel/web dev
```

Open `http://localhost:3000`. Expected: white page with "Sentinel" heading and "Day 1 — Foundation complete" text. Stop with Ctrl+C.

- [ ] **Step 14: Commit**

```bash
git add apps/web/
git commit -m "feat(day1): next.js 15 app scaffold with tailwind css"
```

---

### Task 3: Vitest Setup + First Test

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/app/page.test.tsx`

**Interfaces:**
- Consumes: `apps/web/app/page.tsx` from Task 2
- Produces: `pnpm --filter @sentinel/web test` runs and passes; CI has a working test command from Day 1

---

- [ ] **Step 1: Write `apps/web/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 2: Write `apps/web/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Write the failing test — `apps/web/app/page.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('renders the Sentinel heading', () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { name: /sentinel/i })).toBeInTheDocument()
  })

  it('renders the platform subtitle', () => {
    render(<HomePage />)
    expect(screen.getByText(/AI Quality Engineering Platform/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test — verify it fails first**

```bash
pnpm --filter @sentinel/web test
```

Expected: FAIL — `Cannot find module './page'` or similar (because test runner isn't configured yet).

If it passes immediately (unlikely on first run), something is misconfigured — check `vitest.config.ts`.

- [ ] **Step 5: Run test — verify it passes after setup**

The test should now pass because `page.tsx` already exists from Task 2.

```bash
pnpm --filter @sentinel/web test
```

Expected output:
```
✓ app/page.test.tsx (2 tests)
  ✓ renders the Sentinel heading
  ✓ renders the platform subtitle

Test Files  1 passed (1)
Tests       2 passed (2)
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/app/page.test.tsx
git commit -m "feat(day1): vitest setup with first passing tests"
```

---

### Task 4: shadcn/ui Initialization

**Files:**
- Create: `apps/web/components.json` (generated by shadcn init)
- Create: `apps/web/lib/utils.ts`
- Create: `apps/web/components/ui/button.tsx` (generated)

**Interfaces:**
- Consumes: Tailwind config from Task 2
- Produces: `cn()` utility available at `@/lib/utils`; `<Button>` component importable from `@/components/ui/button`

---

- [ ] **Step 1: Install shadcn/ui dependencies**

```bash
pnpm --filter @sentinel/web add class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: Write `apps/web/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Write `apps/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Add the Button component via shadcn CLI**

```bash
cd apps/web && pnpm dlx shadcn@latest add button --overwrite
```

Expected: creates `apps/web/components/ui/button.tsx`. Accept all prompts.

- [ ] **Step 5: Write a test for the Button component — `apps/web/components/ui/button.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders with label text', () => {
    render(<Button>Run Test Suite</Button>)
    expect(screen.getByRole('button', { name: /run test suite/i })).toBeInTheDocument()
  })

  it('applies destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole('button', { name: /delete/i })
    expect(btn).toHaveClass('bg-destructive')
  })
})
```

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter @sentinel/web test
```

Expected:
```
✓ app/page.test.tsx (2 tests)
✓ components/ui/button.test.tsx (2 tests)

Test Files  2 passed (2)
Tests       4 passed (4)
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components.json apps/web/lib/utils.ts apps/web/components/ 
git commit -m "feat(day1): shadcn/ui setup with Button component and utils"
```

---

### Task 5: Docker Compose — Four Backing Services

**Files:**
- Create: `docker/docker-compose.yml`
- Create: `docker/docker-compose.dev.yml`
- Create: `docker/.gitkeep` (keeps docker/ in git with volumes excluded)

**Interfaces:**
- Produces:
  - PostgreSQL on `localhost:5432` (user: `sentinel`, password: `sentinel`, db: `sentinel`)
  - Redis on `localhost:6379`
  - MinIO S3 API on `localhost:9000`, console on `localhost:9001`
  - ClickHouse HTTP on `localhost:8123`, native on `localhost:9009`

---

- [ ] **Step 1: Create docker directory**

```bash
mkdir -p docker
touch docker/.gitkeep
```

- [ ] **Step 2: Write `docker/docker-compose.yml`**

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: sentinel_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: sentinel
      POSTGRES_DB: sentinel
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sentinel -d sentinel']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: sentinel_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    container_name: sentinel_minio
    restart: unless-stopped
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: sentinel
      MINIO_ROOT_PASSWORD: sentinel123
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio_data:/data
    healthcheck:
      test:
        [
          'CMD',
          'curl',
          '-f',
          'http://localhost:9000/minio/health/live',
        ]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    container_name: sentinel_clickhouse
    restart: unless-stopped
    ports:
      - '8123:8123'
      - '9009:9009'
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.d/sentinel.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:8123/ping',
        ]
      interval: 5s
      timeout: 5s
      retries: 15
      start_period: 15s

volumes:
  postgres_data:
  redis_data:
  minio_data:
  clickhouse_data:
```

- [ ] **Step 3: Write ClickHouse config — `docker/clickhouse/config.xml`**

```bash
mkdir -p docker/clickhouse
```

```xml
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
  <logger>
    <level>warning</level>
    <console>true</console>
  </logger>
  <mark_cache_size>5368709120</mark_cache_size>
</clickhouse>
```

- [ ] **Step 4: Write `docker/docker-compose.dev.yml` (dev overrides)**

```yaml
version: '3.9'

# Development overrides: exposes extra ports, disables restart policies
services:
  postgres:
    restart: 'no'

  redis:
    restart: 'no'

  minio:
    restart: 'no'

  clickhouse:
    restart: 'no'
```

- [ ] **Step 5: Start all services**

```bash
docker compose -f docker/docker-compose.yml up -d
```

Expected: pulls images (first run takes 1-3 min), then:
```
✔ Container sentinel_postgres    Started
✔ Container sentinel_redis       Started
✔ Container sentinel_minio       Started
✔ Container sentinel_clickhouse  Started
```

- [ ] **Step 6: Wait for health checks to pass**

```bash
docker compose -f docker/docker-compose.yml ps
```

Expected: all four containers show `(healthy)` in the Status column. If any show `(health: starting)`, wait 20s and run again.

- [ ] **Step 7: Verify PostgreSQL**

```bash
docker exec sentinel_postgres psql -U sentinel -d sentinel -c "SELECT version();"
```

Expected: prints PostgreSQL 16.x version string.

- [ ] **Step 8: Verify Redis**

```bash
docker exec sentinel_redis redis-cli ping
```

Expected: `PONG`

- [ ] **Step 9: Verify ClickHouse**

```bash
curl -s http://localhost:8123/ping
```

Expected: `Ok.`

- [ ] **Step 10: Verify MinIO**

Open `http://localhost:9001` in browser. Log in with `sentinel` / `sentinel123`. Expected: MinIO console loads with empty bucket list.

- [ ] **Step 11: Commit**

```bash
git add docker/
git commit -m "feat(day1): docker compose with postgres, redis, minio, clickhouse"
```

---

### Task 6: CLAUDE.md — Daily Session Protocol

**Files:**
- Create: `CLAUDE.md` at repo root

**Interfaces:**
- Produces: every future session starts by reading this file; every session ends by updating the "Next Session" section

---

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# Sentinel — Daily Session Context

## What This Project Is
Sentinel is a self-hosted enterprise AI Quality Engineering platform.
Five modules: Probe (agent testing), Mirror (external AI product testing),
Guard (security), Cognify (cognitive benchmarking), Reach (accessibility).

Full spec: `docs/superpowers/specs/2026-06-26-sentinel-design.md`

## Session Protocol
- **Start every session:** Read this file. Read the plan for the current day.
- **End every session:** Update the "Current Status" and "Next Session" sections below.

---

## Current Status

**Phase:** Foundation (Days 1–5)
**Day completed:** Day 1
**What was built:**
- pnpm + Turborepo monorepo root
- Next.js 15 app at `apps/web` with Tailwind CSS v3
- shadcn/ui with Button component + `cn()` utility
- Vitest with 4 passing tests
- Docker Compose: PostgreSQL 16, Redis 7, MinIO, ClickHouse 24 — all healthy

---

## Next Session — Day 2

**Plan file:** `docs/superpowers/plans/2026-06-27-day2-auth.md` *(to be written)*

**Goal:** Prisma schema (Org, User, Session, AuditLog) + NextAuth.js v5 email/password auth + login/logout UI + dashboard route protection.

**Steps overview:**
1. Install Prisma in `apps/web`, init with `DATABASE_URL` from `.env`
2. Write schema: `Organization`, `User`, `Session`, `VerificationToken`, `AuditLog`
3. Run first migration: `pnpm --filter @sentinel/web exec prisma migrate dev --name init`
4. Install NextAuth.js v5 (`next-auth@5.0.0-beta.x`)
5. Configure Credentials provider (email + bcrypt password)
6. Build `/login` page with email/password form using shadcn/ui `<Input>` + `<Button>`
7. Add `middleware.ts` to protect `/dashboard` → redirect to `/login` if not authenticated
8. Build empty `/dashboard` page (shell only — sidebar comes Day 3)
9. Write Vitest tests: login form renders, unauthenticated redirect works
10. Commit

**Start command for Day 2:**
```bash
cd C:\Users\AdityaKumarSingh\sentinel
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @sentinel/web dev
```

**Architecture decisions locked in:**
- Modular monolith: Next.js 15 shell + Python FastAPI engine (engine scaffolded Day 4)
- PostgreSQL via Prisma for all relational data
- ClickHouse for trace/metric time-series (wired Day 5)
- pnpm workspaces + Turborepo
- shadcn/ui + Tailwind CSS v3
- Vitest for all JS/TS tests

**Blockers / Notes:**
None.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(day1): claude.md daily session protocol with day 2 handoff"
```

---

### Task 7: Final Day 1 Verification

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected:
```
@sentinel/web: ✓ app/page.test.tsx (2 tests)
@sentinel/web: ✓ components/ui/button.test.tsx (2 tests)
Tasks: 1 successful, 1 cached
```

- [ ] **Step 2: Verify type checking across workspace**

```bash
pnpm check-types
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 3: Verify all Docker services still healthy**

```bash
docker compose -f docker/docker-compose.yml ps
```

Expected: all four containers show `(healthy)`.

- [ ] **Step 4: Verify git log looks clean**

```bash
git log --oneline
```

Expected:
```
<hash> feat(day1): claude.md daily session protocol with day 2 handoff
<hash> feat(day1): docker compose with postgres, redis, minio, clickhouse
<hash> feat(day1): shadcn/ui setup with Button component and utils
<hash> feat(day1): vitest setup with first passing tests
<hash> feat(day1): next.js 15 app scaffold with tailwind css
<hash> feat(day1): monorepo root scaffold with pnpm + turborepo
<hash> design: Sentinel platform spec — 5-module AI Quality Engineering platform
```

- [ ] **Step 5: Final commit (if any loose files)**

```bash
git status
# If clean: nothing to commit
# If dirty: git add . && git commit -m "feat(day1): day 1 complete"
```

---

## Day 1 Done

**What's running:**
- `http://localhost:3000` — Next.js 15 app with "Sentinel" homepage
- `localhost:5432` — PostgreSQL 16 (user: sentinel / sentinel)
- `localhost:6379` — Redis 7
- `localhost:9000` — MinIO S3 API
- `localhost:9001` — MinIO Console (sentinel / sentinel123)
- `localhost:8123` — ClickHouse HTTP

**What's tested:** 4 Vitest tests passing (page renders + Button component)

**Tomorrow (Day 2):** Prisma schema + NextAuth.js + login/logout + dashboard protection
Read `CLAUDE.md` at session start to resume.
```
