import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPush = vi.fn()

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email input, password input, and submit button', async () => {
    const { default: LoginPage } = await import('./page')
    render(<LoginPage />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an error message when credentials are invalid', async () => {
    const { signIn } = await import('next-auth/react')
    vi.mocked(signIn).mockResolvedValueOnce({ error: 'CredentialsSignin', code: undefined, ok: false, status: 401, url: null })

    const { default: LoginPage } = await import('./page')
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'bad@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
  })

  it('redirects to dashboard on successful sign in', async () => {
    const { signIn } = await import('next-auth/react')
    vi.mocked(signIn).mockResolvedValueOnce({ error: undefined, code: undefined, ok: true, status: 200, url: '/dashboard' })

    const { default: LoginPage } = await import('./page')
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'correctpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })
})
