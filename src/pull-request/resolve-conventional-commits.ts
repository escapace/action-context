import lint from '@commitlint/lint'
import config from '@commitlint/config-conventional'

export type ConventionalCommitsResult = 'all' | 'commits-only' | 'none' | 'title-only'

/**
 * Parser options extracted from conventional-changelog-conventionalcommits
 * as resolved by commitlint's load utility. Hardcoded to avoid the heavy
 * dependency tree of the load package (cosmiconfig, typescript-loader, lodash).
 *
 * Without these options, the default parser does not recognize the `!`
 * breaking change syntax (e.g., `feat!: something`).
 */
const PARSER_OPTS = {
  breakingHeaderPattern: /^(\w*)(?:\(([\w$.\-* ]*)\))?!:\s(.*)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
  headerPattern: /^(\w*)(?:\(([\w$.\-* ]*)\))?!?:\s(.*)$/,
  issuePrefixes: ['#'],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  revertCorrespondence: ['header', 'hash'],
  // eslint-disable-next-line regexp/no-super-linear-backtracking -- upstream pattern from conventional-changelog-conventionalcommits
  revertPattern: /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i,
}

const LINT_OPTS = { parserOpts: PARSER_OPTS }

/**
 * Validate a single message against conventional commit rules.
 *
 * Returns false for empty or whitespace-only messages because
 * `lint()` returns `valid: true` for empty strings.
 */
const isConventional = async (message: string): Promise<boolean> => {
  if (message.trim().length === 0) return false

  const result = await lint(message, config.rules, LINT_OPTS)

  return result.valid
}

/**
 * Evaluate PR title and commit messages against conventional commit format.
 *
 * Returns an enum value indicating which combination of title and commits
 * follow conventional commit conventions, for merge strategy selection.
 */
export const resolveConventionalCommits = async (
  title: string,
  commitMessages: string[],
): Promise<ConventionalCommitsResult> => {
  const titleValid = await isConventional(title)

  const commitsValid =
    commitMessages.length > 0 &&
    (await Promise.all(commitMessages.map(isConventional))).every(Boolean)

  if (titleValid && commitsValid) return 'all'
  if (titleValid) return 'title-only'
  if (commitsValid) return 'commits-only'

  return 'none'
}
