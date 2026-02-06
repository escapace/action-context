import { afterEach, describe, expect, it, vi } from 'vitest'
import * as core from '@actions/core'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
}))

import { readInput } from './read-input'

describe('readInput', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns the input value when core.getInput returns a non-empty string', () => {
    vi.mocked(core.getInput).mockReturnValue('my-token')

    expect(readInput('token')).toBe('my-token')
    expect(core.getInput).toHaveBeenCalledWith('token', undefined)
  })

  it('returns undefined when core.getInput returns empty string', () => {
    vi.mocked(core.getInput).mockReturnValue('')

    expect(readInput('token')).toBeUndefined()
  })

  it('passes options through to core.getInput', () => {
    vi.mocked(core.getInput).mockReturnValue('value')
    const options = { required: true }

    readInput('some-input', options)

    expect(core.getInput).toHaveBeenCalledWith('some-input', options)
  })
})
