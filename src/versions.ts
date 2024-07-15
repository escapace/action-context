import { findWorkspacePackagesNoCheck } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { groupBy, mapValues } from 'lodash-es'
import { compare, minVersion, validRange } from 'semver'

// https://github.com/pnpm/pnpm/blob/main/workspace/filter-packages-from-dir/src/index.ts
export async function packageEnginesFromDirectory(workspaceDirectory: string) {
  const workspaceManifest = await readWorkspaceManifest(workspaceDirectory)
  const allProjects = await findWorkspacePackagesNoCheck(workspaceDirectory, {
    patterns: workspaceManifest?.packages,
  })

  return allProjects.map((value) => value.manifest.engines ?? {})
}

export const packageEnginesMaximumVersions = (
  ...engines: Array<Record<string, string | undefined> | undefined>
) =>
  mapValues(
    groupBy(
      engines
        .map((value) => Object.entries(value ?? {}))
        .flat()
        .map(([key, value]) =>
          value === undefined || validRange(value) === null ? undefined : ([key, value] as const),
        )
        .filter((value): value is [string, string] => value !== undefined),
      ([key]) => key,
    ),
    (entries) =>
      // eslint-disable-next-line typescript/no-non-null-assertion
      entries.map(([_, value]) => value).sort((a, b) => compare(minVersion(b)!, minVersion(a)!))[0],
  )
