import * as github from '@actions/github'
import type { Octokit, PullRequestCommit } from './types'

/**
 * Determine whether a single commit is trusted.
 *
 * All commits must be signed (verified === true). Beyond that:
 * - Bot authors must be in the trusted-bots allowlist.
 * - Human authors must have write or admin permission on the repo.
 * - Null authors (unresolvable email) are never trusted.
 */
export const isCommitTrusted = (
  commit: PullRequestCommit,
  trustedBots: Set<string>,
  collaboratorPermissions: Map<string, string>,
): boolean => {
  // Null author — unresolvable commit email
  if (commit.author === null) return false

  // All commits must be signed
  if (commit.commit.verification?.verified !== true) return false

  // Bot author — must be in allowlist
  if (commit.author.type === 'Bot') {
    return trustedBots.has(commit.author.login.toLowerCase())
  }

  // Human author — must have write access
  if (commit.author.type === 'User') {
    const permission = collaboratorPermissions.get(commit.author.login)

    return permission === 'admin' || permission === 'write'
  }

  // Unknown author type
  return false
}

/**
 * Fetch PR commits and determine whether all are trusted.
 *
 * Steps:
 * 1. Fetch all commits on the PR via REST pulls.listCommits.
 * 2. For each unique human author, check collaborator permission.
 * 3. Evaluate each commit against the trust model.
 */
export const getCommitsTrusted = async (
  octokit: Octokit,
  prNumber: number,
  trustedBots: Set<string>,
): Promise<boolean> => {
  const { owner, repo } = github.context.repo

  // Fetch all commits (paginated)
  const commits: PullRequestCommit[] = []

  let page = 1

  try {
    while (true) {
      const response = await octokit.rest.pulls.listCommits({
        owner,
        page,
        per_page: 100,
        pull_number: prNumber,
        repo,
      })

      for (const item of response.data) {
        commits.push({
          author:
            item.author !== null && item.author !== undefined
              ? { login: item.author.login, type: item.author.type ?? 'User' }
              : null,
          commit: {
            verification:
              item.commit.verification !== null && item.commit.verification !== undefined
                ? { verified: item.commit.verification.verified }
                : null,
          },
        })
      }

      if (response.data.length < 100) {
        break
      }

      page++
    }
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      )
    }

    throw error
  }

  // No commits is unexpected but not trusted
  if (commits.length === 0) return false

  // Collect unique human author logins that need permission checks
  const humanAuthors = new Set<string>()

  for (const commit of commits) {
    if (commit.author !== null && commit.author.type === 'User') {
      humanAuthors.add(commit.author.login)
    }
  }

  // Fetch collaborator permissions for all unique human authors
  const collaboratorPermissions = new Map<string, string>()

  for (const login of humanAuthors) {
    try {
      const response = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username: login,
      })

      collaboratorPermissions.set(login, response.data.permission)
    } catch (error: unknown) {
      if (error !== null && typeof error === 'object' && 'status' in error) {
        if (error.status === 403) {
          throw new Error(
            'Unable to read collaborator permissions for commit authors. Ensure the token has repository metadata access.',
          )
        }

        if (error.status === 404) {
          // User is not a collaborator of this repository.
          collaboratorPermissions.set(login, 'none')
          continue
        }
      }

      throw error
    }
  }

  // Evaluate every commit
  return commits.every((commit) => isCommitTrusted(commit, trustedBots, collaboratorPermissions))
}
