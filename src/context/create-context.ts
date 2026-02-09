import * as github from '@actions/github'
import { createShortCommit } from '../utilities/create-short-commit'
import { getPullRequest } from '../utilities/pull-request/get-pull-request'
import type { Octokit } from '../utilities/pull-request/types'
import { createOutputs, type ActionOutputs } from './outputs'
import { readBranch } from './read-branch'
import { resolveInputs, type ValidatedInputs } from './resolve-inputs'
import { throwInputError } from './throw-input-error'

// ── Context types ────────────────────────────────────────────────────────

/**
 * Shared properties present in every context variant.
 */
interface ContextBase {
  // ── Repository identity ──────────────────────────────────────────────

  /** Repository owner (organization or user). */
  repositoryOwner: string

  /** Repository name without owner prefix. */
  repositoryName: string

  // ── Git reference ────────────────────────────────────────────────────

  /** Reference name (branch or tag). */
  referenceName: string

  // ── Version ──────────────────────────────────────────────────────────

  /**
   * Full commit SHA used for version derivation.
   *
   * @remarks
   * In branch and pull request modes, this is the HEAD commit of the
   * branch being versioned. In tag mode, this is the commit the tag
   * references.
   */
  versionCommitSha: string

  /** Abbreviated form of `versionCommitSha` for prerelease suffix and output. */
  versionCommitShaShort: string

  // ── Workflow ─────────────────────────────────────────────────────────

  /** GitHub Actions event name. */
  eventName: string

  /**
   * Context resolution source.
   *
   * @remarks
   * `'event'` derives context from the workflow event payload.
   * `'pr'` derives context from explicit `pr-*` action inputs.
   */
  contextSource: 'event' | 'pr'

  /** Workflow run identifier, used to exclude self from check evaluation. */
  workflowRunId: string | undefined

  // ── Dependencies ─────────────────────────────────────────────────────

  /** Authenticated GitHub API client. */
  octokit: Octokit

  /** Validated action inputs. */
  inputs: ValidatedInputs

  /** Typed action outputs proxy. Throws on read before write. */
  outputs: ActionOutputs
}

/**
 * Context for tag-triggered workflows.
 *
 * @remarks
 * No pull request context is available. `versionBranch` is always empty.
 */
export interface TagContext extends ContextBase {
  hasPullRequestContext: false
  pullRequestNumber: 0
  referenceType: 'tag'
  versionBranch: ''
}

/**
 * Context for branch push events without pull request association.
 */
export interface BranchContext extends ContextBase {
  hasPullRequestContext: false
  pullRequestNumber: 0
  referenceType: 'branch'
  versionBranch: string
}

/**
 * Context for pull request events or explicit PR mode.
 *
 * @remarks
 * `pullRequestNumber` is always a positive integer.
 */
export interface PullRequestContext extends ContextBase {
  hasPullRequestContext: true
  pullRequestNumber: number
  referenceType: 'branch'
  versionBranch: string
}

/**
 * Discriminated union of all workflow context variants.
 *
 * Discriminants: `referenceType` and `hasPullRequestContext`.
 */
export type Context = BranchContext | PullRequestContext | TagContext

// ── Validation helpers ───────────────────────────────────────────────────

/**
 * Validates optional explicit PR input guard values against fetched PR values.
 */
const assertOptionalPrInputMatches = (
  inputName: 'pr-head-ref' | 'pr-head-sha',
  inputValue: string | undefined,
  fetchedValue: string,
): void => {
  if (inputValue === undefined) {
    return
  }

  if (inputValue !== fetchedValue) {
    const label = inputName.replace(/^pr-/, '').replace(/-/g, ' ')

    throwInputError(
      `Provided ${inputName} '${inputValue}' does not match fetched PR ${label} '${fetchedValue}'.`,
    )
  }
}

// ── Payload reader ───────────────────────────────────────────────────────

interface PayloadPullRequest {
  head?: {
    ref?: string
    sha?: string
  }
  number?: number
}

const readPayloadPullRequest = (): PayloadPullRequest | undefined => {
  const payload = github.context.payload as unknown

  if (payload === null || typeof payload !== 'object' || !('pull_request' in payload)) {
    return undefined
  }

  const maybePullRequest = (payload as { pull_request?: unknown }).pull_request

  if (maybePullRequest === null || typeof maybePullRequest !== 'object') {
    return undefined
  }

  return maybePullRequest as PayloadPullRequest
}

