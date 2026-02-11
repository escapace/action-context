import { validateConventionalCommit } from './validate-conventional-commit'

export type ConventionalCommitsResult = 'all' | 'commits-only' | 'none' | 'title-only'

/**
 * Evaluate PR title and commit messages against conventional commit format.
 *
 * Returns an enum value indicating which combination of title and commits
 * follow conventional commit conventions, for merge strategy selection.
 */
export const resolveConventionalCommits = (
  title: string,
  commitMessages: string[],
): ConventionalCommitsResult => {
  const titleValid = validateConventionalCommit(title)

  const commitsValid = commitMessages.length > 0 && commitMessages.every(validateConventionalCommit)

  if (titleValid && commitsValid) return 'all'
  if (titleValid) return 'title-only'
  if (commitsValid) return 'commits-only'

  return 'none'
}
