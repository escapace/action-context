/* eslint-disable typescript/no-non-null-assertion */
import * as github from '@actions/github'
import { createShortCommit } from './utilities/create-short-commit'

export const SEMVER_OPTIONS = { includePrerelease: true, loose: false }
export const SHORT_COMMIT = createShortCommit(github.context.sha)
export const REF_TYPE = process.env.GITHUB_REF_TYPE as 'branch' | 'tag'
export const REF_NAME = process.env.GITHUB_REF_NAME!
export const DEFAULT_INCREMENT = 'patch'
export const EVENT_NAME = process.env.GITHUB_EVENT_NAME!
export const CONVENTIONAL_COMMIT_REGEX =
  /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i