// ── Context builder ──────────────────────────────────────────────────────

interface ResolvedBase {
  inputs: ValidatedInputs
  octokit: Octokit
  outputs: ActionOutputs
  repositoryName: string
  repositoryOwner: string
  workflowRunId: string | undefined
}

interface BuildPullRequestContextInput {
  commitSha: string
  contextSource: 'event' | 'pr'
  eventName: string
  pullRequestNumber: number
  referenceName: string
  versionBranch: string
}

const buildPullRequestContext = (
  base: ResolvedBase,
  input: BuildPullRequestContextInput,
): PullRequestContext => ({
  ...base,
  contextSource: input.contextSource,
  eventName: input.eventName,
  hasPullRequestContext: true,
  pullRequestNumber: input.pullRequestNumber,
  referenceName: input.referenceName,
  referenceType: 'branch',
  versionBranch: input.versionBranch,
  versionCommitSha: input.commitSha,
  versionCommitShaShort: createShortCommit(input.commitSha),
})

// ── Context resolvers ────────────────────────────────────────────────────

const resolveEventContext = (base: ResolvedBase): Context => {
  const eventName = github.context.eventName
  const referenceType = process.env.GITHUB_REF_TYPE === 'tag' ? 'tag' : 'branch'
  const referenceName = process.env.GITHUB_REF_NAME ?? ''

  if (eventName === 'pull_request') {
    const payloadPullRequest = readPayloadPullRequest()
    const prNumber = payloadPullRequest?.number

    if (typeof prNumber !== 'number') {
      throw new TypeError(
        'pull_request event payload is missing pull_request.number. The event payload is corrupt.',
      )
    }

    if (referenceType !== 'branch') {
      throw new Error(
        `pull_request event has GITHUB_REF_TYPE='${referenceType}'. Expected 'branch'. The runner environment is corrupt.`,
      )
    }

    const headReference = payloadPullRequest?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? ''
    const headSha = payloadPullRequest?.head?.sha ?? github.context.sha

    return buildPullRequestContext(base, {
      commitSha: headSha,
      contextSource: 'event',
      eventName,
      pullRequestNumber: prNumber,
      referenceName: headReference,
      versionBranch: headReference,
    })
  }

  if (referenceType === 'branch') {
    const branch = readBranch(eventName)
    const commitSha = github.context.sha

    return {
      ...base,
      contextSource: 'event',
      eventName,
      hasPullRequestContext: false,
      pullRequestNumber: 0,
      referenceName,
      referenceType,
      versionBranch: branch,
      versionCommitSha: commitSha,
      versionCommitShaShort: createShortCommit(commitSha),
    } satisfies BranchContext
  }

  const commitSha = github.context.sha

  return {
    ...base,
    contextSource: 'event',
    eventName,
    hasPullRequestContext: false,
    pullRequestNumber: 0,
    referenceName,
    referenceType,
    versionBranch: '',
    versionCommitSha: commitSha,
    versionCommitShaShort: createShortCommit(commitSha),
  } satisfies TagContext
}

// ── Entry point ──────────────────────────────────────────────────────────

export const createContext = async (): Promise<Context> => {
  const inputs = resolveInputs()
  const octokit = github.getOctokit(inputs.token)

  const base: ResolvedBase = {
    inputs,
    octokit,
    outputs: createOutputs(),
    repositoryName: github.context.repo.repo,
    repositoryOwner: github.context.repo.owner,
    workflowRunId: String(github.context.runId),
  }

  if (inputs.contextSource === 'event') {
    return resolveEventContext(base)
  }

  // Explicit PR mode: resolve from API with input guards.
  const prNumber = inputs.prNumber

  // Defense-in-depth: resolveInputs already validates this.
  if (prNumber === undefined) {
    return throwInputError("context-source='pr' requires a positive integer in input 'pr-number'.")
  }

  const pr = await getPullRequest(base, prNumber)

  assertOptionalPrInputMatches('pr-head-ref', inputs.prHeadRef, pr.headRef)
  assertOptionalPrInputMatches('pr-head-sha', inputs.prHeadSha, pr.headSha)

  return buildPullRequestContext(base, {
    commitSha: pr.headSha,
    contextSource: 'pr',
    eventName: github.context.eventName,
    pullRequestNumber: pr.number,
    referenceName: pr.headRef,
    versionBranch: pr.headRef,
  })
}
