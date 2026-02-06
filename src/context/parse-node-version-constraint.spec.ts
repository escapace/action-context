import { describe, expect, it } from 'vitest'
import { parseNodeVersionConstraint } from './parse-node-version-constraint'

describe('parseNodeVersionConstraint', () => {
  it('returns undefined for undefined input', () => {
    expect(parseNodeVersionConstraint(undefined)).toBeUndefined()
  })

  it('returns cleaned version for exact semver string', () => {
    expect(parseNodeVersionConstraint('22.15.0')).toBe('22.15.0')
  })

  it('cleans version strings with leading v', () => {
    expect(parseNodeVersionConstraint('v22.15.0')).toBe('22.15.0')
  })

  it('cleans version strings with surrounding whitespace', () => {
    expect(parseNodeVersionConstraint(' 22.15.0 ')).toBe('22.15.0')
  })

  it('returns minimum satisfying version for >= range', () => {
    expect(parseNodeVersionConstraint('>=22.15.0')).toBe('22.15.0')
  })

  it('returns minimum satisfying version for ^ range', () => {
    expect(parseNodeVersionConstraint('^22.15.0')).toBe('22.15.0')
  })

  it('returns minimum satisfying version for ~ range', () => {
    expect(parseNodeVersionConstraint('~22.15.0')).toBe('22.15.0')
  })

  it('returns minimum satisfying version for complex range', () => {
    expect(parseNodeVersionConstraint('>=20.0.0 <23.0.0')).toBe('20.0.0')
  })

  it('returns minimum satisfying version for || range', () => {
    expect(parseNodeVersionConstraint('>=18.0.0 || >=20.0.0')).toBe('18.0.0')
  })

  it('returns undefined for invalid string', () => {
    expect(parseNodeVersionConstraint('not-a-version')).toBeUndefined()
  })

  it('returns 0.0.0 for empty string (semver treats "" as "*")', () => {
    // semver.validRange('') returns '*', so minVersion is 0.0.0.
    // Callers guard against this: readInput converts '' to undefined,
    // and resolveInputs only passes defined values.
    expect(parseNodeVersionConstraint('')).toBe('0.0.0')
  })

  it('handles prerelease version strings', () => {
    expect(parseNodeVersionConstraint('22.15.0-rc.1')).toBe('22.15.0-rc.1')
  })

  it('handles major-only version via range', () => {
    expect(parseNodeVersionConstraint('>=22')).toBe('22.0.0')
  })
})
