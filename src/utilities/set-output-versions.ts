import { isPlainObject } from 'es-toolkit'
import { readFile } from 'node:fs/promises'
import semver from 'semver'
import { getInput } from './get-input'
import { isFile } from './is-files'
import { setOutputs } from './output'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'
import { parseDevEngines as parseDevelopmentEngines, workspaceEngines } from './workspace-engines'

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

/**
 * Runs an asynchronous operation in best-effort mode and returns fallback
 * on failure without surfacing warnings/errors.
 */
const bestEffort = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation()
  } catch {
    return fallback
  }
}

/**
 * Runs an asynchronous operation in best-effort mode, swallowing errors.
 */
const runBestEffort = async (operation: () => Promise<void>): Promise<void> => {
  await bestEffort(async () => {
    await operation()

    return undefined
  }, undefined)
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

export const setOutputVersions = async () => {
  const nodeVersionFromInput = getInput('node-version')
  const node =
    typeof nodeVersionFromInput === 'string'
      ? (semver.clean(nodeVersionFromInput) ?? undefined)
      : undefined

  const versions: Array<Record<string, string | undefined>> = [{ node }]

  const hasPackageJson = await bestEffort(async () => await isFile('package.json'), false)

  if (hasPackageJson) {
    await runBestEffort(async () => {
      await appendPackageManifestVersions(versions)
    })

    await runBestEffort(async () => {
      versions.push(...(await workspaceEngines(process.cwd())))
    })
  }

  await runBestEffort(async () => {
    await appendVersionsJsonVersions(versions)
  })

  const outputs = Object.fromEntries(getMaximumVersionsBestEffort(versions))

  setOutputs(outputs)
}
