import * as core from '@actions/core'
import semver from 'semver'

export const getSemver = (properties: {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}) => {
  const { major, minor, patch, prerelease } = properties

  const string = `${major}.${minor}.${patch}${prerelease.length === 0 ? '' : `-${prerelease.join('.')}`}`

  const version = semver.parse(string)

  core.debug(
    `toSemver()\n ${JSON.stringify([
      { major, minor, patch, prerelease },
      { string, version },
    ])}`,
  )

  if (version === null) {
    throw new Error(`Invalid semver generated from version parts: ${string}`)
  }

  return version
}
