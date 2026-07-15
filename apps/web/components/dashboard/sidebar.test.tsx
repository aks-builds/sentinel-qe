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
