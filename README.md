# action-context

`action-context` is a GitHub Action that emits deterministic workflow context from git history and repository metadata.

Primary use cases:

- semantic version and environment derivation for build and release flows,
- pull request safety signals for merge policy steps,
- resolved runtime and tool versions as `<engine>-version` outputs.

## Adoption paths

### Path A: version and environment only

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
    ref: ${{ github.head_ref || github.ref }}

- uses: escapace/action-context@v0
  id: context
```

### Path B: pull request safety outputs enabled

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

  - uses: escapace/action-context@v0
    id: context
    with:
      token: ${{ secrets.GITHUB_TOKEN }}
      trusted-bots: |
        renovate[bot]
        dependabot[bot]
```

Outputs are available as `${{ steps.context.outputs.<name> }}`.

## Permission behavior: public vs private repositories

GitHub documentation for multiple read endpoints used by `pr-*` outputs (pull request commits, check runs, and combined commit status) states that public resources can be accessed without authentication.

| Repository visibility | Access pattern                                                                      | `pr-*` impact                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| public                | Public read endpoints may still return data even with minimal workflow permissions. | Pull request outputs may be populated instead of degraded.                                                       |
| private               | Pull request, checks, and status data require explicit token permissions.           | Missing `pull-requests: read`, `checks: read`, or `statuses: read` can trigger degraded defaults with a warning. |

For consistent behavior, declare explicit pull request permissions in workflows that depend on `pr-*` outputs, regardless of repository visibility.

## Checkout requirements

| Setting       | Value                                    | Reason                                                                                                               |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `fetch-depth` | `0`                                      | Full history is required to resolve semantic version tags and commit ranges.                                         |
| `ref`         | `${{ github.head_ref \|\| github.ref }}` | Pull request events otherwise default to synthetic merge refs, which can alter tag reachability and commit analysis. |

## Inputs

| Name           | Required | Default        | Description                                                                                  |
| -------------- | -------- | -------------- | -------------------------------------------------------------------------------------------- |
| `token`        | no       | `github.token` | Token used for changelog, GitHub Pages, and pull request API calls.                          |
| `node-version` | no       | _(empty)_      | Optional Node.js version constraint included in engine resolution.                           |
| `trusted-bots` | no       | `""`           | Newline-separated bot logins trusted for `pr-commits-trusted`. Matching is case-insensitive. |

## Outputs

### Core outputs

| Name                    | Example                          | Description                                                                         |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `version`               | `0.11.2-trunk.f2e1fe5`           | Computed semantic version.                                                          |
| `environment`           | `testing`                        | `testing`, `staging`, or `production`.                                              |
| `changelog`             | `## 1.2.0 ...`                   | Tag-event changelog markdown. Empty on non-tag events.                              |
| `short-commit`          | `f2e1fe5`                        | Abbreviated commit SHA.                                                             |
| `latest`                | `true`                           | `true` when `version` is greater than or equal to the highest semantic version tag. |
| `prerelease`            | `true`                           | `true` when `version` contains prerelease identifiers.                              |
| `prerelease-identifier` | `trunk`                          | First prerelease identifier; empty for release versions.                            |
| `github-pages`          | `false`                          | `true` when GitHub Pages is enabled with workflow builds.                           |
| `github-pages-path`     | `packages/docs/lib/github-pages` | Emitted only when exactly one workspace package defines `build:github-pages`.       |
| `node-version`          | `24.12.0`                        | Resolved node version from discovered constraints.                                  |

### Pull request outputs

| Name                 | Example        | Description                                                                                               |
| -------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `pr-number`          | `95`           | Pull request number. `0` when pull request context is unavailable.                                        |
| `pr-not-draft`       | `true`         | `true` when pull request is not draft.                                                                    |
| `pr-base-ref`        | `trunk`        | Pull request base branch. Empty when unavailable.                                                         |
| `pr-head-ref`        | `renovate/foo` | Pull request head branch. Empty when unavailable.                                                         |
| `pr-author-bot`      | `true`         | `true` when pull request author account type is `Bot`.                                                    |
| `pr-mergeable`       | `true`         | `true` when no merge conflicts are reported.                                                              |
| `pr-review-clear`    | `true`         | `true` when review state does not block merge.                                                            |
| `pr-checks-clear`    | `true`         | `true` when check runs and status contexts pass.                                                          |
| `pr-commits-trusted` | `true`         | `true` when every commit is signed and authored by an allowlisted bot or a human with write/admin access. |

### Dynamic engine outputs

Additional outputs use `<engine>-version` keys (for example, `pnpm-version`) when constraints are discovered.

## Event behavior matrix

| Event type            | Version/environment outputs                          | `pr-*` outputs                                                                | Notes                                                 |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `push`                | populated                                            | defaults (`pr-number: 0`, booleans `false`, refs empty)                       | No pull request context lookup.                       |
| `pull_request`        | populated                                            | populated when API access succeeds; defaults on pull request data degradation | Degradation emits warning and keeps action non-fatal. |
| `pull_request_target` | populated                                            | same behavior as `pull_request`                                               | Uses event pull request payload.                      |
| `tag`                 | populated (`environment`: `staging` or `production`) | defaults                                                                      | Changelog attempted on tag events.                    |

## Reliability behavior

### Pull request data degradation

When pull request API calls fail (including missing permissions), all `pr-*` outputs are reset to conservative defaults and a warning is emitted.

Design intent: downstream merge policy receives no false-positive readiness signal.

### Version discovery degradation

Version discovery is best effort and source-isolated:

- failures in `package.json`, workspace manifests, or `versions.json` do not fail the action,
- successful sources still emit outputs,
- partial source failures are intentionally silent.

## Merge policy example

```yaml
- name: Enable auto-merge
  if: |
    steps.context.outputs.pr-number != '0' &&
    steps.context.outputs.pr-author-bot == 'true' &&
    steps.context.outputs.pr-not-draft == 'true' &&
    steps.context.outputs.pr-mergeable == 'true' &&
    steps.context.outputs.pr-review-clear == 'true' &&
    steps.context.outputs.pr-checks-clear == 'true' &&
    steps.context.outputs.pr-commits-trusted == 'true'
  run: gh pr merge ${{ steps.context.outputs.pr-number }} --auto --squash
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For merge execution safety, use a head SHA guard (`expected_head_sha` or equivalent) where merge tooling supports it.

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
| branch or pull request event        | `testing`    |

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
