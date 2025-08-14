import * as core from '@actions/core'
import semver from 'semver'
import { SEMVER_OPTIONS } from '../constants'

export const getSemver = (properties: {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}) => {
  const { major, minor, patch, prerelease } = properties

  const string = `${major}.${minor}.${patch}${prerelease.length === 0 ? '' : `-${prerelease.join('.')}`}`

  const version = semver.parse(string, { ...SEMVER_OPTIONS, loose: true })

  core.debug(
    `toSemver()\n ${JSON.stringify([
      { major, minor, patch, prerelease },
      { string, version },
    ])}`,
  )

  return version
}
