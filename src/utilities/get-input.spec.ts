import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
}))

import * as core from '@actions/core'
import { getInput } from './get-input'

describe('getInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the input value when non-empty', () => {
    vi.mocked(core.getInput).mockReturnValue('my-token')

    expect(getInput('token')).toBe('my-token')
    expect(core.getInput).toHaveBeenCalledWith('token', undefined)
  })

  it('returns undefined when core.getInput returns empty string', () => {
    vi.mocked(core.getInput).mockReturnValue('')

    expect(getInput('token')).toBeUndefined()
  })

  it('passes options through to core.getInput', () => {
    vi.mocked(core.getInput).mockReturnValue('value')
    const options = { required: true }

    getInput('name', options)

    expect(core.getInput).toHaveBeenCalledWith('name', options)
  })
})
