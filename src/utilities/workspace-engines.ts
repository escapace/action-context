import type { Project } from '@pnpm/workspace.find-packages'
import { workspaceProjects } from './workspace-projects'

// https://github.com/pnpm/pnpm/blob/main/workspace/filter-packages-from-dir/src/index.ts
export async function workspaceEngines(
  workspaceDirectory: string,
): Promise<Array<Record<string, string | undefined>>> {
  const projects = await workspaceProjects(workspaceDirectory)

  return projects.flatMap((value) => {
    const manifest: Project['manifest'] = value.manifest

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
