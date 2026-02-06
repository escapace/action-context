import semver from 'semver'
import { assertRepoNotShallow } from './assert-repo-not-shallow'
import { getTag } from './get-tag'

export const isLatestVersion = async (currentVersion: semver.SemVer) => {
  await assertRepoNotShallow()

  const tag = await getTag(undefined, { includePrerelease: false })

  if (tag === undefined) {
    return true
  }

  const latestVersion = semver.clean(tag)

  if (latestVersion === null) {
    throw new Error(`Invalid semantic version tag: ${tag}`)
  }

  return semver.gte(currentVersion, latestVersion)
}
