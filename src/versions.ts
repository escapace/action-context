import { findWorkspacePackagesNoCheck, type Project } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { groupBy, kebabCase, mapValues, uniq } from 'es-toolkit'
import { compare, minVersion, validRange } from 'semver'

interface DevelopmentEngineDependency {
  name?: string
  version?: string
}

interface DevelopmentEngines {
  packageManager?: DevelopmentEngineDependency | DevelopmentEngineDependency[]
  runtime?: DevelopmentEngineDependency | DevelopmentEngineDependency[]
}

type Manifest = { devEngines?: DevelopmentEngines } & Omit<Project['manifest'], 'devEngines'>

// https://github.com/pnpm/pnpm/blob/main/workspace/filter-packages-from-dir/src/index.ts
export async function packageEnginesFromDirectory(
  workspaceDirectory: string,
): Promise<Array<Record<string, string | undefined>>> {
  const workspaceManifest = await readWorkspaceManifest(workspaceDirectory)
  const allProjects = await findWorkspacePackagesNoCheck(workspaceDirectory, {
    patterns: workspaceManifest?.packages,
  })

  return allProjects.flatMap((value) => {
    const manifest: Manifest = value.manifest

    const developmentEngines = (['runtime', 'packageManager'] as const)
      .flatMap((value) => manifest.devEngines?.[value])
      .map((value) =>
        typeof value?.name === 'string' && typeof value.version === 'string'
          ? { [value.name]: value.version }
          : undefined,
      )

    return [manifest.engines, developmentEngines].filter(
      (value): value is Record<string, string | undefined> => value !== undefined,
    )
  })
}

export const packageEnginesMaximumVersions = (
  engines: Array<Record<string, string | undefined> | undefined>,
) => {
  const map = new Map<string, string>()

  const records = mapValues(
    groupBy(
      engines
        .map((value) => Object.entries(value ?? {}))
        .flat()
        .map(([key, value]) =>
          value === undefined || validRange(value, true) === null
            ? undefined
            : ([key, value] as const),
        )
        .filter((value): value is [string, string] => value !== undefined),
      ([key]) => key,
    ),
    (entries) => {
      const versions = uniq(entries.map(([_, value]) => value))

      // eslint-disable-next-line typescript/no-non-null-assertion
      return versions.sort((a, b) => compare(minVersion(b)!, minVersion(a)!, true))[0]
    },
  )

  for (const [key, value] of Object.entries(records)) {
    if (typeof value !== 'string') {
      continue
    }

    const version = minVersion(value)?.toString()

    if (typeof version !== 'string') {
      continue
    }

    const name = `${kebabCase(key)}-version`

    const previousVersion = map.get(name)

    if (previousVersion !== undefined && previousVersion !== version) {
      throw new Error(`Inconsistent '${name}' versions.`)
    }

    map.set(name, version)
  }

  return map
}
