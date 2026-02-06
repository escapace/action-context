import { isPlainObject } from 'es-toolkit'
import { readFile } from 'node:fs/promises'
import semver from 'semver'
import { isFile } from './is-files'
import { setOutputs } from './output'
import { parseNodeVersionConstraint } from '../context/parse-node-version-constraint'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'
import { parseDevEngines as parseDevelopmentEngines, workspaceEngines } from './workspace-engines'
import type { Context } from '../context/create-context'

const mergeVersionMaps = (sources: Iterable<Map<string, string>>): Map<string, string> => {
  const merged = new Map<string, string>()

  for (const source of sources) {
    for (const [name, version] of source) {
      const previous = merged.get(name)

      if (previous === undefined || semver.gt(version, previous)) {
        merged.set(name, version)
      }
    }
  }

  return merged
}

const getMaximumVersionsBestEffort = (
  versions: Array<Record<string, string | undefined>>,
): Map<string, string> => {
  try {
    return workspaceEnginesMaximumVersions(versions)
  } catch {
    const sources: Array<Map<string, string>> = []

    for (const record of versions) {
      try {
        sources.push(workspaceEnginesMaximumVersions([record]))
      } catch {
        // Best-effort: skip invalid source fragments silently.
      }
    }

    return mergeVersionMaps(sources)
  }
}

const appendPackageManifestVersions = async (
  versions: Array<Record<string, string | undefined>>,
): Promise<void> => {
  const packageManifest = JSON.parse(await readFile('package.json', 'utf8')) as {
    devEngines?: Parameters<typeof parseDevelopmentEngines>[0]
    engines?: Record<string, string | undefined>
  }

  if (packageManifest.engines !== undefined) {
    versions.push(packageManifest.engines)
  }

  versions.push(
    ...parseDevelopmentEngines(packageManifest.devEngines).filter(
      (value): value is Record<string, string> => value !== undefined,
    ),
  )
}

/**
 * Parses a versions.json payload into normalized version records.
 */
export const parseVersionsJsonRecords = (
  values: unknown,
): Array<Record<string, string | undefined>> => {
  if (!isPlainObject(values)) {
    return []
  }

  const records: Array<Record<string, string | undefined>> = []

  for (const [key, value] of Object.entries(values)) {
    if (
      typeof key === 'string' &&
      (typeof value === 'string' ||
        (isPlainObject(value) && typeof (value as { version?: string }).version === 'string'))
    ) {
      const version = value as string | { version: string }

      records.push({ [key]: typeof version === 'string' ? version : version.version })
    }
  }

  return records
}

const appendVersionsJsonVersions = async (
  versions: Array<Record<string, string | undefined>>,
): Promise<void> => {
  if (!(await isFile('versions.json'))) {
    return
  }

  const values = JSON.parse(await readFile('versions.json', 'utf8')) as unknown

  versions.push(...parseVersionsJsonRecords(values))
}

export { parseNodeVersionConstraint } from '../context/parse-node-version-constraint'

export const setOutputVersions = async (context: Context) => {
  const node = parseNodeVersionConstraint(context.inputs.nodeVersion)

  const versions: Array<Record<string, string | undefined>> = [{ node }]

  let hasPackageJson = false

  try {
    hasPackageJson = await isFile('package.json')
  } catch {
    /* silent */
  }

  if (hasPackageJson) {
    try {
      await appendPackageManifestVersions(versions)
    } catch {
      /* silent */
    }

    try {
      versions.push(...(await workspaceEngines(process.cwd())))
    } catch {
      /* silent */
    }
  }

  try {
    await appendVersionsJsonVersions(versions)
  } catch {
    /* silent */
  }

  const outputs = Object.fromEntries(getMaximumVersionsBestEffort(versions))

  setOutputs(outputs)
}
