// background.js — Service Worker (Manifest V3)
// Toutes les opérations sont asynchrones et sans état persistant en mémoire.

const ALARM_NAME = 'pr-sync';
const ALARM_PERIOD_MINUTES = 2;
const GROUP_TITLE = 'Pull Requests';
const GITHUB_API = 'https://api.github.com';

// ─── État en mémoire (éphémère, réinitialisé si le service worker redémarre) ──
// tabId → normalizedUrl pour tous les onglets actuellement dans le groupe PR
const groupTabsCache = new Map();
// IDs des onglets qu'on ferme nous-mêmes (à ignorer dans onRemoved)
const selfRemovedTabIds = new Set();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise une URL : retire le trailing slash et ignore les query params. */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Retire le trailing slash du pathname
    u.pathname = u.pathname.replace(/\/+$/, '');
    // Ignore les query params et le hash
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/** Formate un timestamp Unix (secondes) en heure locale. */
function formatResetTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

// ─── GitHub API ──────────────────────────────────────────────────────────────

/**
 * Effectue un GET sur l'API GitHub avec gestion du rate limit.
 * Retourne { data, rateLimitRemaining, rateLimitReset } ou lève une erreur.
 */
async function githubFetch(path, pat) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '60', 10);
  const rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10);

  // Sauvegarde des infos rate limit à chaque appel
  await chrome.storage.local.set({ rateLimitRemaining, rateLimitReset });

  if (response.status === 403 || response.status === 429) {
    // Backoff : on mémorise le timestamp de reset
    await chrome.storage.local.set({ rateLimitBlocked: true, rateLimitReset });
    throw new Error(`Rate limit hit (${response.status}). Retry at ${formatResetTime(rateLimitReset)}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${response.statusText}`);
  }

  // Dès qu'on a une réponse valide, on lève le flag de blocage si < 5 restants
  if (rateLimitRemaining < 5) {
    await chrome.storage.local.set({ rateLimitBlocked: true, rateLimitReset });
    throw new Error(`Rate limit low (${rateLimitRemaining} remaining). Retry at ${formatResetTime(rateLimitReset)}`);
  } else {
    await chrome.storage.local.set({ rateLimitBlocked: false });
  }

  const data = await response.json();
  return { data, rateLimitRemaining, rateLimitReset };
}

/** Retourne la date ISO d'il y a N jours (pour le filtre created:>=). */
function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/** Extrait "owner/repo" depuis une html_url GitHub (ex: https://github.com/owner/repo/pull/1). */
function repoFromHtmlUrl(htmlUrl) {
  try {
    const parts = new URL(htmlUrl).pathname.split('/').filter(Boolean);
    // ['owner', 'repo', 'pull', '123']
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase();
  } catch {}
  return null;
}

/**
 * Récupère les PRs ouvertes sur lesquelles l'utilisateur est assigné en review,
 * limitées aux 10 plus récentes dans les 2 dernières semaines.
 * Applique les filtres : repos exclus, dependabot, URLs dismissées.
 * Retourne un Set d'URLs normalisées.
 *
 * @param {string} username
 * @param {string} pat
 * @param {{ excludedRepos: string[], excludeDependabot: boolean, dismissedUrls: string[] }} filters
 */
async function fetchPullRequestUrls(username, pat, { excludedRepos = [], excludeDependabot = false, dismissedUrls = [] } = {}) {
  const since = isoDateDaysAgo(14);
  const query = `/search/issues?q=is:open+is:pr+review-requested:${encodeURIComponent(username)}+created:>=${since}&per_page=10&sort=created&order=desc`;

  const excludedSet = new Set(excludedRepos.map((r) => r.toLowerCase().trim()).filter(Boolean));
  const dismissedSet = new Set(dismissedUrls);

  try {
    const { data } = await githubFetch(query, pat);
    const urlSet = new Set();

    for (const item of (data.items ?? [])) {
      if (!item.html_url) continue;

      // Filtre dependabot
      if (excludeDependabot) {
        const login = item.user?.login ?? '';
        if (login === 'dependabot[bot]' || login.startsWith('dependabot')) continue;
      }

      // Filtre repos exclus
      const repo = repoFromHtmlUrl(item.html_url);
      if (repo && excludedSet.has(repo)) continue;

      // Filtre PRs dismissées manuellement
      const normalized = normalizeUrl(item.html_url);
      if (dismissedSet.has(normalized)) continue;

      urlSet.add(normalized);
    }

    return urlSet;
  } catch (err) {
    console.error('[GH PR Group] fetchPullRequestUrls error:', err.message);
    throw err;
  }
}

