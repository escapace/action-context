export type PullRequestErrorCode =
  | 'PR_COLLABORATOR_PERMISSION_UNREADABLE'
  | 'PR_PERMISSION_CHECKS_READ'
  | 'PR_PERMISSION_PULL_REQUESTS_READ'
  | 'PR_PERMISSION_STATUSES_READ'

/**
 * Structured error used by PR utilities to preserve machine-readable
 * classification while keeping human-readable messages.
 */
export class PullRequestActionError extends Error {
  public readonly code: PullRequestErrorCode

  public constructor(code: PullRequestErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'PullRequestActionError'
  }
}

/**
 * Returns true when an unknown error object exposes an HTTP status code
 * and that status equals the requested value.
 */
export const isHttpStatus = (error: unknown, status: number): boolean =>
  error !== null && typeof error === 'object' && 'status' in error && error.status === status

/**
 * Returns true when a GraphQL error payload contains at least one
 * entry with the provided `type` value.
 */
const hasGraphqlErrorType = (error: unknown, type: string): boolean => {
  if (error === null || typeof error !== 'object' || !('errors' in error)) {
    return false
  }

  const maybeErrors = (error as { errors: unknown }).errors

  return (
    Array.isArray(maybeErrors) &&
    maybeErrors.some((item) => {
      if (item === null || typeof item !== 'object') {
        return false
      }

      return (item as { type?: unknown }).type === type
    })
  )
}

/**
 * Creates and throws a permission error for the requested GitHub scope.
 */
export type PullRequestPermission = 'checks' | 'pull-requests' | 'statuses'

const throwMissingPermission = (permission: PullRequestPermission): never => {
  if (permission === 'checks') {
    throw new PullRequestActionError(
      'PR_PERMISSION_CHECKS_READ',
      'Missing `checks: read` permission. Add it to the workflow permissions block.',
    )
  }

  if (permission === 'statuses') {
    throw new PullRequestActionError(
      'PR_PERMISSION_STATUSES_READ',
      'Missing `statuses: read` permission. Add it to the workflow permissions block.',
    )
  }

  throw new PullRequestActionError(
    'PR_PERMISSION_PULL_REQUESTS_READ',
    'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
  )
}

/**
 * Returns the structured PR error code when available.
 */
export const getPullRequestErrorCode = (error: unknown): PullRequestErrorCode | undefined =>
  error instanceof PullRequestActionError ? error.code : undefined

/**
 * Re-throws a structured missing-permission error when the incoming error
 * exposes an HTTP status code that matches `status`.
 */
export const rethrowMissingPermissionOnHttpStatus = (
  error: unknown,
  permission: PullRequestPermission,
  status = 403,
): void => {
  if (isHttpStatus(error, status)) {
    throwMissingPermission(permission)
  }
}

/**
 * Re-throws pull-requests read permission errors for GraphQL and REST
 * authorization failure patterns.
 */
export const rethrowPullRequestsReadPermission = (error: unknown): void => {
  if (isHttpStatus(error, 403) || hasGraphqlErrorType(error, 'FORBIDDEN')) {
    throwMissingPermission('pull-requests')
  }
}
