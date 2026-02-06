import { describe, expect, it } from 'vitest'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'

describe('workspaceEnginesMaximumVersions', () => {
  it('selects the range with the highest minVersion across sources', () => {
    expect(
      Array.from(
        workspaceEnginesMaximumVersions([
          { node: '>=22.15.2 || >=22.15.1' },
          { node: '>=22.15.0', npm: '>=24.5.0' },
        ]).entries(),
      ),
    ).toMatchSnapshot()
  })

  it('throws when different kebab-case normalizations resolve to conflicting versions', () => {
    expect(() =>
      workspaceEnginesMaximumVersions([{ 'no-de': '>=22.15.2' }, { 'no/de': '>=22.15.0' }]),
    ).toThrow(/inconsistent/i)
  })

  it('emits the minVersion of the winning range, not the range string', () => {
    const result = workspaceEnginesMaximumVersions([{ node: '>=24.0.0' }])

    expect(result.get('node-version')).toBe('24.0.0')
  })

  it('picks the higher minVersion regardless of source order', () => {
    const forward = workspaceEnginesMaximumVersions([{ node: '>=22.0.0' }, { node: '>=24.0.0' }])
    const reversed = workspaceEnginesMaximumVersions([{ node: '>=24.0.0' }, { node: '>=22.0.0' }])

    expect(forward.get('node-version')).toBe('24.0.0')
    expect(reversed.get('node-version')).toBe('24.0.0')
  })

  it('treats an exact version as a range whose minVersion is itself', () => {
    const result = workspaceEnginesMaximumVersions([{ node: '22.15.0' }, { node: '>=22.0.0' }])

    expect(result.get('node-version')).toBe('22.15.0')
  })

  it('does not let an exact input override a higher range from another source', () => {
    const result = workspaceEnginesMaximumVersions([{ node: '22.0.0' }, { node: '>=24.0.0' }])

    expect(result.get('node-version')).toBe('24.0.0')
  })

  it('drops entries with undefined values', () => {
    const result = workspaceEnginesMaximumVersions([{ node: undefined, pnpm: '>=10.0.0' }])

    expect(result.has('node-version')).toBe(false)
    expect(result.get('pnpm-version')).toBe('10.0.0')
  })

  it('drops entries with invalid semver ranges', () => {
    const result = workspaceEnginesMaximumVersions([{ node: 'not-a-version', pnpm: '>=10.0.0' }])

    expect(result.has('node-version')).toBe(false)
    expect(result.get('pnpm-version')).toBe('10.0.0')
  })

  it('skips undefined records in the input array', () => {
    const result = workspaceEnginesMaximumVersions([undefined, { node: '>=24.0.0' }, undefined])

    expect(result.get('node-version')).toBe('24.0.0')
  })

  it('returns an empty map when all entries are invalid or undefined', () => {
    const result = workspaceEnginesMaximumVersions([
      undefined,
      { node: undefined },
      { pnpm: 'garbage' },
    ])

    expect(result.size).toBe(0)
  })

  it('normalizes engine names to kebab-case output keys', () => {
    const result = workspaceEnginesMaximumVersions([{ packageManager: '>=10.0.0' }])

    expect(result.get('package-manager-version')).toBe('10.0.0')
  })

  it('merges engines across multiple sources into separate output keys', () => {
    const result = workspaceEnginesMaximumVersions([
      { node: '>=24.0.0' },
      { pnpm: '>=10.0.0' },
      { npm: '>=10.8.0' },
    ])

    expect(result.get('node-version')).toBe('24.0.0')
    expect(result.get('pnpm-version')).toBe('10.0.0')
    expect(result.get('npm-version')).toBe('10.8.0')
    expect(result.size).toBe(3)
  })

  it('does not throw when different names normalize to the same key with the same version', () => {
    const result = workspaceEnginesMaximumVersions([
      { 'no-de': '>=22.15.0' },
      { 'no/de': '>=22.15.0' },
    ])

    expect(result.get('no-de-version')).toBe('22.15.0')
  })
})
