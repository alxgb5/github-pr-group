// utils.js — Pure helper functions shared by background.js and popup.js
// Exported as an ES module so they can be unit-tested independently.

/**
 * Normalises a URL: strips trailing slashes and ignores query-params / hash.
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Extracts "owner/repo" from a GitHub html_url.
 * E.g. "https://github.com/owner/repo/pull/1" → "owner/repo"
 * @param {string} htmlUrl
 * @returns {string|null}
 */
export function repoFromHtmlUrl(htmlUrl) {
  try {
    const parts = new URL(htmlUrl).pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase();
  } catch {
    // invalid URL
  }
  return null;
}

/**
 * Returns the ISO date (YYYY-MM-DD) for N days ago — used for the GitHub
 * Search `created:>=` filter.
 * @param {number} days
 * @returns {string}
 */
export function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/**
 * Formats a Unix timestamp (seconds) as a locale time string.
 * @param {number} unixSeconds
 * @returns {string}
 */
export function formatResetTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

/**
 * Returns a human-readable relative time string for a timestamp in ms.
 * E.g. "à l'instant", "il y a 3 min", "il y a 2 h"
 * @param {number|null|undefined} timestampMs
 * @returns {string}
 */
export function timeAgo(timestampMs) {
  if (!timestampMs) return '—';
  const seconds = Math.floor((Date.now() - timestampMs) / 1000);
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours} h`;
}
