import { rethrowMissingPermissionOnHttpStatus } from './error'
import type { BaseContext, Octokit, PullRequestData } from './types'

const MERGEABLE_RETRY_ATTEMPTS = 3
const MERGEABLE_RETRY_DELAY_MS = 1000

const sleep = async (ms: number) => await new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetch basic PR metadata from REST `pulls.get`.
 *
 * GitHub may return `mergeable: null` while computing mergeability.
 * This function retries with backoff until a definitive value is returned
 * or attempts are exhausted (in which case mergeable defaults to `false`).
 */
export const getPullRequest = async (
  context: BaseContext,
  prNumber: number,
): Promise<PullRequestData> => {
  const { octokit, repositoryName, repositoryOwner } = context

  let mergeable: boolean | null = null

  let data: Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data'] | undefined

  for (let attempt = 0; attempt < MERGEABLE_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(MERGEABLE_RETRY_DELAY_MS)
    }

    let response: Awaited<ReturnType<Octokit['rest']['pulls']['get']>>

    try {
      response = await octokit.rest.pulls.get({
        owner: repositoryOwner,
        pull_number: prNumber,
        repo: repositoryName,
      })
    } catch (error: unknown) {
      rethrowMissingPermissionOnHttpStatus(error, 'pull-requests')

      throw error
    }

    data = response.data
    mergeable = data.mergeable

    if (mergeable !== null) {
      break
    }
  }

  if (data === undefined) {
    throw new Error(`Failed to fetch PR #${prNumber}`)
  }

  return {
    authorBot: data.user?.type === 'Bot',
    baseRef: data.base.ref,
    headRef: data.head.ref,
    headSha: data.head.sha,
    mergeable: mergeable === true,
    notDraft: data.draft !== true,
    number: data.number,
  }
}
