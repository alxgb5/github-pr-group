// tests/utils.test.js — Unit tests for extension/utils.js
// Uses the built-in Node.js test runner (node:test), no external dependencies.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUrl,
  repoFromHtmlUrl,
  isoDateDaysAgo,
  formatResetTime,
  timeAgo,
} from '../extension/utils.js';

// ─── normalizeUrl ─────────────────────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('strips trailing slash', () => {
    assert.equal(
      normalizeUrl('https://github.com/owner/repo/pull/1/'),
      'https://github.com/owner/repo/pull/1',
    );
  });

  it('removes query params and hash', () => {
    assert.equal(
      normalizeUrl('https://github.com/owner/repo/pull/1?foo=bar#files'),
      'https://github.com/owner/repo/pull/1',
    );
  });

  it('lowercases the result', () => {
    assert.equal(
      normalizeUrl('https://GitHub.com/Owner/Repo/pull/1'),
      'https://github.com/owner/repo/pull/1',
    );
  });

  it('handles invalid URLs gracefully', () => {
    const result = normalizeUrl('not-a-url/');
    assert.equal(result, 'not-a-url');
  });

  it('is idempotent', () => {
    const url = 'https://github.com/owner/repo/pull/42';
    assert.equal(normalizeUrl(normalizeUrl(url)), url);
  });
});

// ─── repoFromHtmlUrl ──────────────────────────────────────────────────────────

describe('repoFromHtmlUrl', () => {
  it('extracts owner/repo from a PR URL', () => {
    assert.equal(repoFromHtmlUrl('https://github.com/owner/repo/pull/123'), 'owner/repo');
  });

  it('lowercases the result', () => {
    assert.equal(repoFromHtmlUrl('https://github.com/Owner/Repo/pull/1'), 'owner/repo');
  });

  it('returns null for an invalid URL', () => {
    assert.equal(repoFromHtmlUrl('not-a-url'), null);
  });

  it('returns null when path has fewer than 2 segments', () => {
    assert.equal(repoFromHtmlUrl('https://github.com/owner'), null);
  });
});

// ─── isoDateDaysAgo ───────────────────────────────────────────────────────────

describe('isoDateDaysAgo', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = isoDateDaysAgo(7);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today for 0 days ago', () => {
    const today = new Date().toISOString().split('T')[0];
    assert.equal(isoDateDaysAgo(0), today);
  });

  it('returns a date in the past for positive days', () => {
    const result = new Date(isoDateDaysAgo(14));
    const now = new Date();
    assert.ok(result < now, 'date should be in the past');
  });
});

// ─── formatResetTime ──────────────────────────────────────────────────────────

describe('formatResetTime', () => {
  it('returns a non-empty string', () => {
    const result = formatResetTime(Math.floor(Date.now() / 1000) + 3600);
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  it('formats unix epoch 0 without throwing', () => {
    assert.doesNotThrow(() => formatResetTime(0));
  });
});

// ─── timeAgo ─────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns "—" for null/undefined', () => {
    assert.equal(timeAgo(null), '—');
    assert.equal(timeAgo(undefined), '—');
    assert.equal(timeAgo(0), '—');
  });

  it('returns "à l\'instant" for very recent timestamps', () => {
    assert.equal(timeAgo(Date.now() - 5_000), "à l'instant");
  });

  it('returns seconds for timestamps < 60 s ago', () => {
    const result = timeAgo(Date.now() - 30_000);
    assert.match(result, /^il y a \d+ s$/);
  });

  it('returns minutes for timestamps between 1 min and 1 h ago', () => {
    const result = timeAgo(Date.now() - 5 * 60_000);
    assert.match(result, /^il y a \d+ min$/);
  });

  it('returns hours for timestamps > 1 h ago', () => {
    const result = timeAgo(Date.now() - 2 * 3_600_000);
    assert.match(result, /^il y a \d+ h$/);
  });
});
