# Day 3 — Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `/dashboard` shell with a full layout — persistent sidebar with module navigation, top header with user avatar and sign-out, and a home page of module cards (Probe/Mirror/Guard/Cognify/Reach).

**Architecture:** A Next.js nested layout at `app/dashboard/layout.tsx` provides the sidebar + header shell around all `/dashboard/*` pages. The layout reads the session server-side and passes user data down. The sidebar and module cards are server components; the sign-out button is a client component (needs browser interaction). Module metadata lives in `lib/modules.ts` so it can be shared across the sidebar, module cards, and future route pages.

**Tech Stack:** shadcn/ui (Sheet, Separator, Avatar, Badge — added Day 3), lucide-react (already installed), NextAuth.js v5 `auth()` server-side, Vitest + Testing Library.

## Global Constraints

- Next.js 15 App Router — server components by default; `'use client'` only when browser interaction is needed.
- Tailwind CSS v3 — no v4 syntax.
- shadcn/ui for all UI primitives — no hand-rolled component styling.
- `@/` alias maps to `apps/web/` root throughout.
- pnpm workspaces — installs from repo root: `pnpm --filter @sentinel/web add ...`.
- shadcn CLI must run from `apps/web/`: `cd apps/web && npx shadcn@latest add ...`.
- Vitest + Testing Library for all tests — TDD required.
- `lucide-react` already installed at `^1.21.0` — do NOT reinstall.
- No `Co-Authored-By` in commit messages.
- Do not set `user.name` or `user.email` in local git config.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/web/lib/modules.ts` | Create | Module metadata — id, name, description, href, status |
| `apps/web/lib/modules.test.ts` | Create | Data integrity tests for MODULES |
| `apps/web/components/ui/sheet.tsx` | Create (shadcn) | Drawer/sheet primitive |
| `apps/web/components/ui/separator.tsx` | Create (shadcn) | Horizontal divider primitive |
| `apps/web/components/ui/avatar.tsx` | Create (shadcn) | Avatar/initials primitive |
| `apps/web/components/ui/badge.tsx` | Create (shadcn) | Status badge primitive |
| `apps/web/components/dashboard/sidebar.tsx` | Create | Desktop sidebar with module nav links |
| `apps/web/components/dashboard/sidebar.test.tsx` | Create | Tests: all 5 module links present |
| `apps/web/components/dashboard/sign-out-button.tsx` | Create | Client component — calls `signOut` |
| `apps/web/components/dashboard/sign-out-button.test.tsx` | Create | Tests: button renders |
| `apps/web/components/dashboard/header.tsx` | Create | Top header — user avatar + sign-out |
| `apps/web/components/dashboard/module-card.tsx` | Create | Module card — name, description, badge |
| `apps/web/app/dashboard/layout.tsx` | Create | Nested layout — sidebar + header shell |
| `apps/web/app/dashboard/page.tsx` | Modify | Replace bare shell with module card grid |
| `apps/web/app/dashboard/dashboard.test.tsx` | Create | Tests: 5 module cards rendered |

---

### Task 1: shadcn/ui Components + Module Metadata

**Files:**
- Create: `apps/web/lib/modules.ts`
- Create: `apps/web/lib/modules.test.ts`
- Create (via shadcn CLI): `apps/web/components/ui/sheet.tsx`, `separator.tsx`, `avatar.tsx`, `badge.tsx`

**Interfaces:**
- Produces: `Module` type and `MODULES` array, importable as `import { MODULES, type Module } from '@/lib/modules'`
- Produces: shadcn/ui `Sheet`, `SheetContent`, `SheetTrigger`, `Separator`, `Avatar`, `AvatarFallback`, `Badge` — importable from their respective `@/components/ui/` paths

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/modules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MODULES } from './modules'

describe('MODULES', () => {
  it('has exactly 5 modules', () => {
    expect(MODULES).toHaveLength(5)
  })

  it('each module has all required fields', () => {
    for (const m of MODULES) {
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.description).toBeTruthy()
      expect(m.href).toMatch(/^\/dashboard\//)
      expect(['active', 'coming-soon']).toContain(m.status)
    }
  })

  it('module ids are probe, mirror, guard, cognify, reach in order', () => {
    expect(MODULES.map((m) => m.id)).toEqual([
      'probe',
      'mirror',
      'guard',
      'cognify',
      'reach',
    ])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @sentinel/web test
```

