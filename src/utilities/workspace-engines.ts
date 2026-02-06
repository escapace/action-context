import type { Project } from '@pnpm/workspace.find-packages'
import { workspaceProjects } from './workspace-projects'

// eslint-disable-next-line unicorn/prevent-abbreviations
export function parseDevEngines(
  developmentEngines: Project['manifest']['devEngines'],
): Array<Record<string, string> | undefined> {
  return (['runtime', 'packageManager'] as const)
    .flatMap((key) => developmentEngines?.[key])
    .map((entry) =>
      typeof entry?.name === 'string' && typeof entry.version === 'string'
        ? { [entry.name]: entry.version }
        : undefined,
    )
}

// https://github.com/pnpm/pnpm/blob/main/workspace/filter-packages-from-dir/src/index.ts
export async function workspaceEngines(
  workspaceDirectory: string,
): Promise<Array<Record<string, string | undefined>>> {
  const projects = await workspaceProjects(workspaceDirectory)

  return projects.flatMap((value) => {
    const manifest: Project['manifest'] = value.manifest

    return [manifest.engines, ...parseDevEngines(manifest.devEngines)].filter(
      (value): value is Record<string, string | undefined> => value !== undefined,
    )
  })
}
