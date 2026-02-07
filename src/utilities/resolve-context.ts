import * as core from '@actions/core'
import * as github from '@actions/github'
import { EVENT_NAME, REF_TYPE } from '../constants'
import { getInput } from './get-input'
import { getBranch } from './get-branch'
import { getPullRequest } from './pull-request/get-pull-request'
import type { Octokit } from './pull-request/types'

export interface ResolvedContext {
  branchForVersion: string
  hasPrContext: boolean
  prNumber: number
  shaForVersion: string
  source: 'event' | 'none' | 'pr'
}

const warning = (detail: string) => core.warning(`[PR_INPUT_INVALID] ${detail}`)

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    return undefined
  }

  const parsed = Number.parseInt(trimmed, 10)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

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

const resolveEventContext = (): ResolvedContext => {
  const payloadPullRequest = readPayloadPullRequest()
  const prNumber = payloadPullRequest?.number

  if (EVENT_NAME === 'pull_request' && typeof prNumber === 'number') {
    const headReference = payloadPullRequest?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? ''
    const headSha = payloadPullRequest?.head?.sha ?? github.context.sha

    return {
      branchForVersion: headReference,
      hasPrContext: true,
      prNumber,
      shaForVersion: headSha,
      source: 'event',
    }
  }

  if (REF_TYPE === 'branch') {
    return {
      branchForVersion: getBranch(),
      hasPrContext: false,
      prNumber: 0,
      shaForVersion: github.context.sha,
      source: 'event',
    }
  }

  return {
    branchForVersion: '',
    hasPrContext: false,
    prNumber: 0,
    shaForVersion: github.context.sha,
    source: 'event',
  }
}

export const resolveContext = async (octokit: Octokit): Promise<ResolvedContext> => {
  const source = (getInput('context-source') ?? 'event').trim()

  if (source === 'event') {
    return resolveEventContext()
  }

  if (source !== 'pr') {
    warning(`Invalid context-source '${source}'. Supported values are 'event' and 'pr'.`)

    return resolveEventContext()
  }

  const prNumber = parsePositiveInteger(getInput('pr-number'))

  if (prNumber === undefined) {
    warning("context-source='pr' requires a positive integer in input 'pr-number'.")

    return resolveEventContext()
  }

  const pr = await getPullRequest(octokit, prNumber)

  const inputHeadReference = getInput('pr-head-ref')
  if (
    typeof inputHeadReference === 'string' &&
    inputHeadReference.trim().length > 0 &&
    inputHeadReference !== pr.headRef
  ) {
    warning(
      `Provided pr-head-ref '${inputHeadReference}' does not match fetched PR head ref '${pr.headRef}'.`,
    )

    return resolveEventContext()
  }

  const inputHeadSha = getInput('pr-head-sha')
  if (
    typeof inputHeadSha === 'string' &&
    inputHeadSha.trim().length > 0 &&
    inputHeadSha !== pr.headSha
  ) {
    warning(
      `Provided pr-head-sha '${inputHeadSha}' does not match fetched PR head sha '${pr.headSha}'.`,
    )

    return resolveEventContext()
  }

  return {
    branchForVersion: pr.headRef,
    hasPrContext: true,
    prNumber: pr.number,
    shaForVersion: pr.headSha,
    source: 'pr',
  }
}
