# action-context

`action-context` is a GitHub Action that emits deterministic workflow context from git history and repository metadata.

Primary use cases:

- semantic version and environment derivation for build and release flows,
- pull request safety signals for merge policy steps,
- resolved runtime and tool versions as `<engine>-version` outputs.

## Operating modes

Select the mode by trigger type and whether merge policy consumes `pr-*` outputs.

| Mode                       | Typical triggers                                 | `context-source`  | PR-specific inputs                                                | `pr-*` outputs                                                                                            |
| -------------------------- | ------------------------------------------------ | ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Branch metadata mode       | `push` (branch)                                  | `event` (default) | none                                                              | defaults (`pr-number: 0`, booleans `false`, refs empty)                                                   |
| Pull request event mode    | `pull_request`                                   | `event` (default) | none                                                              | populated from PR payload and API; degraded to defaults on API/permission failures                        |
| Explicit pull request mode | `workflow_call`, `workflow_dispatch`, `schedule` | `pr`              | `pr-number` required; `pr-head-ref`/`pr-head-sha` optional guards | populated from explicit PR number and current API state; invalid PR inputs fail fast (`PR_INPUT_INVALID`) |
| Tag release mode           | tag-triggered workflows                          | `event` (default) | none                                                              | defaults (`pr-number: 0`, booleans `false`, refs empty)                                                   |

### Shared checkout contract

| Setting                   | Required value                           | Reason                                                                                                    |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `fetch-depth`             | `0`                                      | Full history is required for semantic tag reachability and commit range analysis.                         |
| `ref` in event mode       | `${{ github.head_ref \|\| github.ref }}` | Pull request events otherwise use synthetic merge refs, which can change branch-based version derivation. |
| `ref` in explicit PR mode | `${{ inputs.pr-head-ref }}`              | Branch-ref checkout is required for parity with event-mode branch/tag ancestry checks.                    |

### Branch metadata mode

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
    ref: ${{ github.head_ref || github.ref }}

- uses: escapace/action-context@v0.2.0
  id: context
```

### Pull request event mode

```yaml
permissions:
  contents: read
  pull-requests: read
  checks: read
  statuses: read

steps:
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0
      ref: ${{ github.head_ref || github.ref }}

  - uses: escapace/action-context@v0.2.0
    id: context
    with:
      trusted-bots: |
        renovate[bot]
        dependabot[bot]
```

### Explicit pull request mode

Reusable workflows typically define `pr-number`, `pr-head-ref`, and `pr-head-sha` as required `workflow_call` inputs.

```yaml
permissions:
  contents: read
  pull-requests: read
  checks: read
  statuses: read

steps:
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0
      ref: ${{ inputs.pr-head-ref }}

  - uses: escapace/action-context@v0.2.0
    id: context
    with:
      context-source: pr
      pr-number: ${{ inputs.pr-number }}
      pr-head-ref: ${{ inputs.pr-head-ref }}
      pr-head-sha: ${{ inputs.pr-head-sha }}
      trusted-bots: |
        renovate[bot]
        dependabot[bot]
```

When `pr-head-ref` or `pr-head-sha` is provided and does not match current API data, the action fails with `PR_INPUT_INVALID`.

### Tag release mode

```yaml
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          ref: ${{ github.ref }}

      - uses: escapace/action-context@v0.2.0
        id: context
