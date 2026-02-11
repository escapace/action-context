import { describe, expect, it } from 'vitest'
import { resolveConventionalCommits } from './resolve-conventional-commits'

describe('resolveConventionalCommits', () => {
  describe('returns "all" when title and all commits are conventional', () => {
    it('single commit', () => {
      expect(resolveConventionalCommits('feat: add feature', ['fix: bug fix'])).toBe('all')
    })

    it('multiple commits', () => {
      expect(
        resolveConventionalCommits('feat: add feature', [
          'fix: bug fix',
          'chore(deps): update dependency',
          'docs: update readme',
        ]),
      ).toBe('all')
    })

    it('breaking change with ! syntax', () => {
      expect(resolveConventionalCommits('feat!: breaking change', ['fix: bug fix'])).toBe('all')
    })

    it('scoped breaking change', () => {
      expect(resolveConventionalCommits('feat(scope)!: breaking', ['chore(deps): update'])).toBe(
        'all',
      )
    })
  })

  describe('returns "title-only" when only title is conventional', () => {
    it('commits are not conventional', () => {
      expect(
        resolveConventionalCommits('feat: add feature', ['updated something', 'WIP: more changes']),
      ).toBe('title-only')
    })

    it('mixed conventional and non-conventional commits', () => {
      expect(
        resolveConventionalCommits('feat: add feature', ['fix: good commit', 'bad commit message']),
      ).toBe('title-only')
    })

    it('no commits', () => {
      expect(resolveConventionalCommits('feat: add feature', [])).toBe('title-only')
    })
  })

  describe('returns "commits-only" when only commits are conventional', () => {
    it('title is not conventional', () => {
      expect(
        resolveConventionalCommits('Update dependencies', ['fix: bug fix', 'chore: cleanup']),
      ).toBe('commits-only')
    })
  })

  describe('returns "none" when neither title nor commits are conventional', () => {
    it('both invalid', () => {
      expect(resolveConventionalCommits('Update stuff', ['did some work', 'more changes'])).toBe(
        'none',
      )
    })

    it('empty title and no commits', () => {
      expect(resolveConventionalCommits('', [])).toBe('none')
    })

    it('whitespace-only title and no commits', () => {
      expect(resolveConventionalCommits('   ', [])).toBe('none')
    })
  })

  describe('edge cases', () => {
    it('empty commit message in list is treated as invalid', () => {
      expect(resolveConventionalCommits('feat: add feature', ['', 'fix: valid'])).toBe('title-only')
    })

    it('whitespace-only commit message is treated as invalid', () => {
      expect(resolveConventionalCommits('feat: add feature', ['   '])).toBe('title-only')
    })

    it('multi-line commit message with body and footer', () => {
      const multiLine = 'fix: resolve issue\n\nDetailed body text.\n\nBREAKING CHANGE: big change'

      expect(resolveConventionalCommits('feat: title', [multiLine])).toBe('all')
    })

    it('all conventional commit types are accepted', () => {
      const types = [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ]

      for (const type of types) {
        expect(resolveConventionalCommits(`${type}: something`, [`${type}: something`])).toBe('all')
      }
    })
  })

  describe('false-positive guards', () => {
    it('rejects near-conventional but invalid headers', () => {
      const invalid = [
        'feat add missing colon',
        'feat(scope) add missing colon',
        'Feat: uppercase type',
        'fix : extra space before colon',
        'fix(scope):',
        'fix(scope): ',
        'feat(scope)! breaking missing colon',
        'feat(scope)! : misplaced breaking marker',
        'feat(scope):. invalid subject',
        ': missing type',
      ]

      expect(resolveConventionalCommits('invalid title', invalid)).toBe('none')
    })

    it('rejects invalid commit types not in type-enum', () => {
      const invalidTypes = ['feature: add', 'bugfix: patch', 'hotfix: patch', 'deps: bump']

      expect(resolveConventionalCommits('invalid title', invalidTypes)).toBe('none')
    })

    it('does not classify mixed invalid commits as commits-only', () => {
      expect(
        resolveConventionalCommits('Not conventional', ['fix: valid', 'not valid commit']),
      ).toBe('none')
    })

    it('does not classify invalid title with empty commit list as title-only or commits-only', () => {
      expect(resolveConventionalCommits('Not conventional', [])).toBe('none')
    })
  })
})
