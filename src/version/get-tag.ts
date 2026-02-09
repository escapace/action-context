import * as core from '@actions/core'
import { isError, isString, last } from 'es-toolkit'
import semver from 'semver'
import { exec } from '../utilities/exec'

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

const isSelectableSemanticTag = (tag: string, includePrerelease: boolean): boolean => {
  const cleaned = semver.clean(tag)

  if (cleaned === null) {
    return false
  }

  if (includePrerelease) {
    return true
  }

  const parsed = semver.parse(cleaned)

  return parsed !== null && parsed.prerelease.length === 0
}

/**
 * Selects the highest semantic tag from git tag command output.
 */
export const selectHighestTagFromOutput = (
  output: string,
  options?: { includePrerelease?: boolean },
): string | undefined => {
  const includePrerelease = options?.includePrerelease ?? true

  const tags = output
    .split('\n')
    .filter((tag): tag is string => isSelectableSemanticTag(tag, includePrerelease))
    .sort((a, b) => semver.compareBuild(semver.clean(a)!, semver.clean(b)!))

  return last(tags)
}

export async function getTag(
  branch?: string,
  options?: { includePrerelease?: boolean },
): Promise<string | undefined> {
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

  const tag = selectHighestTagFromOutput(output, options)

  core.debug(`getLastGitTag():\n ${JSON.stringify(tag)}`)

  return tag
}
