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
