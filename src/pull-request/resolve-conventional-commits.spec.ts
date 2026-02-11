import { describe, expect, it } from 'vitest'
import { resolveConventionalCommits } from './resolve-conventional-commits'

describe('resolveConventionalCommits', () => {
  describe('returns "all" when title and all commits are conventional', () => {
    it('single commit', async () => {
      expect(await resolveConventionalCommits('feat: add feature', ['fix: bug fix'])).toBe('all')
    })

    it('multiple commits', async () => {
      expect(
        await resolveConventionalCommits('feat: add feature', [
          'fix: bug fix',
          'chore(deps): update dependency',
          'docs: update readme',
        ]),
      ).toBe('all')
    })

    it('breaking change with ! syntax', async () => {
      expect(await resolveConventionalCommits('feat!: breaking change', ['fix: bug fix'])).toBe(
        'all',
      )
    })

    it('scoped breaking change', async () => {
      expect(
        await resolveConventionalCommits('feat(scope)!: breaking', ['chore(deps): update']),
      ).toBe('all')
    })
  })

  describe('returns "title-only" when only title is conventional', () => {
    it('commits are not conventional', async () => {
      expect(
        await resolveConventionalCommits('feat: add feature', [
          'updated something',
          'WIP: more changes',
        ]),
      ).toBe('title-only')
    })

    it('mixed conventional and non-conventional commits', async () => {
      expect(
        await resolveConventionalCommits('feat: add feature', [
          'fix: good commit',
          'bad commit message',
        ]),
      ).toBe('title-only')
    })

    it('no commits', async () => {
      expect(await resolveConventionalCommits('feat: add feature', [])).toBe('title-only')
    })
  })

  describe('returns "commits-only" when only commits are conventional', () => {
    it('title is not conventional', async () => {
      expect(
        await resolveConventionalCommits('Update dependencies', ['fix: bug fix', 'chore: cleanup']),
      ).toBe('commits-only')
    })
  })

  describe('returns "none" when neither title nor commits are conventional', () => {
    it('both invalid', async () => {
      expect(
        await resolveConventionalCommits('Update stuff', ['did some work', 'more changes']),
      ).toBe('none')
    })

    it('empty title and no commits', async () => {
      expect(await resolveConventionalCommits('', [])).toBe('none')
    })

    it('whitespace-only title and no commits', async () => {
      expect(await resolveConventionalCommits('   ', [])).toBe('none')
    })
  })

  describe('edge cases', () => {
    it('empty commit message in list is treated as invalid', async () => {
      expect(await resolveConventionalCommits('feat: add feature', ['', 'fix: valid'])).toBe(
        'title-only',
      )
    })

    it('whitespace-only commit message is treated as invalid', async () => {
      expect(await resolveConventionalCommits('feat: add feature', ['   '])).toBe('title-only')
    })

    it('multi-line commit message with body and footer', async () => {
      const multiLine = 'fix: resolve issue\n\nDetailed body text.\n\nBREAKING CHANGE: big change'

      expect(await resolveConventionalCommits('feat: title', [multiLine])).toBe('all')
    })

    it('all conventional commit types are accepted', async () => {
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
        expect(await resolveConventionalCommits(`${type}: something`, [`${type}: something`])).toBe(
          'all',
        )
      }
    })
  })
})
