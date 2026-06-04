import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
}))

vi.mock('../constants', () => ({
  SEMVER_OPTIONS: { includePrerelease: true, loose: false },
}))

vi.mock('../utilities/exec', () => ({
  exec: vi.fn(),
}))

import { exec } from '../utilities/exec'
import { readTag, selectHighestTagFromOutput } from './read-tag'

describe('readTag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the highest semver tag', async () => {
    vi.mocked(exec).mockResolvedValue('v0.1.0\nv0.2.0\nv0.11.1\nv0.3.0')

    const result = await readTag()

    expect(result).toBe('v0.11.1')
  })

  it('filters out non-semver tags', async () => {
    vi.mocked(exec).mockResolvedValue('latest\nv1.0.0\nnightly\nv2.0.0')

    const result = await readTag()

    expect(result).toBe('v2.0.0')
  })

  it('returns undefined when no valid semver tags exist', async () => {
    vi.mocked(exec).mockResolvedValue('latest\nnightly')

    const result = await readTag()

    expect(result).toBeUndefined()
  })

  it('returns undefined when git tag output is empty', async () => {
    vi.mocked(exec).mockResolvedValue('')

    const result = await readTag()

    expect(result).toBeUndefined()
  })

  it('passes --merged flag when branch is provided', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0')

    await readTag('main')

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

    await readTag()

    expect(exec).toHaveBeenCalledWith('git', ['--no-pager', 'tag', '--list', '--sort=authordate'])
  })

  it('returns prerelease tags by default', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0\nv1.1.0-rc.1')

    const result = await readTag()

    expect(result).toBe('v1.1.0-rc.1')
  })

  it('can exclude prerelease tags', async () => {
    vi.mocked(exec).mockResolvedValue('v1.0.0\nv1.1.0-rc.1')

    const result = await readTag(undefined, { includePrerelease: false })

    expect(result).toBe('v1.0.0')
  })

  it('returns undefined when only prerelease tags exist and includePrerelease is false', async () => {
    vi.mocked(exec).mockResolvedValue('v1.1.0-rc.1\nv1.1.0-beta.1')

    const result = await readTag(undefined, { includePrerelease: false })

    expect(result).toBeUndefined()
  })

  it('rejects branch names with a leading dash before invoking git', async () => {
    await expect(readTag('-evil')).rejects.toThrow(/leading '-'/)
    expect(exec).not.toHaveBeenCalled()
  })

  it('throws actionable guidance when branch ref is not locally resolvable', async () => {
    vi.mocked(exec).mockRejectedValue(
      new Error(
        'Command failed with exit code 128: fatal: malformed object name renovate/all-minor-patch',
      ),
    )

    await expect(readTag('renovate/all-minor-patch')).rejects.toThrow(
      'Ensure checkout uses a branch ref',
    )
  })
})

describe('selectHighestTagFromOutput', () => {
  it('selects highest stable tag when prereleases are excluded', () => {
    expect(selectHighestTagFromOutput('v1.0.0\nv1.1.0-rc.1', { includePrerelease: false })).toBe(
      'v1.0.0',
    )
  })

  it('returns undefined for empty or non-semver output', () => {
    expect(selectHighestTagFromOutput('latest\nnightly')).toBeUndefined()
  })
})
