import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Octokit, PullRequestCommit } from './types'
import { isCommitTrusted } from './get-commits-trusted'

const trustedBots = new Set(['dependabot[bot]', 'renovate[bot]'])
const emptyBots = new Set<string>()

const writePermissions = new Map([['yyxi', 'write']])
const adminPermissions = new Map([['yyxi', 'admin']])
const readPermissions = new Map([['yyxi', 'read']])
const noPermissions = new Map<string, string>()

const signedBotCommit = (login: string): PullRequestCommit => ({
  author: { login, type: 'Bot' },
  commit: { verification: { verified: true } },
})

const unsignedBotCommit = (login: string): PullRequestCommit => ({
  author: { login, type: 'Bot' },
  commit: { verification: { verified: false } },
})

const signedHumanCommit = (login: string): PullRequestCommit => ({
  author: { login, type: 'User' },
  commit: { verification: { verified: true } },
})

const unsignedHumanCommit = (login: string): PullRequestCommit => ({
  author: { login, type: 'User' },
  commit: { verification: { verified: false } },
})

const nullAuthorCommit: PullRequestCommit = {
  author: null,
  commit: { verification: { verified: true } },
}

describe('isCommitTrusted', () => {
  it('S1: signed bot in allowlist → true', () => {
    expect(isCommitTrusted(signedBotCommit('renovate[bot]'), trustedBots, noPermissions)).toBe(true)
  })

  it('matches bot logins case-insensitively', () => {
    expect(isCommitTrusted(signedBotCommit('Renovate[Bot]'), trustedBots, noPermissions)).toBe(true)
  })

  it('S2: signed bot NOT in allowlist → false', () => {
    expect(isCommitTrusted(signedBotCommit('renovate[bot]'), emptyBots, noPermissions)).toBe(false)
  })

  it('S3: signed bot, allowlist is empty → false', () => {
    expect(isCommitTrusted(signedBotCommit('dependabot[bot]'), emptyBots, noPermissions)).toBe(
      false,
    )
  })

  it('S7: human commit, signed, write access → true', () => {
    expect(isCommitTrusted(signedHumanCommit('yyxi'), trustedBots, writePermissions)).toBe(true)
  })

  it('S7b: human commit, signed, admin access → true', () => {
    expect(isCommitTrusted(signedHumanCommit('yyxi'), trustedBots, adminPermissions)).toBe(true)
  })

  it('S8: human commit, unsigned, write access → false', () => {
    expect(isCommitTrusted(unsignedHumanCommit('yyxi'), trustedBots, writePermissions)).toBe(false)
  })

  it('S9: human commit, signed, read-only access → false', () => {
    expect(isCommitTrusted(signedHumanCommit('yyxi'), trustedBots, readPermissions)).toBe(false)
  })

  it('S10: null author → false', () => {
    expect(isCommitTrusted(nullAuthorCommit, trustedBots, noPermissions)).toBe(false)
  })

  it('S11: human spoofs bot email, unsigned → false', () => {
    expect(isCommitTrusted(unsignedBotCommit('renovate[bot]'), trustedBots, noPermissions)).toBe(
      false,
    )
  })

  it('S13: unknown bot not in allowlist → false', () => {
    expect(isCommitTrusted(signedBotCommit('some-other[bot]'), trustedBots, noPermissions)).toBe(
      false,
    )
  })

  it('S14: malicious installed app, not in allowlist → false', () => {
    expect(isCommitTrusted(signedBotCommit('evil-app[bot]'), trustedBots, noPermissions)).toBe(
      false,
    )
  })

  it('S15: bot in allowlist but commit is unsigned → false', () => {
    expect(isCommitTrusted(unsignedBotCommit('renovate[bot]'), trustedBots, noPermissions)).toBe(
      false,
    )
  })

  it('unknown author type → false', () => {
    const commit: PullRequestCommit = {
      author: { login: 'ghost', type: 'Organization' },
      commit: { verification: { verified: true } },
    }

    expect(isCommitTrusted(commit, trustedBots, noPermissions)).toBe(false)
  })

  it('null verification → false', () => {
    const commit: PullRequestCommit = {
      author: { login: 'yyxi', type: 'User' },
      commit: { verification: null },
    }

    expect(isCommitTrusted(commit, trustedBots, writePermissions)).toBe(false)
  })

  it('human author not in permissions map → false', () => {
    expect(isCommitTrusted(signedHumanCommit('yyxi'), trustedBots, noPermissions)).toBe(false)
  })
})

