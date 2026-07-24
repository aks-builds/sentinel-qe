export function validateSchema(
  schema: Record<string, unknown>,
  value: unknown,
  path = 'root'
): string[] {
  const errors: string[] = []
  const expectedType = schema.type as string | undefined

  if (expectedType !== undefined && !matchesType(value, expectedType)) {
    errors.push(`${path}: expected type '${expectedType}', got '${typeName(value)}'`)
    return errors
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(
      `${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`
    )
  }

  if (expectedType === 'object' && isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key}: required property missing`)
    }

    const properties = isPlainObject(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {}
    for (const [key, subSchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(
          ...validateSchema(subSchema as Record<string, unknown>, value[key], `${path}.${key}`)
        )
      }
    }
  }

  if (expectedType === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(
        ...validateSchema(schema.items as Record<string, unknown>, item, `${path}[${index}]`)
      )
    })
  }

  return errors
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matchesType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isPlainObject(value)
    case 'array':
      return Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}
