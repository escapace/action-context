import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

import { execa } from 'execa'
import { exec } from './exec'

describe('exec', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns trimmed stdout from the command', async () => {
    const resolved = { stdout: 'output text' }
    vi.mocked(execa).mockResolvedValue(resolved as never)

    const result = await exec('git', ['status'])

    expect(result).toBe('output text')
    expect(execa).toHaveBeenCalledWith('git', ['status'])
  })

  it('trims whitespace from stdout', async () => {
    const resolved = { stdout: '  output with spaces  \n' }
    vi.mocked(execa).mockResolvedValue(resolved as never)

    const result = await exec('echo', ['hello'])

    expect(result).toBe('output with spaces')
  })
})
