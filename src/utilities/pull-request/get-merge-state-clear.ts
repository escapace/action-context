import { rethrowPullRequestsReadPermission } from './error'
import type { Context } from '../../context/create-context'

const GREEN_MERGE_STATES = new Set(['CLEAN', 'HAS_HOOKS'])

interface MergeStateResponse {
  repository: {
    pullRequest: {
      mergeStateStatus: string
    } | null
  } | null
}

const MERGE_STATE_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        mergeStateStatus
      }
    }
  }
`

/**
 * Derive whether the PR merge button is effectively green.
 *
 * Returns `true` for merge-ready states and `false` for blocked/unknown states.
 */
export const getMergeStateClear = async (context: Context): Promise<boolean> => {
  const { octokit, pullRequestNumber, repositoryName, repositoryOwner } = context

  if (pullRequestNumber <= 0) {
    throw new Error('PR context was expected but no valid PR number is available.')
  }

  let response: MergeStateResponse

  try {
    response = await octokit.graphql<MergeStateResponse>(MERGE_STATE_QUERY, {
      number: pullRequestNumber,
      owner: repositoryOwner,
      repo: repositoryName,
    })
  } catch (error: unknown) {
    rethrowPullRequestsReadPermission(error)

    throw error
  }

  const mergeStateStatus = response.repository?.pullRequest?.mergeStateStatus

  return typeof mergeStateStatus === 'string' && GREEN_MERGE_STATES.has(mergeStateStatus)
}