Expected: FAIL — `Cannot find module './modules'`

- [ ] **Step 3: Create `apps/web/lib/modules.ts`**

```typescript
export type ModuleStatus = 'active' | 'coming-soon'

export type Module = {
  id: string
  name: string
  description: string
  href: string
  status: ModuleStatus
}

export const MODULES: Module[] = [
  {
    id: 'probe',
    name: 'Probe',
    description:
      'Test AI agents you build — trace capture, hallucination attribution, CI/CD gate.',
    href: '/dashboard/probe',
    status: 'coming-soon',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    description:
      'Test AI products you consume — API regression, UI automation, cost tracking.',
    href: '/dashboard/mirror',
    status: 'coming-soon',
  },
  {
    id: 'guard',
    name: 'Guard',
    description:
      'Security testing — red-teaming, PII detection, OWASP ASI:2026 compliance.',
    href: '/dashboard/guard',
    status: 'coming-soon',
  },
  {
    id: 'cognify',
    name: 'Cognify',
    description:
      'Cognitive benchmarking — AI vs human expert baselines, longitudinal tracking.',
    href: '/dashboard/cognify',
    status: 'coming-soon',
  },
  {
    id: 'reach',
    name: 'Reach',
    description:
      'Accessibility testing — multi-language quality, bias detection, WCAG compliance.',
    href: '/dashboard/reach',
    status: 'coming-soon',
  },
]
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @sentinel/web test
```

Expected: all prior tests + 3 new `MODULES` tests pass. Total: 11/11.

- [ ] **Step 5: Add shadcn/ui components**

Run from `apps/web/`:

```bash
cd apps/web && npx shadcn@latest add sheet separator avatar badge
```

Expected: creates `apps/web/components/ui/sheet.tsx`, `separator.tsx`, `avatar.tsx`, `badge.tsx`. Adds `@radix-ui/react-separator`, `@radix-ui/react-avatar`, `@radix-ui/react-dialog` (for Sheet) to `package.json`.

- [ ] **Step 6: TypeScript check**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/modules.ts apps/web/lib/modules.test.ts apps/web/components/ui/sheet.tsx apps/web/components/ui/separator.tsx apps/web/components/ui/avatar.tsx apps/web/components/ui/badge.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(day3): module metadata and shadcn sheet/separator/avatar/badge"
```

---

### Task 2: Sidebar + SignOutButton + Header

**Files:**
- Create: `apps/web/components/dashboard/sidebar.tsx`
- Create: `apps/web/components/dashboard/sidebar.test.tsx`
- Create: `apps/web/components/dashboard/sign-out-button.tsx`
- Create: `apps/web/components/dashboard/sign-out-button.test.tsx`
- Create: `apps/web/components/dashboard/header.tsx`

**Interfaces:**
- Consumes: `MODULES` from `@/lib/modules`
- Consumes: `Separator` from `@/components/ui/separator`
- Consumes: `Avatar`, `AvatarFallback` from `@/components/ui/avatar`
- Consumes: `Button` from `@/components/ui/button`
- Consumes: `signOut` from `next-auth/react` (client-side, in `sign-out-button.tsx`)
- Produces: `<Sidebar />` — no props required
- Produces: `<SignOutButton />` — no props required
- Produces: `<Header user={...} />` — takes `user: { name?: string | null; email?: string | null }`

- [ ] **Step 1: Write failing tests**

Create `apps/web/components/dashboard/sign-out-button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}))

describe('SignOutButton', () => {
  it('renders a sign out button', async () => {
    const { SignOutButton } = await import('./sign-out-button')
    render(<SignOutButton />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
```

Create `apps/web/components/dashboard/sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Sidebar', () => {
  it('renders navigation links for all 5 modules', async () => {
    const { Sidebar } = await import('./sidebar')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /probe/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /mirror/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /guard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cognify/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reach/i })).toBeInTheDocument()
  })

  it('each module link points to the correct href', async () => {
    const { Sidebar } = await import('./sidebar')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /probe/i })).toHaveAttribute(
      'href',
      '/dashboard/probe'
    )
    expect(screen.getByRole('link', { name: /reach/i })).toHaveAttribute(
      'href',
      '/dashboard/reach'
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @sentinel/web test
```

Expected: FAIL — `Cannot find module './sign-out-button'`, `Cannot find module './sidebar'`

- [ ] **Step 3: Create `apps/web/components/dashboard/sign-out-button.tsx`**

```tsx
'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      <LogOut className="h-4 w-4" />
      <span className="sr-only">Sign out</span>
    </Button>
  )
}
```

- [ ] **Step 4: Create `apps/web/components/dashboard/sidebar.tsx`**

```tsx
import Link from 'next/link'
import { FlaskConical, Monitor, Shield, Brain, Globe } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { MODULES } from '@/lib/modules'
import { cn } from '@/lib/utils'

