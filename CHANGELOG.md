# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-03-20

### Added
- Automatic tab group "Pull Requests" synced with the GitHub API every 2 minutes
- Filters review-requested PRs only (not authored), limited to the last 14 days, max 10 results
- Permanent dismiss: closing a tab manually excludes that PR from future syncs
- Options page: GitHub username, PAT, group color, excluded repos, Dependabot filter
- Popup: connection status, last sync timestamp, PR count, manual sync button, rate limit warning
- Rate limit awareness: reads `X-RateLimit-Remaining` / `X-RateLimit-Reset`, backs off on 403/429
- CI workflow: manifest validation, ESLint, CodeQL, production zip artifact
- Release workflow: SemVer tag validation, GitHub Release with changelog and SHA256 checksum

[1.0.0]: https://github.com/alxgb5/github-pr-group/releases/tag/v1.0.0
