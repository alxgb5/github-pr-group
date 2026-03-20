# Contributing

## Local setup

No build step required. The files in `extension/` are directly loadable in Chrome.

```bash
git clone https://github.com/alxgb5/github-pr-group
cd github-pr-group
npm install          # installs ESLint only — no runtime dependencies
```

### Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. To reload after code changes: click the **↺** button on the extension card

### Lint

```bash
npm run lint         # check
npm run lint:fix     # auto-fix
```

---

## Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `ci` | CI/CD changes |
| `docs` | Documentation only |
| `refactor` | Code change with no feature or fix |
| `chore` | Maintenance (deps, config) |

Examples:
```
feat: add option to limit PR count
fix: group not created on first sync
ci: bump checkout action to v6
```

---

## Pull Request process

1. Branch from `main`
2. Make your changes and run `npm run lint`
3. Update `CHANGELOG.md` under `[Unreleased]`
4. If the change is user-facing, bump the version in `extension/manifest.json`
5. Open a PR — the CI will run automatically
6. A maintainer will review and merge

## Releasing

Only maintainers can release. The process:

```bash
# 1. Update version in extension/manifest.json
# 2. Move [Unreleased] section to [X.Y.Z] in CHANGELOG.md
# 3. Commit
git add extension/manifest.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
git push

# 4. Tag — this triggers the release workflow
git tag vX.Y.Z
git push origin vX.Y.Z
```
