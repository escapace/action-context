import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'escapace', repo: 'action-context' },
  },
}))

import { getLastCommitAgeMinute } from './get-last-commit-age-minute'
import type { Octokit } from './types'

const createMockOctokit = (listCommits: ReturnType<typeof vi.fn>): Octokit => {
  const octokit = {
    rest: {
      pulls: {
        listCommits,
      },
    },
  }

  return octokit as never
}

describe('getLastCommitAgeMinute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes elapsed full minutes from committer date', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            commit: {
              author: { date: '2026-02-07T07:52:16Z' },
              committer: { date: '2026-02-07T07:52:16Z' },
            },
            sha: 'headsha',
          },
        ],
      }),
    )

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-08T03:48:44Z')),
    ).resolves.toBe(1196)
  })

  it('uses head sha selection instead of relying on list order', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            commit: {
              author: { date: '2026-02-07T09:00:00Z' },
              committer: { date: '2026-02-07T09:00:00Z' },
            },
            sha: 'headsha',
          },
          {
            commit: {
              author: { date: '2026-02-07T10:00:00Z' },
              committer: { date: '2026-02-07T10:00:00Z' },
            },
            sha: 'othersha',
          },
        ],
      }),
    )

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-07T11:00:00Z')),
    ).resolves.toBe(120)
  })

  it('falls back to author date when committer date is missing', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            commit: { author: { date: '2026-02-07T08:30:00Z' }, committer: { date: null } },
            sha: 'headsha',
          },
        ],
      }),
    )

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-07T09:00:00Z')),
    ).resolves.toBe(30)
  })

  it('parses timezone offsets correctly', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            commit: { author: { date: '2026-02-07T10:00:00+02:00' }, committer: { date: null } },
            sha: 'headsha',
          },
        ],
      }),
    )

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-07T09:00:00Z')),
    ).resolves.toBe(60)
  })

  it('clamps negative durations to zero', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            commit: {
              author: { date: '2026-02-07T11:00:00Z' },
              committer: { date: '2026-02-07T11:00:00Z' },
            },
            sha: 'headsha',
          },
        ],
      }),
    )

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-07T10:00:00Z')),
    ).resolves.toBe(0)
  })

  it('paginates through commit list responses', async () => {
    const listCommits = vi
      .fn()
      .mockResolvedValueOnce({
        data: new Array(100).fill(0).map((_, index) => ({
          commit: {
            author: { date: '2026-02-07T08:00:00Z' },
            committer: { date: '2026-02-07T08:00:00Z' },
          },
          sha: `sha-${index}`,
        })),
      })
      .mockResolvedValueOnce({
        data: [
          {
            commit: {
              author: { date: '2026-02-07T09:00:00Z' },
              committer: { date: '2026-02-07T09:00:00Z' },
            },
            sha: 'headsha',
          },
        ],
      })

    const octokit = createMockOctokit(listCommits)

    await expect(
      getLastCommitAgeMinute(octokit, 115, 'headsha', Date.parse('2026-02-07T10:00:00Z')),
    ).resolves.toBe(60)

    expect(listCommits).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ page: 1, per_page: 100, pull_number: 115 }),
    )
    expect(listCommits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2, per_page: 100, pull_number: 115 }),
    )
  })

  it('throws descriptive permission error on 403', async () => {
    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(vi.fn().mockRejectedValue(error))

    await expect(getLastCommitAgeMinute(octokit, 115, 'headsha')).rejects.toThrow(
      'Missing `pull-requests: read` permission',
    )
  })
})
