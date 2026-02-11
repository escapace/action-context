import { describe, expect, it } from 'vitest'
import { ensureCase } from './ensure-case'

describe('ensureCase', () => {
  it('validates lower-case values', () => {
    expect(ensureCase('feat', 'lower-case')).toBe(true)
    expect(ensureCase('Feat', 'lower-case')).toBe(false)
  })

  it('validates start-case and sentence-case values', () => {
    expect(ensureCase('Start Case', 'start-case')).toBe(true)
    expect(ensureCase('Start case', 'start-case')).toBe(false)

    expect(ensureCase('Sentence case', 'sentence-case')).toBe(true)
    expect(ensureCase('sentence case', 'sentence-case')).toBe(false)
  })

  it('validates pascal-case and upper-case values', () => {
    expect(ensureCase('PascalCase', 'pascal-case')).toBe(true)
    expect(ensureCase('pascalCase', 'pascal-case')).toBe(false)

    expect(ensureCase('UPPER CASE', 'upper-case')).toBe(true)
    expect(ensureCase('Upper Case', 'upper-case')).toBe(false)
  })

  it('ignores quoted text and leading numeric values (commitlint parity)', () => {
    expect(ensureCase('`Eslint` Configuration', 'sentence-case')).toBe(true)
    expect(ensureCase('123 no letters first', 'upper-case')).toBe(true)
  })
})
