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
