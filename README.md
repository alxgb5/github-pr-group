# GitHub PR Group

A Chrome extension that automatically groups your GitHub Pull Requests into a single tab group — so you always know what needs your review.

![GitHub PR Group](docs/assets/banner.svg)

## What it does

Every 2 minutes, the extension queries the GitHub API for open PRs where you're requested as a reviewer. It then reconciles a dedicated **"Pull Requests"** tab group in your browser:

- **New PRs** → a tab is opened automatically (in the background, without interrupting you)
- **Merged or closed PRs** → the tab is removed
- **PRs you close manually** → permanently dismissed, never shown again
- **Tabs you're actively reading** → never force-closed, just ungrouped if the PR is gone

Everything happens silently. No notifications, no popups — just a tab group that stays in sync with your review queue.

## Features

| Feature | Details |
|---|---|
| Auto-sync | Polls every 2 minutes via `chrome.alarms` (MV3 compliant) |
| Review queue only | Only shows PRs where **you're requested as reviewer** |
| Recency filter | Limited to the **10 most recent PRs** opened in the **last 2 weeks** |
| Dismiss permanently | Close a tab manually → that PR is never re-opened |
| Exclude repos | Block entire repositories from ever appearing |
| Dependabot filter | One checkbox to silence all Dependabot PRs |
| Rate limit aware | Reads `X-RateLimit-*` headers, backs off automatically on 403/429 |
| Group color | Pick from 8 colors to match your workflow |

## Installation

> The extension is not on the Chrome Web Store. Load it manually in developer mode.

1. Clone or download this repository
2. Open **`chrome://extensions`**
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `extension/` folder

## Configuration

Click the extension icon → **Ouvrir les options**, or right-click the icon → **Options**.

**Required**
- **GitHub Username** — your GitHub login
- **Personal Access Token** — [create one here](https://github.com/settings/tokens/new) with scope `public_repo` (add `repo` if you work on private repositories)

**Filters**
- **Exclude Dependabot** — hides all PRs opened by `dependabot[bot]`
- **Excluded repos** — one `owner/repo` per line; PRs from these repos are ignored

**Dismissed PRs**
- When you close a tab from the group manually, that PR is permanently dismissed
- You can reset the dismissed list at any time from the Options page

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Open and close PR tabs |
| `tabGroups` | Create and manage the "Pull Requests" group |
| `storage` | Save your settings and dismissed PR list |
| `alarms` | Poll the API every 2 minutes (MV3 requires this instead of `setInterval`) |
| `https://api.github.com/*` | Fetch your review queue |

## Tech

Vanilla JavaScript, Manifest V3, no dependencies, no build step.

```
extension/
├── manifest.json
├── background.js   ← service worker: API polling + tab group reconciliation
├── popup.html/js   ← status + manual sync trigger
├── options.html/js ← settings form
└── icons/
```

## Privacy

Your GitHub token is stored locally in `chrome.storage.sync` (encrypted by Chrome, synced across your signed-in devices). It is only ever sent to `api.github.com`. No analytics, no telemetry, no third-party requests.

---

[GitHub Page →](https://alxgb5.github.io/github-pr-group)
