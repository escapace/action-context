import { PullRequestActionError, isHttpStatus } from './error'
import type { Context } from '../types'
import type { PullRequestCommitMetadata } from './types'

/**
 * Determine whether a single commit is trusted.
 *
 * All commits must be signed (verified === true). Beyond that:
 * - Bot authors must be in the trusted-bots allowlist.
 * - Human authors must have write or admin permission on the repo.
 * - Null authors (unresolvable email) are never trusted.
 */
export const isCommitTrusted = (
  commit: PullRequestCommitMetadata,
  trustedBots: Set<string>,
  collaboratorPermissions: Map<string, string>,
): boolean => {
  // Null author — unresolvable commit email
  if (commit.author === null) return false

  // All commits must be signed
  if (commit.verification?.verified !== true) return false

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
 * Determine whether all PR commits are trusted.
 *
 * Steps:
 * 1. For each unique human author, check collaborator permission.
 * 2. Evaluate each commit against the trust model.
 *
 * Commits are provided by the caller to avoid duplicate API fetches
 * when other consumers (e.g., conventional commit validation) also
 * need commit data.
 */
export const resolveCommitVerification = async (
  context: Context,
  commits: PullRequestCommitMetadata[],
): Promise<boolean> => {
  const { inputs, octokit, repositoryName, repositoryOwner } = context

  const trustedBots = inputs.trustedBots

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
        owner: repositoryOwner,
        repo: repositoryName,
        username: login,
      })

      collaboratorPermissions.set(login, response.data.permission)
    } catch (error: unknown) {
      if (isHttpStatus(error, 403)) {
        throw new PullRequestActionError(
          'PR_COLLABORATOR_PERMISSION_UNREADABLE',
          'Unable to read collaborator permissions for commit authors. Ensure the token has repository metadata access.',
        )
      }

      if (isHttpStatus(error, 404)) {
        // User is not a collaborator of this repository.
        collaboratorPermissions.set(login, 'none')
        continue
      }

      throw error
    }
  }

  // Evaluate every commit
  return commits.every((commit) => isCommitTrusted(commit, trustedBots, collaboratorPermissions))
}
