import { describe, expect, it } from 'vitest'
import { packageEnginesMaximumVersions } from './versions'

describe('versions', () => {
  it('', () => {
    expect(
      Array.from(
        packageEnginesMaximumVersions([
          { node: '>=22.15.2 || >=22.15.1' },
          { node: '>=22.15.0', npm: '>=24.5.0' },
        ]).entries(),
      ),
    ).toMatchSnapshot()
  })

  it('', () => {
    expect(() =>
      packageEnginesMaximumVersions([{ 'no-de': '>=22.15.2' }, { 'no/de': '>=22.15.0' }]),
    ).toThrow(/inconsistent/i)
  })
})
