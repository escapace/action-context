/* eslint-disable typescript/no-non-null-assertion */
import * as core from '@actions/core'
import { last } from 'es-toolkit'
import semver from 'semver'
import { SEMVER_OPTIONS } from '../constants'
import { exec } from './exec'

export async function getTag(branch?: string): Promise<string | undefined> {
  const list = (
    await exec('git', [
      '--no-pager',
      'tag',
      '--list',
      '--sort=authordate',
      ...(typeof branch === 'string' ? ['--merged', branch] : []),
    ])
  )
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