const createMockOctokit = (
  listCommits: ReturnType<typeof vi.fn>,
  getCollaboratorPermissionLevel: ReturnType<typeof vi.fn>,
): Octokit => {
  const octokit = {
    rest: {
      pulls: { listCommits },
      repos: { getCollaboratorPermissionLevel },
    },
  }

  return octokit as never
}

describe('getCommitsTrusted', () => {
  const originalEnvironment = process.env.GITHUB_REPOSITORY

  beforeEach(() => {
    vi.resetModules()
    process.env.GITHUB_REPOSITORY = 'escapace/action-context'
  })

  afterEach(() => {
    if (originalEnvironment === undefined) {
      delete process.env.GITHUB_REPOSITORY
    } else {
      process.env.GITHUB_REPOSITORY = originalEnvironment
    }
  })

  it('returns true for a pure bot PR with trusted signed commits', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'renovate[bot]', type: 'Bot' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      vi.fn(),
    )

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(true)
  })

  it('returns false for a bot PR with untrusted bot', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'renovate[bot]', type: 'Bot' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      vi.fn(),
    )

    expect(await getCommitsTrusted(octokit, 95, emptyBots)).toBe(false)
  })

  it('checks collaborator permissions for human authors', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const getCollaboratorPermissionLevel = vi.fn().mockResolvedValue({
      data: { permission: 'write' },
    })

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'renovate[bot]', type: 'Bot' },
            commit: { verification: { verified: true } },
          },
          {
            author: { login: 'yyxi', type: 'User' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      getCollaboratorPermissionLevel,
    )

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(true)
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({
      owner: 'escapace',
      repo: 'action-context',
      username: 'yyxi',
    })
  })

  it('returns false when human author has read-only access', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'yyxi', type: 'User' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      vi.fn().mockResolvedValue({ data: { permission: 'read' } }),
    )

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(false)
  })

  it('returns false for empty commit list', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const octokit = createMockOctokit(vi.fn().mockResolvedValue({ data: [] }), vi.fn())

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(false)
  })

  it('deduplicates permission checks for repeated human authors', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const getCollaboratorPermissionLevel = vi.fn().mockResolvedValue({
      data: { permission: 'write' },
    })

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'yyxi', type: 'User' },
            commit: { verification: { verified: true } },
          },
          {
            author: { login: 'yyxi', type: 'User' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      getCollaboratorPermissionLevel,
    )

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(true)
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledTimes(1)
  })

  it('does not call permission endpoint for pure bot PRs', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const getCollaboratorPermissionLevel = vi.fn()

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'renovate[bot]', type: 'Bot' },
            commit: { verification: { verified: true } },
          },
          {
            author: { login: 'dependabot[bot]', type: 'Bot' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      getCollaboratorPermissionLevel,
    )

    expect(await getCommitsTrusted(octokit, 95, trustedBots)).toBe(true)
    expect(getCollaboratorPermissionLevel).not.toHaveBeenCalled()
  })

  it('throws descriptive error on 403 from listCommits', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(vi.fn().mockRejectedValue(error), vi.fn())

    await expect(getCommitsTrusted(octokit, 95, trustedBots)).rejects.toThrow(
      'Missing `pull-requests: read` permission',
    )
  })

  it('throws descriptive error on 403 from collaborator permission endpoint', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const error = new Error('Forbidden')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          { author: { login: 'yyxi', type: 'User' }, commit: { verification: { verified: true } } },
        ],
      }),
      vi.fn().mockRejectedValue(error),
    )

    await expect(getCommitsTrusted(octokit, 95, trustedBots)).rejects.toThrow(
      'Unable to read collaborator permissions for commit authors',
    )
  })

  it('treats 404 from collaborator permission endpoint as untrusted author', async () => {
    const { getCommitsTrusted } = await import('./get-commits-trusted')

    const error = new Error('Not Found')
    Reflect.set(error, 'status', 404)

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: [
          {
            author: { login: 'external-user', type: 'User' },
            commit: { verification: { verified: true } },
          },
        ],
      }),
      vi.fn().mockRejectedValue(error),
    )

    await expect(getCommitsTrusted(octokit, 95, trustedBots)).resolves.toBe(false)
  })
})
