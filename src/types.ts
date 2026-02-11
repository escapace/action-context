import type * as github from '@actions/github'
import type { ValidatedInputs } from './context/resolve-inputs'

// ── GitHub API ───────────────────────────────────────────────────────────

export type Octokit = ReturnType<typeof github.getOctokit>

// ── Action Outputs ───────────────────────────────────────────────────────

export type ActionOutputValue = boolean | number | string

export interface ActionOutputs {
  // Core outputs
  'changelog': string
  'environment': string
  'github-pages': boolean
  'github-pages-path': string
  'latest': boolean
  'node-version': string
  'prerelease': boolean
  'prerelease-identifier': string
  'short-commit': string
  'version': string

  // Pull request outputs
  'pr-author-bot': boolean
  'pr-base-ref': string
  'pr-checks-clear': boolean
  'pr-commits-trusted': boolean
  'pr-conventional-commits': string
  'pr-head-ref': string
  'pr-last-commit-age-minute': number
  'pr-merge-state-clear': boolean
  'pr-mergeable': boolean
  'pr-not-draft': boolean
  'pr-number': number
  'pr-review-clear': boolean

  // Dynamic engine outputs
  [key: string]: ActionOutputValue
}

// ── Context ──────────────────────────────────────────────────────────────

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
