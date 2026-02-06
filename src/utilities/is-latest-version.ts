import semver from 'semver'
import { SEMVER_OPTIONS } from '../constants'
import { getTag } from './get-tag'

export const isLatestVersion = async (currentVersion: semver.SemVer) => {
  const tag = await getTag()

  if (tag === undefined) {
    return true
  }

  const latestVersion = semver.clean(tag, SEMVER_OPTIONS)!

  return semver.gte(currentVersion, latestVersion, SEMVER_OPTIONS)
}
