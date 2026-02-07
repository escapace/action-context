import type * as github from '@actions/github'

export type Octokit = ReturnType<typeof github.getOctokit>

/** Subset of REST pulls.get response used by the action. */
export interface PullRequestData {
  authorBot: boolean
  baseRef: string
  headRef: string
  headSha: string
  mergeable: boolean
  notDraft: boolean
  number: number
}

/** A single review from the latestReviews connection. */
export interface LatestReview {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
}

/** A single pending review request. */
export interface ReviewRequest {
  requestedReviewer: { login?: string; slug?: string } | null
}

/** Data needed to derive pr-review-clear. */
export interface ReviewData {
  latestReviews: LatestReview[]
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  reviewRequests: ReviewRequest[]
}

/** CheckRun from REST checks.listForRef. */
export interface CheckRun {
  conclusion: string | null
  status: string
  appSlug?: string
  detailsUrl?: string
}

/** StatusContext from REST repos.getCombinedStatusForRef. */
export interface StatusContext {
  state: string
}

/** Commit author from REST pulls.listCommits. */
export interface CommitAuthor {
  login: string
  type: string
}

/** Verification info from REST pulls.listCommits. */
export interface CommitVerification {
  verified: boolean
}

/** A single commit from REST pulls.listCommits. */
export interface PullRequestCommit {
  author: CommitAuthor | null
  commit: {
    verification: CommitVerification | null
  }
}

/** All pr-* output values. */
export interface PullRequestOutputs {
  'pr-author-bot': boolean
  'pr-base-ref': string
  'pr-checks-clear': boolean
  'pr-commits-trusted': boolean
  'pr-head-ref': string
  'pr-merge-state-clear': boolean
  'pr-mergeable': boolean
  'pr-not-draft': boolean
  'pr-number': number
  'pr-review-clear': boolean
}
