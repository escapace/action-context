import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
}))

vi.mock('changelogithub', () => ({
  generate: vi.fn(),
  hasTagOnGitHub: vi.fn(),
  isRepoShallow: vi.fn(),
}))

import * as core from '@actions/core'
import { generate, hasTagOnGitHub, isRepoShallow } from 'changelogithub'
import { getChangelog } from './get-changelog'

describe('getChangelog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns markdown output on successful generation', async () => {
    const generateResult = {
      commits: [{ message: 'feat: something' }],
      config: { to: 'v1.0.0', token: 'ghp_test' },
      output: '## v1.0.0\n\n- feat: something',
    }
    vi.mocked(generate).mockResolvedValue(generateResult as never)
    vi.mocked(hasTagOnGitHub).mockResolvedValue(true)

    const result = await getChangelog({ prerelease: false, token: 'ghp_test' })

    expect(result).toBe('## v1.0.0\n\n- feat: something')
  })

  it('passes options to generate', async () => {
    const generateResult = {
      commits: [{ message: 'fix: bug' }],
      config: { to: 'v1.0.0', token: 'ghp_test' },
      output: 'changelog',
    }
    vi.mocked(generate).mockResolvedValue(generateResult as never)
    vi.mocked(hasTagOnGitHub).mockResolvedValue(true)

    await getChangelog({ prerelease: true, token: 'ghp_test' })

    expect(generate).toHaveBeenCalledWith({
      capitalize: false,
      contributors: false,
      emoji: false,
      prerelease: true,
      style: 'markdown',
      token: 'ghp_test',
    })
  })

  it('warns and returns undefined when token is missing', async () => {
    const generateResult = {
      commits: [],
      config: { to: 'v1.0.0', token: '' },
      output: '',
    }
    vi.mocked(generate).mockResolvedValue(generateResult as never)

    const result = await getChangelog({ prerelease: false, token: 'ghp_test' })

    expect(result).toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith('no GitHub token found')
  })

  it('warns and returns undefined when tag is not on GitHub', async () => {
    const generateResult = {
      commits: [{ message: 'feat: something' }],
      config: { to: 'v1.0.0', token: 'ghp_test' },
      output: 'changelog',
    }
    vi.mocked(generate).mockResolvedValue(generateResult as never)
    vi.mocked(hasTagOnGitHub).mockResolvedValue(false)

    const result = await getChangelog({ prerelease: false, token: 'ghp_test' })

    expect(result).toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('not available as tags on GitHub'),
    )
  })

  it('warns and returns undefined when repo is shallow with no commits', async () => {
    const generateResult = {
      commits: [],
      config: { to: 'v1.0.0', token: 'ghp_test' },
      output: '',
    }
    vi.mocked(generate).mockResolvedValue(generateResult as never)
    vi.mocked(hasTagOnGitHub).mockResolvedValue(true)
    vi.mocked(isRepoShallow).mockResolvedValue(true)

    const result = await getChangelog({ prerelease: false, token: 'ghp_test' })

    expect(result).toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('shallowly'))
  })

  it('warns and returns undefined when generate throws', async () => {
    vi.mocked(generate).mockRejectedValue(new Error('network error'))

    const result = await getChangelog({ prerelease: false, token: 'ghp_test' })

    expect(result).toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith('network error')
  })
})
