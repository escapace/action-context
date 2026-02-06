import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

import { stat } from 'node:fs/promises'
import { isFile } from './is-files'

describe('isFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when path is a file', async () => {
    const fileStats = { isFile: () => true }
    vi.mocked(stat).mockResolvedValue(fileStats as never)

    expect(await isFile('package.json')).toBe(true)
    expect(stat).toHaveBeenCalledWith('package.json')
  })

  it('returns false when path is a directory', async () => {
    const directoryStats = { isFile: () => false }
    vi.mocked(stat).mockResolvedValue(directoryStats as never)

    expect(await isFile('src')).toBe(false)
  })

  it('returns false when stat throws', async () => {
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))

    expect(await isFile('nonexistent.txt')).toBe(false)
  })
})
