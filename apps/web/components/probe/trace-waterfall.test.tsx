import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TraceWaterfall } from './trace-waterfall'

const ROOT = {
  spanId: 's1',
  parentSpanId: '',
  name: 'root-run',
  startTime: '2026-07-24 05:00:00.000',
  endTime: '2026-07-24 05:00:01.000',
}
const CHILD = {
  spanId: 's2',
  parentSpanId: 's1',
  name: 'tool_call:search',
  startTime: '2026-07-24 05:00:00.200',
  endTime: '2026-07-24 05:00:00.400',
}

describe('TraceWaterfall', () => {
  it('shows an empty-state message when there are no spans', () => {
    render(<TraceWaterfall spans={[]} />)
    expect(screen.getByText(/no spans found/i)).toBeInTheDocument()
  })

  it('renders one row per span with its name and duration in ms', () => {
    render(<TraceWaterfall spans={[ROOT, CHILD]} />)
    expect(screen.getByText('root-run')).toBeInTheDocument()
    expect(screen.getByText('tool_call:search')).toBeInTheDocument()
    expect(screen.getByText('1000ms')).toBeInTheDocument()
    expect(screen.getByText('200ms')).toBeInTheDocument()
  })

  it('indents a child span further than its parent', () => {
    render(<TraceWaterfall spans={[ROOT, CHILD]} />)
    const rootRow = screen.getByText('root-run')
    const childRow = screen.getByText('tool_call:search')
    const rootIndent = parseInt(rootRow.style.paddingLeft || '0', 10)
    const childIndent = parseInt(childRow.style.paddingLeft || '0', 10)
    expect(childIndent).toBeGreaterThan(rootIndent)
  })

  it('orders rows by start time regardless of input order', () => {
    render(<TraceWaterfall spans={[CHILD, ROOT]} />)
    const names = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(names[0]).toContain('root-run')
    expect(names[1]).toContain('tool_call:search')
  })

  it('renders a critique action for every span row', () => {
    render(<TraceWaterfall spans={[ROOT, CHILD]} />)
    expect(screen.getAllByRole('button', { name: /critique this span/i })).toHaveLength(2)
  })
})
