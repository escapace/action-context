import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./workspace-projects', () => ({
  workspaceProjects: vi.fn(),
}))

import { workspaceProjects } from './workspace-projects'
import { workspaceEngines } from './workspace-engines'

describe('workspaceEngines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts engines from workspace projects', async () => {
    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: {
          engines: { node: '>=20.0.0' },
          name: 'a',
        },
        rootDir: '/workspace/packages/a',
      },
      {
        manifest: {
          engines: { node: '>=22.0.0', pnpm: '>=9.0.0' },
          name: 'b',
        },
        rootDir: '/workspace/packages/b',
      },
    ] as never)

    const result = await workspaceEngines('/workspace')

    expect(result).toContainEqual({ node: '>=20.0.0' })
    expect(result).toContainEqual({ node: '>=22.0.0', pnpm: '>=9.0.0' })
  })

  it('extracts devEngines runtime and packageManager', async () => {
    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: {
          devEngines: {
            packageManager: { name: 'pnpm', version: '>=9.0.0' },
            runtime: { name: 'node', version: '>=22.0.0' },
          },
          name: 'a',
        },
        rootDir: '/workspace/packages/a',
      },
    ] as never)

    const result = await workspaceEngines('/workspace')

    expect(result).toContainEqual({ node: '>=22.0.0' })
    expect(result).toContainEqual({ pnpm: '>=9.0.0' })
  })

  it('excludes undefined devEngines entries', async () => {
    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: { name: 'a' },
        rootDir: '/workspace/packages/a',
      },
    ] as never)

    const result = await workspaceEngines('/workspace')

    expect(result).toHaveLength(0)
  })

  it('handles projects with engines but no devEngines', async () => {
    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: {
          devEngines: undefined,
          engines: { node: '>=20.0.0' },
          name: 'a',
        },
        rootDir: '/workspace/packages/a',
      },
    ] as never)

    const result = await workspaceEngines('/workspace')

    expect(result).toContainEqual({ node: '>=20.0.0' })
  })
})
