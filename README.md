# action-context

A GitHub Action that derives semantic versioning, environment classification, and build metadata from git history and repository configuration. Downstream workflow steps consume these outputs to coordinate releases, deployments, and build tooling.

## Usage

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
    ref: ${{ github.head_ref || github.ref }}

- uses: escapace/action-context@v0
  id: context
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

Outputs are then available as `${{ steps.context.outputs.<name> }}`.

### Checkout requirements

The action reads git history to derive versions from tags and conventional commits. Two checkout settings are required:

- **`fetch-depth: 0`** — full history is needed to locate semver tags and compute diffs. Shallow clones cause the action to fail.
- **`ref: ${{ github.head_ref || github.ref }}`** — on `pull_request` events, `actions/checkout` defaults to a synthetic merge commit at `refs/pull/<number>/merge`. That merge commit includes base-branch history not present on the PR branch, which can alter tag reachability and commit analysis. `github.head_ref` (populated only on PR events) resolves to the source branch name, while `github.ref` provides the correct ref for `push` and tag events. The `||` fallback handles both cases in a single expression.

## Inputs

| Name           | Required | Default        | Description                                                                                                                 |
| -------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `token`        | No       | `github.token` | GitHub API token for changelog generation and GitHub Pages detection.                                                       |
| `node-version` | No       |                | Node.js version constraint. Pooled with `package.json` engines and workspace constraints; the highest minimum version wins. |

## Outputs

| Name                    | Example                          | Description                                                                                                        |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `version`               | `0.11.2-trunk.f2e1fe5`           | Computed semantic version.                                                                                         |
| `environment`           | `testing`                        | One of `testing`, `staging`, or `production`.                                                                      |
| `changelog`             | _(markdown)_                     | Changelog generated from conventional commits. Non-empty on tag events only.                                       |
| `short-commit`          | `f2e1fe5`                        | Abbreviated commit SHA (7 characters, extended past leading zeros).                                                |
| `latest`                | `true`                           | Whether the current version is greater than or equal to the highest existing tag.                                  |
| `prerelease`            | `true`                           | Whether the version contains prerelease identifiers.                                                               |
| `prerelease-identifier` | `trunk`                          | First prerelease identifier (for example, `rc` from `1.2.0-rc.1`). Empty for release versions.                     |
| `node-version`          | `24.12.0`                        | Resolved Node.js version from inputs, `package.json` engines, or workspace packages.                               |
| `github-pages`          | `false`                          | Whether GitHub Pages is enabled with workflow-based builds.                                                        |
| `github-pages-path`     | `packages/docs/lib/github-pages` | Relative path to static assets. Set only when exactly one workspace package defines a `build:github-pages` script. |

Additional `<engine>-version` outputs (for example, `pnpm-version`) are emitted when engine constraints appear in `package.json`, workspace packages, or a `versions.json` file at the repository root.

## Version derivation

### Tag events

The git tag name is parsed directly as a semantic version. Invalid semver tags cause the action to fail.

### Branch events

1. The most recent semver tag reachable from the current branch is located.
2. All commits between that tag and `HEAD` are analyzed against the [conventional commits](https://www.conventionalcommits.org/) format.
3. The version is bumped according to commit types: `feat!:` or `BREAKING CHANGE:` triggers a major bump, `feat:` triggers minor, `fix:` triggers patch. When no commits match, the default increment is patch.
4. The branch name and short commit hash are appended as prerelease identifiers: `0.11.2-trunk.f2e1fe5`.
5. If no prior tag exists, the version starts at `0.1.0` with the prerelease suffix.

## Environment classification

| Condition                           | Environment  |
| ----------------------------------- | ------------ |
| Tag without prerelease identifiers  | `production` |
| Tag with prerelease identifiers     | `staging`    |
| Branch event (push or pull request) | `testing`    |

## Engine version resolution

The action collects semver range constraints from four sources, pools them by engine name, and emits the highest minimum version for each engine as `<engine>-version`.

### Sources

- **Action input** — the `node-version` input, normalized with `semver.clean()`. Participates in the same selection as other sources; it does not unconditionally override them.
- **Root `package.json`** — the `engines` and `devEngines` fields, when the file exists. The `devEngines.runtime` and `devEngines.packageManager` entries are mapped to their canonical engine names.
- **PNPM workspace packages** — `engines` and `devEngines` fields from each package manifest. Scanned only when a root `package.json` is present. The `devEngines.runtime` and `devEngines.packageManager` entries are mapped to their canonical engine names.
- **`versions.json`** — a file at the repository root. Supports two entry formats: `{ "tool": "1.5.0" }` and `{ "tool": { "version": "1.5.0" } }`. Checked independently of `package.json`.

### Selection

All collected constraints are grouped by engine name (normalized to kebab-case). Within each group, the range whose minimum satisfying version is highest wins, and that minimum version becomes the output value. Entries with invalid semver ranges are silently dropped. If two engine names normalize to the same kebab-case key but resolve to different versions, the action throws an error.

For example, given `node: >=22.15.2 || >=22.15.1` from one package and `node: >=22.15.0` from another: `minVersion` of the first range is `22.15.1`, and of the second is `22.15.0`. The first range wins, emitting `node-version: 22.15.1`.
