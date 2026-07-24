import { describe, it, expect } from 'vitest'
import { validateSchema } from './schema'

describe('validateSchema', () => {
  it('returns no errors for a valid object', () => {
    const schema = {
      type: 'object',
      required: ['orderId'],
      properties: { orderId: { type: 'string' } },
    }
    expect(validateSchema(schema, { orderId: '12345' })).toEqual([])
  })

  it('reports a missing required property', () => {
    const schema = { type: 'object', required: ['orderId'], properties: {} }
    expect(validateSchema(schema, {})).toEqual(['root.orderId: required property missing'])
  })

  it('reports a type mismatch', () => {
    const schema = { type: 'string' }
    expect(validateSchema(schema, 42)).toEqual(["root: expected type 'string', got 'integer'"])
  })

  it('reports an enum violation', () => {
    const schema = { type: 'string', enum: ['open', 'closed'] }
    expect(validateSchema(schema, 'pending')).toEqual([
      'root: value "pending" not in enum ["open","closed"]',
    ])
  })

  it('validates nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          required: ['zip'],
          properties: { zip: { type: 'string' } },
        },
      },
    }
    expect(validateSchema(schema, { address: {} })).toEqual([
      'root.address.zip: required property missing',
    ])
  })

  it('validates array items', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(validateSchema(schema, ['a', 2, 'c'])).toEqual([
      "root[1]: expected type 'string', got 'integer'",
    ])
  })

  it('always passes when the schema has no type constraint', () => {
    expect(validateSchema({}, 'anything')).toEqual([])
  })
})
