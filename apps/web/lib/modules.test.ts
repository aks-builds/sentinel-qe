import { describe, it, expect } from 'vitest'
import { MODULES } from './modules'

describe('MODULES', () => {
  it('has exactly 5 modules', () => {
    expect(MODULES).toHaveLength(5)
  })

  it('each module has all required fields', () => {
    for (const m of MODULES) {
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.description).toBeTruthy()
      expect(m.href).toMatch(/^\/dashboard\//)
      expect(['active', 'coming-soon']).toContain(m.status)
    }
  })

  it('module ids are probe, mirror, guard, cognify, reach in order', () => {
    expect(MODULES.map((m) => m.id)).toEqual([
      'probe',
      'mirror',
      'guard',
      'cognify',
      'reach',
    ])
  })
})
