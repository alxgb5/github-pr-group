// popup.js

import { timeAgo } from './utils.js';

const statusValue = document.getElementById('statusValue');
const lastSyncEl = document.getElementById('lastSync');
const prCountEl = document.getElementById('prCount');
const rateLimitWarning = document.getElementById('rateLimitWarning');
const btnSync = document.getElementById('btnSync');
const btnOptions = document.getElementById('btnOptions');
const syncStatusEl = document.getElementById('syncStatus');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Load state ───────────────────────────────────────────────────────────────

async function loadState() {
  const { githubUsername, githubPAT } = await chrome.storage.sync.get([
    'githubUsername',
    'githubPAT',
  ]);
  const { lastSyncTimestamp, lastSyncError, prCount, rateLimitBlocked, rateLimitReset } =
    await chrome.storage.local.get([
      'lastSyncTimestamp',
      'lastSyncError',
      'prCount',
      'rateLimitBlocked',
      'rateLimitReset',
    ]);

  // Statut de connexion
  if (!githubUsername || !githubPAT) {
    statusValue.textContent = 'Non configuré → Ouvrir les options';
    statusValue.className = 'value not-configured';
    btnSync.disabled = true;
  } else {
    statusValue.textContent = `@${githubUsername}`;
    statusValue.className = 'value connected';
    btnSync.disabled = false;
  }

  // Dernière sync
  if (lastSyncError && !lastSyncTimestamp) {
    lastSyncEl.textContent = 'Jamais';
    lastSyncEl.className = 'value warning';
  } else {
    lastSyncEl.textContent = timeAgo(lastSyncTimestamp);
    lastSyncEl.className = 'value';
  }

  // Nombre de PRs
  prCountEl.textContent = prCount !== null && prCount !== undefined ? prCount : '—';

  // Rate limit warning
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (rateLimitBlocked && rateLimitReset && nowSeconds < rateLimitReset) {
    rateLimitWarning.style.display = 'block';
    rateLimitWarning.textContent = `Rate limit atteint — réessai à ${formatTime(rateLimitReset)}`;
    btnSync.disabled = true;
  } else {
    rateLimitWarning.style.display = 'none';
  }
}

// ─── Sync button ─────────────────────────────────────────────────────────────

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  syncStatusEl.textContent = 'Synchronisation…';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'syncNow' });
    if (response?.ok) {
      syncStatusEl.textContent = 'Synchronisation terminée !';
    } else {
      syncStatusEl.textContent = `Erreur : ${response?.error ?? 'inconnue'}`;
    }
  } catch (err) {
    syncStatusEl.textContent = `Erreur : ${err.message}`;
  }

  // Recharge l'état après la sync
  await loadState();

  setTimeout(() => {
    syncStatusEl.textContent = '';
    btnSync.disabled = false;
  }, 2000);
});

// ─── Options button ──────────────────────────────────────────────────────────

btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Init ────────────────────────────────────────────────────────────────────

loadState();
