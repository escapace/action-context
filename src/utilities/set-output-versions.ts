import { isPlainObject } from 'es-toolkit'
import { readFile } from 'node:fs/promises'
import semver from 'semver'
import { getInput } from './get-input'
import { isFile } from './is-files'
import { parseDevEngines as parseDevelopmentEngines, workspaceEngines } from './workspace-engines'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'
import { setOutputs } from './output'

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

export const setOutputVersions = async () => {
  const nodeVersionFromInput = getInput('node-version')
  const node =
    typeof nodeVersionFromInput === 'string'
      ? (semver.clean(nodeVersionFromInput) ?? undefined)
      : undefined

  const versions: Array<Record<string, string | undefined>> = [{ node }]

  let hasPackageJson = false

  try {
    hasPackageJson = await isFile('package.json')
  } catch {
    hasPackageJson = false
  }

  if (hasPackageJson) {
    try {
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
    } catch {
      // Best-effort: ignore package.json parsing/read failures.
    }

    try {
      versions.push(...(await workspaceEngines(process.cwd())))
    } catch {
      // Best-effort: ignore workspace discovery failures.
    }
  }

  try {
    if (await isFile('versions.json')) {
      const values = JSON.parse(await readFile('versions.json', 'utf8')) as unknown

      if (isPlainObject(values)) {
        Object.entries(values).forEach(([key, value]) => {
          if (
            typeof key === 'string' &&
            (typeof value === 'string' ||
              (isPlainObject(value) && typeof (value as { version?: string }).version === 'string'))
          ) {
            const version = value as string | { version: string }

            versions.push({ [key]: typeof version === 'string' ? version : version.version })
          }
        })
      }
    }
  } catch {
    // Best-effort: ignore versions.json failures.
  }

  const outputs = Object.fromEntries(getMaximumVersionsBestEffort(versions))

  setOutputs(outputs)
}
