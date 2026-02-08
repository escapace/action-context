import * as github from '@actions/github'
import { createShortCommit } from './utilities/create-short-commit'

/**
 * Reads an environment variable and returns an empty string when unset.
 *
 * This preserves existing action behavior while avoiding non-null assertions.
 */
const getEnvironment = (name: string): string => process.env[name] ?? ''

export const SEMVER_OPTIONS = { includePrerelease: true, loose: false }
export const SHORT_COMMIT = createShortCommit(github.context.sha)
export const REF_TYPE = getEnvironment('GITHUB_REF_TYPE') as 'branch' | 'tag'
export const REF_NAME = getEnvironment('GITHUB_REF_NAME')
export const DEFAULT_INCREMENT = 'patch'
export const EVENT_NAME = getEnvironment('GITHUB_EVENT_NAME')
export const CONVENTIONAL_COMMIT_REGEX =
  /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i
