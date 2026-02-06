import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

const { mockConstants } = vi.hoisted(() => ({
  mockConstants: {
    REF_TYPE: 'branch' as 'branch' | 'tag',
    SHORT_COMMIT: 'f2e1fe5',
  },
}))

const runModule = async () => {
  // Reset module registry so index.ts re-executes run()
  vi.resetModules()

  // Re-mock everything after resetModules
  vi.doMock('@actions/core', () => ({
    info: vi.fn(),
    setFailed: vi.fn(),
    setOutput: vi.fn(),
  }))

  vi.doMock('@actions/github', () => ({
    getOctokit: vi.fn(() => ({ rest: {} })),
  }))

  vi.doMock('./constants', () => mockConstants)

  vi.doMock('./utilities/get-current-version', () => ({
    getVersion: vi.fn(),
  }))

  vi.doMock('./utilities/get-input', () => ({
    getInput: vi.fn(),
  }))

  vi.doMock('./utilities/is-latest-version', () => ({
    isLatestVersion: vi.fn(),
  }))

  vi.doMock('./utilities/get-changelog', () => ({
    getChangelog: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-versions', () => ({
    setOutputVersions: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-github-pages', () => ({
    setOutputGithubPages: vi.fn(),
  }))

  // Configure mocks via the fresh modules
  const coreModule = await import('@actions/core')
  const githubModule = await import('@actions/github')
  const getVersionModule = await import('./utilities/get-current-version')
  const getInputModule = await import('./utilities/get-input')
  const isLatestVersionModule = await import('./utilities/is-latest-version')
  const getChangelogModule = await import('./utilities/get-changelog')
  const setOutputVersionsModule = await import('./utilities/set-output-versions')
  const setOutputGithubPagesModule = await import('./utilities/set-output-github-pages')

  return {
    core: coreModule,
    getChangelog: getChangelogModule.getChangelog,
    getInput: getInputModule.getInput,
    getVersion: getVersionModule.getVersion,
    github: githubModule,
    isLatestVersion: isLatestVersionModule.isLatestVersion,
    setOutputGithubPages: setOutputGithubPagesModule.setOutputGithubPages,
    setOutputVersions: setOutputVersionsModule.setOutputVersions,
  }
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConstants.REF_TYPE = 'branch'
    mockConstants.SHORT_COMMIT = 'f2e1fe5'
  })

  it('sets all outputs for a branch context (testing environment)', async () => {
    mockConstants.REF_TYPE = 'branch'
    mockConstants.SHORT_COMMIT = 'f2e1fe5'

    const mods = await runModule()

    const version = semver.parse('0.11.2-trunk.f2e1fe5')!
    vi.mocked(mods.getVersion).mockResolvedValue(version)
    vi.mocked(mods.getInput).mockReturnValue('ghp_test_token')
    vi.mocked(mods.isLatestVersion).mockResolvedValue(true)
    vi.mocked(mods.getChangelog).mockResolvedValue('')
    vi.mocked(mods.setOutputVersions).mockResolvedValue(undefined)
    vi.mocked(mods.setOutputGithubPages).mockResolvedValue(undefined)

    // Import and execute the module
    await import('./index')

    expect(mods.core.setOutput).toHaveBeenCalledWith('version', '0.11.2-trunk.f2e1fe5')
    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'testing')
    expect(mods.core.setOutput).toHaveBeenCalledWith('short-commit', 'f2e1fe5')
    expect(mods.core.setOutput).toHaveBeenCalledWith('latest', true)
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease', true)
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease-identifier', 'trunk')
    expect(mods.core.setOutput).toHaveBeenCalledWith('changelog', '')

    // getChangelog should NOT be called for branch context
    expect(mods.getChangelog).not.toHaveBeenCalled()

    expect(mods.setOutputVersions).toHaveBeenCalled()
    expect(mods.setOutputGithubPages).toHaveBeenCalled()
  })

  it('sets production environment for tag without prerelease', async () => {
    mockConstants.REF_TYPE = 'tag'

    const mods = await runModule()

    const version = semver.parse('1.0.0')!
    vi.mocked(mods.getVersion).mockResolvedValue(version)
    vi.mocked(mods.getInput).mockReturnValue('ghp_test_token')
    vi.mocked(mods.isLatestVersion).mockResolvedValue(true)
    vi.mocked(mods.getChangelog).mockResolvedValue('## Changes\n\n- feat: something')
    vi.mocked(mods.setOutputVersions).mockResolvedValue(undefined)
    vi.mocked(mods.setOutputGithubPages).mockResolvedValue(undefined)

    await import('./index')

    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'production')
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease', false)
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease-identifier', '')
    expect(mods.core.setOutput).toHaveBeenCalledWith('changelog', '## Changes\n\n- feat: something')
    expect(mods.getChangelog).toHaveBeenCalledWith({ prerelease: false, token: 'ghp_test_token' })
  })

  it('sets staging environment for tag with prerelease', async () => {
    mockConstants.REF_TYPE = 'tag'

    const mods = await runModule()

    const version = semver.parse('1.0.0-rc.1')!
    vi.mocked(mods.getVersion).mockResolvedValue(version)
    vi.mocked(mods.getInput).mockReturnValue('ghp_test_token')
    vi.mocked(mods.isLatestVersion).mockResolvedValue(false)
    vi.mocked(mods.getChangelog).mockResolvedValue('changelog text')
    vi.mocked(mods.setOutputVersions).mockResolvedValue(undefined)
    vi.mocked(mods.setOutputGithubPages).mockResolvedValue(undefined)

    await import('./index')

    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'staging')
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease', true)
    expect(mods.core.setOutput).toHaveBeenCalledWith('prerelease-identifier', 'rc')
  })

  it('calls core.setFailed when getVersion returns null', async () => {
    const mods = await runModule()

    vi.mocked(mods.getVersion).mockResolvedValue(null)

    await import('./index')

    // The assert will throw, caught by .catch(onError)
    expect(mods.core.setFailed).toHaveBeenCalled()
  })

  it('calls core.setFailed when token is missing', async () => {
    const mods = await runModule()

    const version = semver.parse('1.0.0')!
    vi.mocked(mods.getVersion).mockResolvedValue(version)
    vi.mocked(mods.getInput).mockReturnValue(undefined)

    await import('./index')

    expect(mods.core.setFailed).toHaveBeenCalled()
  })
})
