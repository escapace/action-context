import * as github from '@actions/github'
import type { Octokit } from './types'

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
export const getMergeStateClear = async (octokit: Octokit, prNumber: number): Promise<boolean> => {
  const { owner, repo } = github.context.repo

  let response: MergeStateResponse

  try {
    response = await octokit.graphql<MergeStateResponse>(MERGE_STATE_QUERY, {
      number: prNumber,
      owner,
      repo,
    })
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      )
    }

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

  const mergeStateStatus = response.repository?.pullRequest?.mergeStateStatus

  return typeof mergeStateStatus === 'string' && GREEN_MERGE_STATES.has(mergeStateStatus)
}