/**
 * Met à jour le cache en mémoire des onglets du groupe PR.
 * Appelé après chaque sync pour que onRemoved puisse identifier les fermetures manuelles.
 */
async function updateGroupTabsCache(groupId) {
  groupTabsCache.clear();
  if (!groupId) return;
  try {
    const tabs = await chrome.tabs.query({ groupId });
    for (const tab of tabs) {
      if (tab.url) groupTabsCache.set(tab.id, normalizeUrl(tab.url));
    }
  } catch {
    // Le groupe n'existe peut-être plus
  }
}

// ─── Tab Group Management ────────────────────────────────────────────────────

/**
 * Trouve la fenêtre active (lastFocusedWindow) et retourne son ID.
 */
async function getActiveWindowId() {
  const win = await chrome.windows.getLastFocused({ populate: false });
  return win?.id ?? chrome.windows.WINDOW_ID_CURRENT;
}

/**
 * Cherche un tab group nommé "Pull Requests" dans la fenêtre donnée.
 * Retourne le groupe ou null.
 */
async function findPRGroup(windowId) {
  const groups = await chrome.tabGroups.query({ windowId, title: GROUP_TITLE });
  return groups.length > 0 ? groups[0] : null;
}

/**
 * Résout le groupId persisté en session, en vérifiant qu'il est encore valide.
 * Si obsolète, nettoie la session et retourne null.
 */
async function resolveStoredGroupId(windowId) {
  const { prGroupId } = await chrome.storage.session.get('prGroupId');
  if (!prGroupId) return null;

  try {
    const group = await chrome.tabGroups.get(prGroupId);
    // Vérifie que le groupe appartient toujours à la fenêtre active
    if (group && group.windowId === windowId) {
      return prGroupId;
    }
  } catch {
    // Le groupe n'existe plus
  }

  // Obsolète → nettoyage
  await chrome.storage.session.remove('prGroupId');
  return null;
}

/**
 * Crée un nouveau groupe d'onglets en utilisant directement le premier vrai onglet PR.
 * Chrome détruit le groupe si son dernier onglet est retiré, donc on ne crée jamais
 * de placeholder temporaire — on passe la première URL réelle.
 *
 * @param {number} windowId
 * @param {string} color
 * @param {string} firstUrl — URL du premier onglet PR à créer dans le groupe
 * @returns {{ groupId: number, firstTabId: number }}
 */
async function createPRGroup(windowId, color, firstUrl) {
  const tab = await chrome.tabs.create({ windowId, url: firstUrl, active: false });
  const groupId = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId } });
  await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: color ?? 'blue', collapsed: false });
  await chrome.storage.session.set({ prGroupId: groupId });
  return { groupId, firstTabId: tab.id };
}

/**
 * Fonction principale de réconciliation.
 */
