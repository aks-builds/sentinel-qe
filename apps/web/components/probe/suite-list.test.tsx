import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SuiteList } from './suite-list'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('SuiteList', () => {
  it('shows an empty state when there are no suites', () => {
    render(<SuiteList suites={[]} />)
    expect(screen.getByText(/no test suites yet/i)).toBeInTheDocument()
  })

  it('renders a link per suite pointing at its detail page', () => {
    render(
      <SuiteList
        suites={[
          { id: 'suite-1', name: 'Regression', module: 'probe', organizationId: 'org-1', createdAt: new Date('2026-07-24') },
        ]}
      />
    )
    const link = screen.getByRole('link', { name: /regression/i })
    expect(link).toHaveAttribute('href', '/dashboard/probe/suite-1')
  })
})