const MODULE_ICONS = {
  probe: FlaskConical,
  mirror: Monitor,
  guard: Shield,
  cognify: Brain,
  reach: Globe,
} as const

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn('flex w-60 shrink-0 flex-col border-r bg-background', className)}>
      <div className="flex h-14 items-center px-4">
        <Link
          href="/dashboard"
          className="text-base font-semibold tracking-tight"
        >
          Sentinel
        </Link>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {MODULES.map((module) => {
          const Icon = MODULE_ICONS[module.id as keyof typeof MODULE_ICONS]
          return (
            <Link
              key={module.id}
              href={module.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {module.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 5: Create `apps/web/components/dashboard/header.tsx`**

```tsx
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SignOutButton } from './sign-out-button'

type HeaderProps = {
  user: { name?: string | null; email?: string | null }
}

function getInitials(user: HeaderProps['user']): string {
  if (user.name) {
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.email?.[0]?.toUpperCase() ?? '?'
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b px-6">
      <span className="text-sm text-muted-foreground">{user.email}</span>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
      </Avatar>
      <SignOutButton />
    </header>
  )
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel/web test
```

Expected: all prior tests + 3 new sidebar tests + 1 sign-out button test = 15/15 passing.

- [ ] **Step 7: TypeScript check**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/dashboard/
git commit -m "feat(day3): sidebar, sign-out button, and header components"
```

---

### Task 3: ModuleCard + DashboardLayout + Updated Dashboard Page

**Files:**
- Create: `apps/web/components/dashboard/module-card.tsx`
- Create: `apps/web/app/dashboard/layout.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Create: `apps/web/app/dashboard/dashboard.test.tsx`

**Interfaces:**
- Consumes: `Module` type from `@/lib/modules`
- Consumes: `MODULES` from `@/lib/modules`
- Consumes: `Badge` from `@/components/ui/badge`
- Consumes: `Sidebar` from `@/components/dashboard/sidebar`
- Consumes: `Header` from `@/components/dashboard/header`
- Consumes: `auth` from `@/auth` (server-side, in `layout.tsx`)
- Produces: `<ModuleCard module={module} />` — renders one module as a clickable card
- Produces: `DashboardLayout` — nested layout wrapping all `/dashboard/*` pages
- Produces: Updated `DashboardPage` — grid of 5 ModuleCards

- [ ] **Step 1: Write failing test**

Create `apps/web/app/dashboard/dashboard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DashboardPage from './page'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('DashboardPage', () => {
  it('renders a card for each of the 5 modules', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('link', { name: /probe/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /mirror/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /guard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cognify/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reach/i })).toBeInTheDocument()
  })

  it('each module card links to the correct route', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('link', { name: /probe/i })).toHaveAttribute(
      'href',
      '/dashboard/probe'
    )
    expect(screen.getByRole('link', { name: /guard/i })).toHaveAttribute(
      'href',
      '/dashboard/guard'
    )
  })

  it('each module card shows the Coming Soon badge', () => {
    render(<DashboardPage />)
    const badges = screen.getAllByText('Coming Soon')
    expect(badges).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @sentinel/web test
```

Expected: FAIL — current `DashboardPage` is an async server component that calls `auth()` and `redirect()`, no module cards.

- [ ] **Step 3: Create `apps/web/components/dashboard/module-card.tsx`**

```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { type Module } from '@/lib/modules'
import { cn } from '@/lib/utils'

export function ModuleCard({ module }: { module: Module }) {
  return (
    <Link
      href={module.href}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-5',
        'transition-colors hover:bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{module.name}</h3>
        <Badge variant={module.status === 'active' ? 'default' : 'secondary'}>
          {module.status === 'active' ? 'Active' : 'Coming Soon'}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{module.description}</p>
    </Link>
  )
}
```

- [ ] **Step 4: Replace `apps/web/app/dashboard/page.tsx`**

```tsx
import { MODULES } from '@/lib/modules'
import { ModuleCard } from '@/components/dashboard/module-card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Select a module to get started.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((module) => (
          <ModuleCard key={module.id} module={module} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/web/app/dashboard/layout.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={session.user ?? {}} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel/web test
```

Expected: all prior tests + 3 new dashboard tests = 18/18 passing.

- [ ] **Step 7: TypeScript check**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/dashboard/module-card.tsx apps/web/app/dashboard/layout.tsx apps/web/app/dashboard/page.tsx apps/web/app/dashboard/dashboard.test.tsx
git commit -m "feat(day3): module card, dashboard layout, and wired dashboard page"
```

---

### Task 4: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Current Status` section**

Replace the `## Current Status` block with:

```markdown
## Current Status

**Phase:** Foundation (Days 1–5)
**Day completed:** Day 3
**What was built:**
- `lib/modules.ts` — Module metadata (Probe/Mirror/Guard/Cognify/Reach) with id, name, description, href, status
- shadcn/ui Sheet, Separator, Avatar, Badge components
- `components/dashboard/sidebar.tsx` — Desktop sidebar with module nav links + Lucide icons
- `components/dashboard/sign-out-button.tsx` — Client component calling `signOut`
- `components/dashboard/header.tsx` — Top header with user initials avatar + sign-out button
- `components/dashboard/module-card.tsx` — Module card with name, description, Coming Soon badge
- `app/dashboard/layout.tsx` — Nested layout: sidebar + header shell, server-side auth gate
- `app/dashboard/page.tsx` — Updated: grid of 5 module cards
- Vitest tests: 18 passing (module metadata × 3, sidebar links × 2, sign-out button × 1, module cards × 3, prior × 9)

**Notes:**
- `prisma migrate dev` still blocked by VT-x Docker blocker.
- No mobile navigation yet — sidebar is desktop-only for now.
```

- [ ] **Step 2: Update `## Next Session — Day 3` to `## Next Session — Day 4`**

Replace the `## Next Session — Day 3` block with:

```markdown
## Next Session — Day 4

**Plan file:** `docs/superpowers/plans/2026-06-30-day4-engine-scaffold.md` *(to be written)*

**Goal:** Python FastAPI engine scaffold — `apps/engine/` with Poetry, FastAPI, Uvicorn, basic health endpoint, Dockerfile, and wired into Docker Compose.

**Steps overview:**
1. Create `apps/engine/` with `pyproject.toml` (Poetry)
2. Scaffold `sentinel_engine/main.py` — FastAPI app with `/health` endpoint
3. Add `apps/engine/Dockerfile` (python:3.12-slim base)
4. Add `engine` service to `docker/docker-compose.yml`
5. Add `apps/engine/sentinel_engine/routers/` directory with one empty router per module
6. Write pytest tests: health endpoint returns `{"status": "ok"}`
7. Commit

**Architecture decisions locked in:**
- Engine: Python 3.12 + FastAPI + Uvicorn + Poetry
- Next.js app calls engine via internal HTTP (same Docker network)
- Engine port: 8000 (internal), not exposed in production
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day3): update session context for day 4 handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ Sidebar navigation with all 5 module links
- ✅ Top header with user avatar and sign-out button
- ✅ Module cards (Probe/Mirror/Guard/Cognify/Reach) with Coming Soon badge
- ✅ DashboardLayout as nested layout (wraps all `/dashboard/*` routes)
- ✅ TDD throughout — tests written before implementation in each task
- ✅ shadcn/ui Sheet, Separator, Avatar, Badge added

**Placeholder scan:** None found. All steps include exact code.

**Type consistency:**
- `Module` type exported from `@/lib/modules` — consumed in `ModuleCard`, `Sidebar`, `DashboardPage` ✅
- `Header` takes `user: { name?: string | null; email?: string | null }` — passed from `DashboardLayout` as `session.user ?? {}` ✅
- `ModuleCard` takes `module: Module` — called with items from `MODULES` ✅
- `Sidebar` takes optional `className?: string` — called without props in layout ✅
- `SignOutButton` takes no props ✅