```

Tag mode parses `GITHUB_REF_NAME` as semantic version. Invalid semantic tags fail the action.

Outputs are exposed as `${{ steps.context.outputs.<name> }}`.

## Permission behavior: public vs private repositories

GitHub documentation for multiple read endpoints used by `pr-*` outputs (pull request commits, check runs, and combined commit status) states that public resources can be accessed without authentication.

| Repository visibility | Access pattern                                                                      | `pr-*` impact                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| public                | Public read endpoints may still return data even with minimal workflow permissions. | Pull request outputs may be populated instead of degraded.                                                       |
| private               | Pull request, checks, and status data require explicit token permissions.           | Missing `pull-requests: read`, `checks: read`, or `statuses: read` can trigger degraded defaults with a warning. |

For consistent behavior, declare explicit pull request permissions in workflows that depend on `pr-*` outputs, regardless of repository visibility.

## Inputs

| Name             | Required | Default        | Description                                                                                  |
| ---------------- | -------- | -------------- | -------------------------------------------------------------------------------------------- |
| `context-source` | no       | `event`        | Context mode: `event` (derive from workflow event) or `pr` (derive from explicit PR inputs). |
| `node-version`   | no       | _(empty)_      | Optional Node.js version constraint included in engine resolution.                           |
| `pr-head-ref`    | no       | _(empty)_      | Optional guard for `context-source=pr`; mismatch fails with `PR_INPUT_INVALID`.              |
| `pr-head-sha`    | no       | _(empty)_      | Optional guard for `context-source=pr`; mismatch fails with `PR_INPUT_INVALID`.              |
| `pr-number`      | no       | _(empty)_      | PR number used when `context-source=pr`; must be a positive integer.                         |
| `token`          | no       | `github.token` | Token used for changelog, GitHub Pages, and pull request API calls.                          |
| `trusted-bots`   | no       | `""`           | Newline-separated bot logins trusted for `pr-commits-trusted`. Matching is case-insensitive. |

## Outputs

### Core outputs

| Name                    | Example                          | Description                                                                                                       |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `version`               | `0.11.2-trunk.f2e1fe5`           | Computed semantic version.                                                                                        |
| `environment`           | `testing`                        | `testing` for non-tag events, `staging` for prerelease tags, `production` for release tags.                       |
| `changelog`             | `## 1.2.0 ...`                   | Tag-event changelog markdown. Empty on non-tag events.                                                            |
| `short-commit`          | `f2e1fe5`                        | Abbreviated commit SHA.                                                                                           |
| `latest`                | `true`                           | `true` when `version` is greater than or equal to the highest stable semantic version tag (prereleases excluded). |
| `prerelease`            | `true`                           | `true` when `version` contains prerelease identifiers.                                                            |
| `prerelease-identifier` | `trunk`                          | First prerelease identifier; empty for release versions.                                                          |
| `github-pages`          | `false`                          | `true` when GitHub Pages is enabled with workflow builds.                                                         |
| `github-pages-path`     | `packages/docs/lib/github-pages` | Emitted only when exactly one workspace package defines `build:github-pages`.                                     |
| `node-version`          | `24.12.0`                        | Resolved node version from discovered constraints.                                                                |

### `latest` interpretation in feature branches and pull requests

`latest` compares the computed `version` against the highest stable semantic version tag in the repository. Prerelease tags are excluded from this comparison.

| Existing tags           | Computed branch/PR `version` | Comparison target | `latest` |
| ----------------------- | ---------------------------- | ----------------- | -------- |
| `v0.11.1`               | `0.12.0-feature-a.abc1234`   | `0.11.1`          | `true`   |
| `v1.2.0`, `v1.3.0-rc.1` | `1.2.1-feature-a.abc1234`    | `1.2.0`           | `true`   |
| `v1.2.0`, `v1.3.0-rc.1` | `1.3.0-feature-a.abc1234`    | `1.2.0`           | `true`   |
| `v1.2.0`, `v1.3.0`      | `1.3.0-feature-a.abc1234`    | `1.3.0`           | `false`  |
| `v1.2.0`, `v1.3.0`      | `1.3.1-feature-a.abc1234`    | `1.3.0`           | `true`   |
| _no stable tags_        | `0.1.0-feature-a.abc1234`    | none              | `true`   |

A shallow checkout fails before `latest` evaluation. Use `fetch-depth: 0`.

### Pull request outputs

| Name                   | Example        | Description                                                                                               |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `pr-number`            | `95`           | Pull request number. `0` when pull request context is unavailable.                                        |
| `pr-not-draft`         | `true`         | `true` when pull request is not draft.                                                                    |
| `pr-base-ref`          | `trunk`        | Pull request base branch. Empty when unavailable.                                                         |
| `pr-head-ref`          | `renovate/foo` | Pull request head branch. Empty when unavailable.                                                         |
| `pr-author-bot`        | `true`         | `true` when pull request author account type is `Bot`.                                                    |
| `pr-mergeable`         | `true`         | `true` when no merge conflicts are reported.                                                              |
| `pr-review-clear`      | `true`         | `true` when review state does not block merge.                                                            |
| `pr-checks-clear`      | `true`         | `true` when check runs and status contexts pass.                                                          |
| `pr-merge-state-clear` | `true`         | `true` when GitHub reports merge-ready state (`CLEAN` or `HAS_HOOKS`).                                    |
| `pr-commits-trusted`   | `true`         | `true` when every commit is signed and authored by an allowlisted bot or a human with write/admin access. |

### Dynamic engine outputs

Additional outputs use `<engine>-version` keys (for example, `pnpm-version`) when constraints are discovered.

## Event behavior matrix

| Workflow context                                                          | Version/environment outputs                          | `pr-*` outputs                                                                       | Notes                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `push`                                                                    | populated                                            | defaults (`pr-number: 0`, booleans `false`, refs empty)                              | No pull request lookup.                                                        |
| `pull_request`                                                            | populated                                            | populated when API access succeeds; defaults on pull request data degradation        | Degradation emits warning and remains non-fatal.                               |
| `tag`                                                                     | populated (`environment`: `staging` or `production`) | defaults                                                                             | Changelog attempted on tag events.                                             |
| `workflow_call`, `workflow_dispatch`, `schedule` with `context-source=pr` | populated                                            | populated from explicit PR number and current API state; invalid PR inputs fail fast | Supports deterministic pull request evaluation outside PR-triggered workflows. |

