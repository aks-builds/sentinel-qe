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
