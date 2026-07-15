import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ModulePlaceholderPage } from './module-placeholder-page'

describe('ModulePlaceholderPage', () => {
  it('renders the module name, description, and a coming-soon note', () => {
    render(<ModulePlaceholderPage moduleId="probe" />)
    expect(screen.getByRole('heading', { name: 'Probe' })).toBeInTheDocument()
    expect(screen.getByText(/Test AI agents you build/)).toBeInTheDocument()
    expect(screen.getByText('Coming soon.')).toBeInTheDocument()
  })
})
