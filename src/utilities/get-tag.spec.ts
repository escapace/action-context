import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
}))

vi.mock('../constants', () => ({
  SEMVER_OPTIONS: { includePrerelease: true, loose: false },
}))

vi.mock('./exec', () => ({
  exec: vi.fn(),
}))

import { exec } from './exec'
import { getTag } from './get-tag'

describe('getTag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the highest semver tag', async () => {
    vi.mocked(exec).mockResolvedValue('v0.1.0\nv0.2.0\nv0.11.1\nv0.3.0')

    const result = await getTag()

    expect(result).toBe('v0.11.1')
  })

  it('filters out non-semver tags', async () => {
    vi.mocked(exec).mockResolvedValue('latest\nv1.0.0\nnightly\nv2.0.0')

    const result = await getTag()

    expect(result).toBe('v2.0.0')
  })

  it('returns undefined when no valid semver tags exist', async () => {
    vi.mocked(exec).mockResolvedValue('latest\nnightly')

    const result = await getTag()

    expect(result).toBeUndefined()
  })

  it('returns undefined when git tag output is empty', async () => {
    vi.mocked(exec).mockResolvedValue('')

    const result = await getTag()

    expect(result).toBeUndefined()
  })

  it('passes --merged flag when branch is provided', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0')

    await getTag('main')

    expect(exec).toHaveBeenCalledWith('git', [
      '--no-pager',
      'tag',
      '--list',
      '--sort=authordate',
      '--merged',
      'main',
    ])
  })

  it('does not pass --merged flag when no branch is provided', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0')

    await getTag()

    expect(exec).toHaveBeenCalledWith('git', ['--no-pager', 'tag', '--list', '--sort=authordate'])
  })

  it('returns prerelease tags by default', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0\nv1.1.0-rc.1')

    const result = await getTag()

    expect(result).toBe('v1.1.0-rc.1')
  })

  it('can exclude prerelease tags', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0\nv1.1.0-rc.1')

    const result = await getTag(undefined, { includePrerelease: false })

    expect(result).toBe('v1.0.0')
  })

  it('returns undefined when only prerelease tags exist and includePrerelease is false', async () => {
    vi.mocked(exec).mockResolvedValue('v1.1.0-rc.1\nv1.1.0-beta.1')

    const result = await getTag(undefined, { includePrerelease: false })

    expect(result).toBeUndefined()
  })

  it('throws actionable guidance when branch ref is not locally resolvable', async () => {
    vi.mocked(exec).mockRejectedValue(
      new Error(
        'Command failed with exit code 128: fatal: malformed object name renovate/all-minor-patch',
      ),
    )

    await expect(getTag('renovate/all-minor-patch')).rejects.toThrow(
      'Ensure checkout uses a branch ref',
    )
  })
})