## Reliability behavior

### Pull request data degradation

When pull request output collection fails (including missing permissions for pull request, checks, or statuses endpoints), all `pr-*` outputs are reset to conservative defaults and a warning is emitted.

In explicit pull request mode, invalid PR input guards (`pr-number`, `pr-head-ref`, `pr-head-sha`) fail fast with `PR_INPUT_INVALID` before output collection.

### Version discovery degradation

Version discovery is best effort and source-isolated:

- failures in `package.json`, workspace manifests, or `versions.json` do not fail the action,
- successful sources still emit outputs,
- partial source failures are intentionally silent.

## Automerge

Reference workflow: [`.github/workflows/automerge.yaml`](.github/workflows/automerge.yaml)

For use outside this repository, change `uses: ./` to `uses: escapace/action-context@v0.2.0` in the `evaluate pull request context` step.

This repository includes a canonical automerge workflow that discovers open pull requests on a schedule (and optional manual dispatch), evaluates `action-context` in explicit PR mode, and enables auto-merge when policy gates pass.

Core behavior:

- workflow triggers are `schedule` and `workflow_dispatch`,
- pull request evaluation uses `context-source: pr` with explicit `pr-number`, `pr-head-ref`, and `pr-head-sha`,
- policy gate is strict and requires all of: `pr-number != 0`, `pr-author-bot`, `pr-not-draft`, `pr-mergeable`, `pr-commits-trusted`, `pr-checks-clear`, and `pr-merge-state-clear`,
- merge execution is guarded with `--match-head-commit` to prevent stale-head merges,
- one command path is used for both queue-required and non-queue branches.

Command model:

```bash
gh pr merge "$PR_NUMBER" --auto --squash --match-head-commit "$HEAD_SHA"
```

Rationale:

- `--auto` enables deferred merge behavior when requirements are not yet satisfied,
- `--squash` keeps non-interactive, non-queue execution deterministic,
- queue-required branches remain controlled by merge queue settings; queue merge method is configured at branch protection/ruleset level.

Important: schedule/dispatch execution avoids `pull_request` event liveness gaps. Review and check state changes are re-evaluated on each run, and GitHub remains authoritative for final merge completion under branch protection and rulesets.

GitHub-hosted runners already include GitHub CLI. Steps that call `gh` require `GH_TOKEN`.

Permission baseline for a single evaluate-and-enable job:

```yaml
permissions:
  contents: write
  pull-requests: write
  checks: read
  statuses: read
```

Repository prerequisites:

- **Allow auto-merge** enabled,
- caller has write access,
- branch protection and merge queue settings configured according to repository policy.

Merge queue note:

- required checks for queue flow must be reported on `merge_group` events,
- checks configured only for `pull_request` can block queue merges.

```yaml
on:
  pull_request:
  merge_group:
    types: [checks_requested]
```

Reference documents:

- [`gh pr merge` command manual](https://cli.github.com/manual/gh_pr_merge)
- [Using GitHub CLI in workflows](https://docs.github.com/en/actions/using-workflows/using-github-cli-in-workflows)
- [Automatically merging a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)
- [Merging a pull request with a merge queue](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue)
- [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [Events that trigger workflows: `merge_group`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)

## Version derivation

### Tag events

`GITHUB_REF_NAME` is parsed as semantic version. Invalid semantic version tags fail the action.

### Branch and pull request events

1. Resolve the latest reachable semantic version tag.
2. Analyze commits since that tag using Conventional Commits.
3. Apply increment priority: major (`feat!` / `BREAKING CHANGE`) > minor (`feat`) > patch (`fix`) > default patch.
4. Append prerelease metadata `<branch>.<short-sha>`.
5. If no prior semantic version tag exists, start from `0.1.0-<branch>+<short-sha>`.

## Environment classification

| Condition                           | Output       |
| ----------------------------------- | ------------ |
| release tag (no prerelease segment) | `production` |
| prerelease tag                      | `staging`    |
| non-tag event                       | `testing`    |

## Engine version resolution

Constraints are collected from:

- `node-version` input,
- root `package.json` (`engines`, `devEngines`),
- workspace package manifests (`engines`, `devEngines`),
- root `versions.json`.

Selection rule:

- group constraints by engine key,
- select the range with the highest minimum satisfying version,
- emit that minimum as `<engine>-version`.

Invalid semantic version ranges are skipped.
