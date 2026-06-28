export type ModuleStatus = 'active' | 'coming-soon'

export type ModuleId = 'probe' | 'mirror' | 'guard' | 'cognify' | 'reach'

export type Module = {
  id: ModuleId
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
