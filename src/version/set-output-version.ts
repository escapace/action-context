import assert from 'node:assert'
import type { Context } from '../context/create-context'
import { getChangelog } from './get-changelog'
import { getVersion } from './get-version'
import { isLatestVersion } from './is-latest-version'

/**
 * Derives version, environment, changelog, and related outputs,
 * then assigns them to `context.outputs`.
 */
export const setOutputVersion = async (context: Context): Promise<void> => {
  const { inputs, outputs } = context
  const currentVersion = await getVersion(context)

  assert(currentVersion !== null, 'Failed to derive a semantic version.')

  const { prerelease, version } = currentVersion

  const isPrerelease = prerelease.length > 0
  const isTag = context.referenceType === 'tag'

  outputs.version = version
  outputs.environment = isTag ? (isPrerelease ? 'staging' : 'production') : 'testing'
  outputs.prerelease = isPrerelease
  outputs['prerelease-identifier'] = isPrerelease ? `${prerelease[0]}` : ''
  outputs['short-commit'] = context.versionCommitShaShort
  outputs.latest = await isLatestVersion(currentVersion)
  outputs.changelog = isTag
    ? ((await getChangelog({ prerelease: isPrerelease, token: inputs.token })) ?? '')
    : ''
}
