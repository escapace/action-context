import { describe, expect, it } from 'vitest'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'

describe('versions', () => {
  it('', () => {
    expect(
      Array.from(
        workspaceEnginesMaximumVersions([
          { node: '>=22.15.2 || >=22.15.1' },
          { node: '>=22.15.0', npm: '>=24.5.0' },
        ]).entries(),
      ),
    ).toMatchSnapshot()
  })

  it('', () => {
    expect(() =>
      workspaceEnginesMaximumVersions([{ 'no-de': '>=22.15.2' }, { 'no/de': '>=22.15.0' }]),
    ).toThrow(/inconsistent/i)
  })
})
