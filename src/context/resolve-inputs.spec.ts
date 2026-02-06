import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./read-input', () => ({
  readInput: vi.fn(),
}))

vi.mock('./parse-node-version-constraint', () => ({
  parseNodeVersionConstraint: vi.fn(),
}))

vi.mock('./parse-trusted-bots', () => ({
  parseTrustedBots: vi.fn(),
}))

import { readInput } from './read-input'
import { parseNodeVersionConstraint } from './parse-node-version-constraint'
import { parseTrustedBots } from './parse-trusted-bots'
import { resolveInputs } from './resolve-inputs'

const setupInputs = (inputs: Record<string, string | undefined>): void => {
  vi.mocked(readInput).mockImplementation((name: string) => inputs[name])
}

describe('resolveInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(parseNodeVersionConstraint).mockReturnValue(undefined)
    vi.mocked(parseTrustedBots).mockReturnValue(new Set())
  })

  it('returns validated inputs for event mode with no PR inputs', () => {
    setupInputs({ 'context-source': 'event', 'token': 'ghp_abc' })

    const result = resolveInputs()

    expect(result.contextSource).toBe('event')
    expect(result.token).toBe('ghp_abc')
    expect(result.prNumber).toBeUndefined()
    expect(result.prHeadRef).toBeUndefined()
    expect(result.prHeadSha).toBeUndefined()
  })

  it('returns validated inputs for pr mode with all PR inputs', () => {
    setupInputs({
      'context-source': 'pr',
      'pr-head-ref': 'feature/foo',
      'pr-head-sha': 'abc123',
      'pr-number': '42',
      'token': 'ghp_abc',
    })

    const result = resolveInputs()

    expect(result.contextSource).toBe('pr')
    expect(result.prNumber).toBe(42)
    expect(result.prHeadRef).toBe('feature/foo')
    expect(result.prHeadSha).toBe('abc123')
  })

  it('returns validated inputs for pr mode with only pr-number', () => {
    setupInputs({
      'context-source': 'pr',
      'pr-number': '10',
      'token': 'ghp_abc',
    })

    const result = resolveInputs()

    expect(result.contextSource).toBe('pr')
    expect(result.prNumber).toBe(10)
    expect(result.prHeadRef).toBeUndefined()
    expect(result.prHeadSha).toBeUndefined()
  })

  it('defaults context-source to event when not provided', () => {
    setupInputs({ token: 'ghp_abc' })

    const result = resolveInputs()

    expect(result.contextSource).toBe('event')
  })

  // ── PR inputs rejected in event mode ─────────────────────────────────

  it('throws when pr-number is provided with context-source=event', () => {
    setupInputs({
      'context-source': 'event',
      'pr-number': '42',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("'pr-number' is only valid with context-source='pr'")
  })

  it('throws when pr-head-ref is provided with context-source=event', () => {
    setupInputs({
      'context-source': 'event',
      'pr-head-ref': 'feature/foo',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("'pr-head-ref' is only valid with context-source='pr'")
  })

  it('throws when pr-head-sha is provided with context-source=event', () => {
    setupInputs({
      'context-source': 'event',
      'pr-head-sha': 'abc123',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("'pr-head-sha' is only valid with context-source='pr'")
  })

  it('throws when pr-number is provided with default (implicit event) context-source', () => {
    setupInputs({
      'pr-number': '42',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow("'pr-number' is only valid with context-source='pr'")
  })

  it('ignores whitespace-only pr-head-ref in event mode', () => {
    setupInputs({
      'context-source': 'event',
      'pr-head-ref': '   ',
      'token': 'ghp_abc',
    })

    const result = resolveInputs()

    expect(result.prHeadRef).toBeUndefined()
  })

  it('ignores whitespace-only pr-head-sha in event mode', () => {
    setupInputs({
      'context-source': 'event',
      'pr-head-sha': '   ',
      'token': 'ghp_abc',
    })

    const result = resolveInputs()

    expect(result.prHeadSha).toBeUndefined()
  })

  // ── Existing validation ──────────────────────────────────────────────

  it('throws when context-source=pr but pr-number is missing', () => {
    setupInputs({
      'context-source': 'pr',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("context-source='pr' requires a positive integer")
  })

  it('throws for invalid context-source value', () => {
    setupInputs({
      'context-source': 'invalid',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("Invalid context-source 'invalid'")
  })

  it('throws when token is missing', () => {
    setupInputs({})

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("Missing required input 'token'")
  })

  it('throws for non-numeric pr-number', () => {
    setupInputs({
      'context-source': 'pr',
      'pr-number': 'abc',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow('Expected a positive integer')
  })

  it('throws for zero pr-number', () => {
    setupInputs({
      'context-source': 'pr',
      'pr-number': '0',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow('Expected a positive integer')
  })

  it('throws for invalid node-version constraint', () => {
    vi.mocked(parseNodeVersionConstraint).mockReturnValue(undefined)

    setupInputs({
      'node-version': 'not-a-version',
      'token': 'ghp_abc',
    })

    expect(() => resolveInputs()).toThrow('[INPUT_INVALID]')
    expect(() => resolveInputs()).toThrow("Invalid node-version constraint: 'not-a-version'")
  })

  it('passes trusted-bots input to parseTrustedBots', () => {
    setupInputs({
      'token': 'ghp_abc',
      'trusted-bots': 'renovate[bot]\ndependabot[bot]',
    })

    const bots = new Set(['dependabot[bot]', 'renovate[bot]'])
    vi.mocked(parseTrustedBots).mockReturnValue(bots)

    const result = resolveInputs()

    expect(parseTrustedBots).toHaveBeenCalledWith('renovate[bot]\ndependabot[bot]')
    expect(result.trustedBots).toBe(bots)
  })
})
