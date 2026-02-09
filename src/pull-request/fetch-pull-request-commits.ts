import { rethrowMissingPermissionOnHttpStatus } from './error'
import { paginateRest } from './paginate-rest'
import type { BaseContext, PullRequestCommitMetadata } from './types'

/**
 * Fetches all commits for a pull request and returns normalized commit metadata.
 */
export const fetchPullRequestCommits = async (
  context: BaseContext,
  prNumber: number,
): Promise<PullRequestCommitMetadata[]> => {
  const { octokit, repositoryName, repositoryOwner } = context

  try {
    return await paginateRest(async (page, perPage) => {
      const response = await octokit.rest.pulls.listCommits({
        owner: repositoryOwner,
        page,
        per_page: perPage,
        pull_number: prNumber,
        repo: repositoryName,
      })

      return response.data.map((item) => ({
        author:
          item.author !== null && item.author !== undefined
            ? { login: item.author.login, type: item.author.type ?? 'User' }
            : null,
        authorDate: item.commit.author?.date ?? null,
        committerDate: item.commit.committer?.date ?? null,
        sha: item.sha,
        verification:
          item.commit.verification !== null && item.commit.verification !== undefined
            ? { verified: item.commit.verification.verified }
            : null,
      }))
    })
  } catch (error: unknown) {
    rethrowMissingPermissionOnHttpStatus(error, 'pull-requests')

    throw error
  }
}
