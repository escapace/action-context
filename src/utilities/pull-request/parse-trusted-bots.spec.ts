import { describe, expect, it } from 'vitest'
import { parseTrustedBots } from './parse-trusted-bots'

describe('parseTrustedBots', () => {
  it('returns an empty set for undefined input', () => {
    expect(parseTrustedBots(undefined)).toEqual(new Set())
  })

  it('returns an empty set for empty string', () => {
    expect(parseTrustedBots('')).toEqual(new Set())
  })

  it('parses a single bot login', () => {
    expect(parseTrustedBots('renovate[bot]')).toEqual(new Set(['renovate[bot]']))
  })

  it('parses multiple bot logins', () => {
    const input = 'renovate[bot]\ndependabot[bot]'
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })

  it('trims whitespace from each line', () => {
    const input = '  renovate[bot]  \n  dependabot[bot]  '
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })

  it('ignores blank lines', () => {
    const input = 'renovate[bot]\n\n\ndependabot[bot]\n'
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })

  it('ignores lines that are only whitespace', () => {
    const input = 'renovate[bot]\n   \ndependabot[bot]'
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })

  it('deduplicates repeated logins', () => {
    const input = 'renovate[bot]\nrenovate[bot]'
    expect(parseTrustedBots(input)).toEqual(new Set(['renovate[bot]']))
  })

  it('normalizes logins to lowercase', () => {
    const input = 'Renovate[Bot]\nDEPENDABOT[bot]'
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })

  it('handles YAML multiline string with trailing newline', () => {
    // YAML `|` block scalar adds a trailing newline
    const input = 'renovate[bot]\ndependabot[bot]\n'
    expect(parseTrustedBots(input)).toEqual(new Set(['dependabot[bot]', 'renovate[bot]']))
  })
})
