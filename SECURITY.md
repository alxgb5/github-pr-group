# Security Policy

## Supported versions

Only the latest release receives security fixes.

| Version | Supported |
|---|---|
| 1.x (latest) | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/alxgb5/github-pr-group/security/advisories/new).

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested fix if you have one

You will receive a response within 7 days. If confirmed, a patch will be released as soon as possible and you will be credited in the release notes (unless you prefer to remain anonymous).

---

## Important note on your GitHub PAT

This extension requires a GitHub Personal Access Token (PAT) to call the API.

**What the extension does with your PAT:**
- Stores it in `chrome.storage.sync` — encrypted by Chrome and synced across your signed-in devices
- Sends it only to `https://api.github.com` via HTTPS
- Never logs it to the console
- Never sends it to any third-party server

**What you should do:**
- Use a **fine-grained PAT** with the minimum required scopes (`public_repo` or `repo` + `read:user`)
- Set an expiration date on your PAT
- Rotate it immediately if you suspect it has been compromised
- Never share your PAT or commit it to any repository

If you believe the extension is mishandling your PAT, please report it immediately via the process above.
