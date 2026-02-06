import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('p-memoize', () => ({
  default: <T>(function_: T) => function_,
}))

vi.mock('@pnpm/workspace.read-manifest', () => ({
  readWorkspaceManifest: vi.fn(),
}))

vi.mock('@pnpm/workspace.find-packages', () => ({
  findWorkspacePackagesNoCheck: vi.fn(),
}))

import { findWorkspacePackagesNoCheck } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { workspaceProjects } from './workspace-projects'

describe('workspaceProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns projects from workspace', async () => {
    const mockProjects = [
      { manifest: { name: 'a' }, rootDir: '/workspace/packages/a' },
      { manifest: { name: 'b' }, rootDir: '/workspace/packages/b' },
    ]

    vi.mocked(readWorkspaceManifest).mockResolvedValue({ packages: ['packages/*'] })
    vi.mocked(findWorkspacePackagesNoCheck).mockResolvedValue(mockProjects as never)

    const result = await workspaceProjects('/workspace')

    expect(result).toEqual(mockProjects)
    expect(readWorkspaceManifest).toHaveBeenCalledWith('/workspace')
    expect(findWorkspacePackagesNoCheck).toHaveBeenCalledWith('/workspace', {
      patterns: ['packages/*'],
    })
  })

  it('passes undefined patterns when no workspace manifest', async () => {
    vi.mocked(readWorkspaceManifest).mockResolvedValue(undefined as never)
    vi.mocked(findWorkspacePackagesNoCheck).mockResolvedValue([])

    const result = await workspaceProjects('/workspace')

    expect(result).toEqual([])
    expect(findWorkspacePackagesNoCheck).toHaveBeenCalledWith('/workspace', {
      patterns: undefined,
    })
  })
})
