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
