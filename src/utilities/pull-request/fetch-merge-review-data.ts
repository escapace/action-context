import { rethrowPullRequestsReadPermission } from './error'
import type { Context } from '../../context/create-context'
import type { ReviewData } from './types'

const MERGE_REVIEW_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        mergeStateStatus
        reviewDecision
        latestReviews(first: 100) {
          nodes {
            state
          }
        }
        reviewRequests(first: 100) {
          nodes {
            requestedReviewer {
              ... on User { login }
              ... on Team { slug }
              ... on Mannequin { login }
            }
          }
        }
      }
    }
  }
`

interface MergeReviewGraphQLResponse {
  repository: {
    pullRequest: {
      latestReviews: {
        nodes: Array<{ state: string }>
      }
      mergeStateStatus: string
      reviewDecision: string | null
      reviewRequests: {
        nodes: Array<{ requestedReviewer: { login?: string; slug?: string } | null }>
      }
    } | null
  } | null
}

export interface MergeReviewData {
  mergeStateStatus: string | undefined
  reviewData: ReviewData
}

/**
 * Fetches merge state and review data in a single GraphQL request.
 */
export const fetchMergeReviewData = async (context: Context): Promise<MergeReviewData> => {
  const { octokit, pullRequestNumber, repositoryName, repositoryOwner } = context

  if (pullRequestNumber <= 0) {
    throw new Error('PR context was expected but no valid PR number is available.')
  }

  let response: MergeReviewGraphQLResponse

  try {
    response = await octokit.graphql<MergeReviewGraphQLResponse>(MERGE_REVIEW_QUERY, {
      number: pullRequestNumber,
      owner: repositoryOwner,
      repo: repositoryName,
    })
  } catch (error: unknown) {
    rethrowPullRequestsReadPermission(error)

    throw error
  }

  const pr = response.repository?.pullRequest

  if (pr === null || pr === undefined) {
    return {
      mergeStateStatus: undefined,
      reviewData: {
        latestReviews: [],
        reviewDecision: null,
        reviewRequests: [],
      },
    }
  }

  return {
    mergeStateStatus: pr.mergeStateStatus,
    reviewData: {
      latestReviews: pr.latestReviews.nodes.map((node) => ({
        state: node.state as ReviewData['latestReviews'][number]['state'],
      })),
      reviewDecision: pr.reviewDecision as ReviewData['reviewDecision'],
      reviewRequests: pr.reviewRequests.nodes.map((node) => ({
        requestedReviewer: node.requestedReviewer,
      })),
    },
  }
}

const GREEN_MERGE_STATES = new Set(['CLEAN', 'HAS_HOOKS'])

/**
 * Derive whether the PR merge button is effectively green.
 */
export const isMergeStateClear = (mergeStateStatus: string | undefined): boolean =>
  typeof mergeStateStatus === 'string' && GREEN_MERGE_STATES.has(mergeStateStatus)

/**
 * Derive whether reviews block merging.
 */
export const isReviewClear = (data: ReviewData): boolean => {
  const hasChangesRequested =
    data.reviewDecision === 'CHANGES_REQUESTED' ||
    data.latestReviews.some((review) => review.state === 'CHANGES_REQUESTED')

  const hasReviewRequired = data.reviewDecision === 'REVIEW_REQUIRED'

  return !hasChangesRequested && !hasReviewRequired && data.reviewRequests.length === 0
}
