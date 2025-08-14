import { findWorkspacePackagesNoCheck, type Project } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import memoize from 'p-memoize'

export const workspaceProjects = memoize(async (workspaceDirectory: string): Promise<Project[]> => {
  const workspaceManifest = await readWorkspaceManifest(workspaceDirectory)
  const projects = await findWorkspacePackagesNoCheck(workspaceDirectory, {
    patterns: workspaceManifest?.packages,
  })

  return projects
})
