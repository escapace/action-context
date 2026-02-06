import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  error: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('./get-input', () => ({
  getInput: vi.fn(),
}))

vi.mock('./is-files', () => ({
  isFile: vi.fn(),
}))

vi.mock('./workspace-engines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace-engines')>()

  return {
    ...actual,
    workspaceEngines: vi.fn(),
  }
})

vi.mock('./workspace-engines-maximum-versions', () => ({
  workspaceEnginesMaximumVersions: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import * as core from '@actions/core'
import { readFile } from 'node:fs/promises'
import { getInput } from './get-input'
import { isFile } from './is-files'
import { setOutputVersions } from './set-output-versions'
import { workspaceEngines } from './workspace-engines'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'

describe('setOutputVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('outputs versions from package.json engines and workspace engines', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json'),
    )
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ engines: { node: '>=24.12.0', pnpm: '>=10.28.2' } }),
    )
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['node-version', '24.12.0'],
      ['pnpm-version', '10.28.2'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions()

    expect(core.setOutput).toHaveBeenCalledWith('node-version', '24.12.0')
    expect(core.setOutput).toHaveBeenCalledWith('pnpm-version', '10.28.2')
  })

  it('includes node-version from input when provided', async () => {
    vi.mocked(getInput).mockReturnValue('22.15.0')
    vi.mocked(isFile).mockResolvedValue(false)

    const versionMap = new Map([['node-version', '22.15.0']])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions()

    expect(workspaceEnginesMaximumVersions).toHaveBeenCalledWith(
      expect.arrayContaining([{ node: '22.15.0' }]),
    )
  })

  it('reads versions.json when it exists', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json' || path === 'versions.json'),
    )
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === 'package.json')
        return await Promise.resolve(JSON.stringify({ engines: { node: '>=24.0.0' } }))
      if (path === 'versions.json')
        return await Promise.resolve(
          JSON.stringify({ kubectl: { version: '1.28.0' }, terraform: '1.5.0' }),
        )
      return await Promise.resolve('')
    })
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['kubectl-version', '1.28.0'],
      ['node-version', '24.0.0'],
      ['terraform-version', '1.5.0'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions()

    expect(core.setOutput).toHaveBeenCalledWith('terraform-version', '1.5.0')
    expect(core.setOutput).toHaveBeenCalledWith('kubectl-version', '1.28.0')
  })

  it('includes devEngines from root package.json', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json'),
    )
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        devEngines: {
          packageManager: { name: 'pnpm', version: '>=10.0.0' },
          runtime: { name: 'node', version: '>=22.0.0' },
        },
      }),
    )
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['node-version', '22.0.0'],
      ['pnpm-version', '10.0.0'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions()

    expect(workspaceEnginesMaximumVersions).toHaveBeenCalledWith(
      expect.arrayContaining([{ node: '>=22.0.0' }, { pnpm: '>=10.0.0' }]),
    )
  })

  it('handles missing package.json gracefully', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)
    vi.mocked(isFile).mockResolvedValue(false)

    const versionMap = new Map<string, string>()
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions()

    expect(readFile).not.toHaveBeenCalled()
  })

  it('catches errors and calls core.error without throwing', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)
    vi.mocked(isFile).mockRejectedValue(new Error('fs failure'))

    await setOutputVersions()

    expect(core.error).toHaveBeenCalled()
  })
})
