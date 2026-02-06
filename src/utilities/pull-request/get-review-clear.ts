import * as github from '@actions/github'
import type { Octokit, ReviewData } from './types'

const REVIEW_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
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

interface GraphQLResponse {
  repository: {
    pullRequest: {
      latestReviews: {
        nodes: Array<{ state: string }>
      }
      reviewDecision: string | null
      reviewRequests: {
        nodes: Array<{ requestedReviewer: { login?: string; slug?: string } | null }>
      }
    }
  }
}

/**
 * Fetch review data via GraphQL and derive whether reviews block merging.
 *
 * Uses three independent signals:
 * - `reviewDecision`: branch-protection-enforced state (null on unprotected branches)
 * - `latestReviews`: catches CHANGES_REQUESTED on unprotected branches
 * - `reviewRequests`: catches pending explicit review requests
 */
export const fetchReviewData = async (octokit: Octokit, prNumber: number): Promise<ReviewData> => {
  const { owner, repo } = github.context.repo

  let response: GraphQLResponse

  try {
    response = await octokit.graphql<GraphQLResponse>(REVIEW_QUERY, {
      number: prNumber,
      owner,
      repo,
    })
  } catch (error: unknown) {
    // REST-style Octokit RequestError
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      )
    }

    // GraphQL field-level authorization errors are often returned as
    // GraphqlResponseError (HTTP 200) with `errors[]` entries.
    if (error !== null && typeof error === 'object' && 'errors' in error) {
      const maybeErrors = (error as { errors: unknown }).errors

      if (
        Array.isArray(maybeErrors) &&
        maybeErrors.some((item) => {
          if (item === null || typeof item !== 'object') return false

          const maybeType = (item as { type?: unknown }).type

          return maybeType === 'FORBIDDEN'
        })
      ) {
        throw new Error(
          'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
        )
      }
    }

    throw error
  }

  const pr = response.repository.pullRequest

  return {
    latestReviews: pr.latestReviews.nodes.map((node) => ({
      state: node.state as ReviewData['latestReviews'][number]['state'],
    })),
    reviewDecision: pr.reviewDecision as ReviewData['reviewDecision'],
    reviewRequests: pr.reviewRequests.nodes.map((node) => ({
      requestedReviewer: node.requestedReviewer,
    })),
  }
}

/**
 * Derive whether reviews block merging.
 *
 * Returns `true` when:
 * - No one has requested changes (on any repo, protected or not)
 * - Branch protection review requirements are satisfied (or absent)
 * - No one is waiting to review (no pending review requests)
 */
export const isReviewClear = (data: ReviewData): boolean => {
  const hasChangesRequested =
    data.reviewDecision === 'CHANGES_REQUESTED' ||
    data.latestReviews.some((review) => review.state === 'CHANGES_REQUESTED')

  const hasReviewRequired = data.reviewDecision === 'REVIEW_REQUIRED'

  return !hasChangesRequested && !hasReviewRequired && data.reviewRequests.length === 0
}
