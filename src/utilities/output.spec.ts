import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  setOutput: vi.fn(),
}))

import * as core from '@actions/core'
import { setOutputs } from './output'

describe('setOutputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs and emits each output key/value pair', () => {
    setOutputs({
      'environment': 'testing',
      'latest': true,
      'pr-number': 95,
    })

    expect(core.info).toHaveBeenCalledWith('environment: testing')
    expect(core.info).toHaveBeenCalledWith('latest: true')
    expect(core.info).toHaveBeenCalledWith('pr-number: 95')

    expect(core.setOutput).toHaveBeenCalledWith('environment', 'testing')
    expect(core.setOutput).toHaveBeenCalledWith('latest', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 95)
  })
})
