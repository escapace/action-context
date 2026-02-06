import { describe, expect, it } from 'vitest'
import { createShortCommit } from './create-short-commit'

describe('createShortCommit', () => {
  it('returns first 7 characters of a normal SHA', () => {
    expect(createShortCommit('f2e1fe5abc1234567890')).toBe('f2e1fe5')
  })

  it('returns first 7 characters when SHA does not start with 0', () => {
    expect(createShortCommit('abcdef1234567890')).toBe('abcdef1')
  })

  it('extends past 7 characters to first letter when SHA starts with 0', () => {
    expect(createShortCommit('0000000a1234567890')).toBe('0000000a')
  })

  it('returns 7 characters when SHA starts with 0 and has letter within first 7', () => {
    expect(createShortCommit('00a0000b1234567890')).toBe('00a0000')
  })

  it('handles SHA starting with 0 where letter is at index 1', () => {
    expect(createShortCommit('0a12345678901234')).toBe('0a12345')
  })

  it('handles exactly 7 character input', () => {
    expect(createShortCommit('abcdef1')).toBe('abcdef1')
  })
})