async function syncPullRequests() {
  console.log('[GH PR Group] syncPullRequests() started');

  // ── 1. Lecture de la config ──────────────────────────────────────────────
  const { githubUsername, githubPAT, groupColor, excludedRepos, excludeDependabot } =
    await chrome.storage.sync.get(['githubUsername', 'githubPAT', 'groupColor', 'excludedRepos', 'excludeDependabot']);

  const { dismissedUrls = [] } = await chrome.storage.local.get('dismissedUrls');

  if (!githubUsername || !githubPAT) {
    console.warn('[GH PR Group] No credentials configured. Skipping sync.');
    await chrome.storage.local.set({ lastSyncError: 'Non configuré', lastSyncTimestamp: null });
    return;
  }

  // ── 2. Vérification du rate limit ────────────────────────────────────────
  const { rateLimitBlocked, rateLimitReset } = await chrome.storage.local.get([
    'rateLimitBlocked',
    'rateLimitReset',
  ]);

  if (rateLimitBlocked && rateLimitReset) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds < rateLimitReset) {
      console.warn(`[GH PR Group] Rate limit active. Retry at ${formatResetTime(rateLimitReset)}`);
      await chrome.storage.local.set({
        lastSyncError: `Rate limit — réessai à ${formatResetTime(rateLimitReset)}`,
      });
      return;
    }
    // Reset expiré → on lève le flag
    await chrome.storage.local.set({ rateLimitBlocked: false });
  }

  // ── 3. Récupération des PRs via l'API ────────────────────────────────────
  let apiUrls;
  try {
    apiUrls = await fetchPullRequestUrls(githubUsername, githubPAT, {
      excludedRepos: excludedRepos ?? [],
      excludeDependabot: excludeDependabot ?? false,
      dismissedUrls,
    });
  } catch (err) {
    await chrome.storage.local.set({ lastSyncError: err.message, lastSyncTimestamp: Date.now() });
    return;
  }

  console.log(`[GH PR Group] ${apiUrls.size} PR(s) found from API`);

  // ── 4. Résolution du tab group ───────────────────────────────────────────
  const windowId = await getActiveWindowId();
  let groupId = await resolveStoredGroupId(windowId);

  // Double-check via tabGroups.query (au cas où session serait désynchronisée)
  if (!groupId) {
    const existing = await findPRGroup(windowId);
    if (existing) {
      groupId = existing.id;
      await chrome.storage.session.set({ prGroupId: groupId });
    }
  }

  // ── 5. Récupération de l'onglet actif ────────────────────────────────────
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  const activeTabId = activeTab?.id;

  // ── 6. Récupération des onglets actuels du groupe ────────────────────────
  let groupTabs = [];
  if (groupId) {
    groupTabs = await chrome.tabs.query({ groupId, windowId });
  }

  const groupUrlMap = new Map(); // normalizedUrl → tab
  for (const tab of groupTabs) {
    if (tab.url) {
      groupUrlMap.set(normalizeUrl(tab.url), tab);
    }
  }

  // ── 7. Onglets à ajouter (dans l'API mais pas dans le groupe) ────────────
  const tabsToAdd = [];
  for (const url of apiUrls) {
    if (!groupUrlMap.has(url)) {
      tabsToAdd.push(url);
    }
  }

  // ── 8. Onglets à supprimer (dans le groupe mais pas dans l'API) ──────────
  const tabsToRemove = [];
  const tabsToUngroup = [];
  for (const [url, tab] of groupUrlMap.entries()) {
    if (!apiUrls.has(url)) {
      if (tab.id === activeTabId) {
        tabsToUngroup.push(tab.id);
      } else {
        tabsToRemove.push(tab.id);
      }
    }
  }

  // ── 9. Application des changements ───────────────────────────────────────

  const color = groupColor ?? 'blue';

  if (!groupId && tabsToAdd.length > 0) {
    // Cas : pas de groupe existant → on le crée avec le 1er onglet réel.
    // Ne jamais créer un placeholder : Chrome détruit le groupe dès que son
    // dernier onglet est retiré, ce qui rendrait le groupId immédiatement invalide.
    const [firstUrl, ...restUrls] = tabsToAdd;
    const { groupId: newGroupId } = await createPRGroup(windowId, color, firstUrl);
    groupId = newGroupId;
    console.log(`[GH PR Group] Created group ${groupId} with first tab: ${firstUrl}`);

    // Ajoute les onglets restants au groupe tout juste créé
    if (restUrls.length > 0) {
      const extraTabIds = [];
      for (const url of restUrls) {
        const tab = await chrome.tabs.create({ windowId, url, active: false });
        extraTabIds.push(tab.id);
      }
      await chrome.tabs.group({ tabIds: extraTabIds, groupId });
      console.log(`[GH PR Group] Added ${extraTabIds.length} more tab(s) to new group`);
    }
  } else if (groupId) {
    // Cas : groupe existant → mise à jour de la couleur
    await chrome.tabGroups.update(groupId, { color });

    // Suppression des onglets obsolètes (hors onglet actif)
    if (tabsToRemove.length > 0) {
      // On marque ces IDs pour que onRemoved sache qu'on les ferme nous-mêmes
      for (const id of tabsToRemove) selfRemovedTabIds.add(id);
      await chrome.tabs.remove(tabsToRemove);
      console.log(`[GH PR Group] Removed ${tabsToRemove.length} tab(s)`);
    }

    // Retrait du groupe pour l'onglet actif correspondant à une PR fermée/mergée
    if (tabsToUngroup.length > 0) {
      await chrome.tabs.ungroup(tabsToUngroup);
      console.log(`[GH PR Group] Ungrouped ${tabsToUngroup.length} active tab(s)`);
    }

    // Ajout des nouvelles PRs
    if (tabsToAdd.length > 0) {
      const newTabIds = [];
      for (const url of tabsToAdd) {
        const tab = await chrome.tabs.create({ windowId, url, active: false });
        newTabIds.push(tab.id);
      }
      await chrome.tabs.group({ tabIds: newTabIds, groupId });
      console.log(`[GH PR Group] Added ${newTabIds.length} tab(s)`);
    }
  }

  // ── 10. Nettoyage du groupe vide ─────────────────────────────────────────
  // Si après la réconciliation le groupe est vide, on peut le laisser vide
  // (Chrome le supprimera automatiquement quand le dernier onglet est retiré)

  // ── 11. Mise à jour du statut ────────────────────────────────────────────
  const finalGroupTabs = groupId ? await chrome.tabs.query({ groupId }) : [];
  await chrome.storage.local.set({
    lastSyncTimestamp: Date.now(),
    lastSyncError: null,
    prCount: finalGroupTabs.length,
  });

  console.log(`[GH PR Group] Sync complete. ${finalGroupTabs.length} tab(s) in group.`);

  // Met à jour le cache en mémoire pour que onRemoved détecte les fermetures manuelles
  await updateGroupTabsCache(groupId);
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[GH PR Group] onInstalled');
  await ensureAlarm();
  await syncPullRequests();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[GH PR Group] onStartup');
  await ensureAlarm();
  await syncPullRequests();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await syncPullRequests();
  }
});

// Détection des fermetures manuelles d'onglets du groupe PR
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (!groupTabsCache.has(tabId)) return; // Pas un onglet de notre groupe

  const url = groupTabsCache.get(tabId);
  groupTabsCache.delete(tabId);

  if (selfRemovedTabIds.has(tabId)) {
    // On l'a fermé nous-mêmes lors d'une sync → pas de dismiss
    selfRemovedTabIds.delete(tabId);
    return;
  }

  // Fermeture manuelle par l'utilisateur → dismiss permanent
  const { dismissedUrls = [] } = await chrome.storage.local.get('dismissedUrls');
  if (!dismissedUrls.includes(url)) {
    dismissedUrls.push(url);
    await chrome.storage.local.set({ dismissedUrls });
    console.log(`[GH PR Group] Dismissed PR permanently: ${url}`);
  }
});

// Message depuis le popup pour déclencher une sync immédiate
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'syncNow') {
    syncPullRequests()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // Indique une réponse asynchrone
  }
});

// ─── Alarm Setup ─────────────────────────────────────────────────────────────

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    console.log(`[GH PR Group] Alarm "${ALARM_NAME}" created (every ${ALARM_PERIOD_MINUTES} min)`);
  }
}
