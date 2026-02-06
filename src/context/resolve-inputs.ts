import { readInput } from './read-input'
import { throwInputError } from './throw-input-error'
import { parseNodeVersionConstraint } from './parse-node-version-constraint'
import { parseTrustedBots } from './parse-trusted-bots'

export interface ValidatedInputs {
  contextSource: 'event' | 'pr'
  token: string
  trustedBots: Set<string>
  nodeVersion?: string
  prHeadRef?: string
  prHeadSha?: string
  prNumber?: number
}

const requireInput = (name: string, value: string | undefined): string => {
  if (typeof value !== 'string') {
    return throwInputError(`Missing required input '${name}'.`)
  }

  if (value.length === 0) {
    return throwInputError(`Missing required input '${name}'.`)
  }

  return value
}

const parseContextSource = (value: string | undefined): 'event' | 'pr' => {
  const normalized = (value ?? 'event').trim()

  if (normalized === 'event' || normalized === 'pr') {
    return normalized
  }

  return throwInputError(
    `Invalid context-source '${normalized}'. Supported values are 'event' and 'pr'.`,
  )
}

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    throwInputError(`Invalid input 'pr-number': '${value}'. Expected a positive integer.`)
  }

  const parsed = Number.parseInt(trimmed, 10)

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throwInputError(`Invalid input 'pr-number': '${value}'. Expected a positive integer.`)
  }

  return parsed
}

/** Trim a string input; return undefined for absent or whitespace-only values. */
const normalizeOptionalInput = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const resolveInputs = (): ValidatedInputs => {
  const token = requireInput('token', readInput('token'))

  const contextSource = parseContextSource(readInput('context-source'))
  const prNumber = parsePositiveInteger(readInput('pr-number'))

  if (contextSource === 'pr' && prNumber === undefined) {
    throwInputError("context-source='pr' requires a positive integer in input 'pr-number'.")
  }

  const prHeadReference = normalizeOptionalInput(readInput('pr-head-ref'))
  const prHeadSha = normalizeOptionalInput(readInput('pr-head-sha'))

  if (contextSource === 'event') {
    if (prNumber !== undefined) {
      throwInputError(
        "Input 'pr-number' is only valid with context-source='pr'. Set context-source to 'pr' or remove 'pr-number'.",
      )
    }

    if (prHeadReference !== undefined) {
      throwInputError(
        "Input 'pr-head-ref' is only valid with context-source='pr'. Set context-source to 'pr' or remove 'pr-head-ref'.",
      )
    }

    if (prHeadSha !== undefined) {
      throwInputError(
        "Input 'pr-head-sha' is only valid with context-source='pr'. Set context-source to 'pr' or remove 'pr-head-sha'.",
      )
    }
  }

  const nodeVersionRaw = readInput('node-version')
  const nodeVersion = parseNodeVersionConstraint(nodeVersionRaw)

  if (nodeVersionRaw !== undefined && nodeVersion === undefined) {
    throwInputError(`Invalid node-version constraint: '${nodeVersionRaw}'.`)
  }

  return {
    contextSource,
    nodeVersion,
    prHeadRef: prHeadReference,
    prHeadSha,
    prNumber,
    token,
    trustedBots: parseTrustedBots(readInput('trusted-bots')),
  }
}
