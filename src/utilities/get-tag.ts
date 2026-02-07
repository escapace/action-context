import * as core from '@actions/core'
import { isError, isString, last } from 'es-toolkit'
import semver from 'semver'
import { SEMVER_OPTIONS } from '../constants'
import { exec } from './exec'

const getErrorMessage = (error: unknown): string => {
  if (isError(error)) return error.message
  return isString(error) ? error : String(error)
}

const throwHelpfulReferenceError = (branch: string, error: unknown): never => {
  const message = getErrorMessage(error)

  if (message.includes('malformed object name')) {
    throw new Error(
      [
        `Unable to resolve branch ref '${branch}' for git tag ancestry.`,
        "Ensure checkout uses a branch ref (for example: '${{ github.head_ref || github.ref }}' in event mode or explicit 'pr-head-ref' in PR mode) rather than detached SHA checkout.",
      ].join(' '),
    )
  }

  throw error
}

export async function getTag(branch?: string): Promise<string | undefined> {
  let output: string

  try {
    output = await exec('git', [
      '--no-pager',
      'tag',
      '--list',
      '--sort=authordate',
      ...(typeof branch === 'string' ? ['--merged', branch] : []),
    ])
  } catch (error) {
    if (typeof branch === 'string') {
      throwHelpfulReferenceError(branch, error)
    }

    throw error
  }

  const list = output
    .split('\n')
    .filter((value): value is string => semver.clean(value, SEMVER_OPTIONS) !== null)
    .sort((a, b) =>
      semver.compareBuild(
        semver.clean(a, SEMVER_OPTIONS)!,
        semver.clean(b, SEMVER_OPTIONS)!,
        SEMVER_OPTIONS,
      ),
    )

  core.debug(`getLastGitTag():\n ${JSON.stringify(list)}`)

  return last(list)
}
