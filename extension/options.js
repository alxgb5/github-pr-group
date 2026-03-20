// options.js

const usernameInput = document.getElementById('username');
const patInput = document.getElementById('pat');
const excludeDependabotCb = document.getElementById('excludeDependabot');
const excludedReposInput = document.getElementById('excludedRepos');
const groupColorInput = document.getElementById('groupColor');
const colorGrid = document.getElementById('colorGrid');
const dismissedCountEl = document.getElementById('dismissedCount');
const dismissedListEl = document.getElementById('dismissedList');
const btnClearDismissed = document.getElementById('btnClearDismissed');
const btnSave = document.getElementById('btnSave');
const btnTest = document.getElementById('btnTest');
const statusEl = document.getElementById('status');

// ─── Color picker ────────────────────────────────────────────────────────────

function selectColor(color) {
  groupColorInput.value = color;
  document.querySelectorAll('.color-dot').forEach((dot) => {
    dot.classList.toggle('selected', dot.dataset.color === color);
  });
}

colorGrid.addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (dot) selectColor(dot.dataset.color);
});

// ─── Status display ──────────────────────────────────────────────────────────

function showStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = type;
}

function clearStatus() {
  statusEl.className = '';
  statusEl.textContent = '';
}

// ─── Load saved settings ─────────────────────────────────────────────────────

async function loadSettings() {
  const { githubUsername, githubPAT, groupColor, excludedRepos, excludeDependabot } =
    await chrome.storage.sync.get([
      'githubUsername',
      'githubPAT',
      'groupColor',
      'excludedRepos',
      'excludeDependabot',
    ]);

  if (githubUsername) usernameInput.value = githubUsername;
  if (githubPAT) patInput.value = githubPAT;
  selectColor(groupColor ?? 'blue');

  excludeDependabotCb.checked = excludeDependabot ?? false;

  // excludedRepos est stocké comme tableau, affiché une ligne par repo
  if (Array.isArray(excludedRepos) && excludedRepos.length > 0) {
    excludedReposInput.value = excludedRepos.join('\n');
  }

  await loadDismissedList();
}

/** Extracts a short human-readable label from a normalised GitHub PR URL. */
function prLabel(url) {
  try {
    const { pathname } = new URL(url);
    // pathname = /owner/repo/pull/123
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 4) {
      return { repo: `${parts[0]}/${parts[1]}`, pr: `#${parts[3]}` };
    }
  } catch {
    // fall through
  }
  return { repo: url, pr: '' };
}

async function loadDismissedList() {
  const { dismissedUrls = [] } = await chrome.storage.local.get('dismissedUrls');
  dismissedCountEl.textContent = dismissedUrls.length;
  btnClearDismissed.disabled = dismissedUrls.length === 0;

  dismissedListEl.innerHTML = '';

  if (dismissedUrls.length === 0) {
    dismissedListEl.innerHTML = '<p class="dismissed-empty">Aucune PR ignorée.</p>';
    return;
  }

  for (const url of dismissedUrls) {
    const { repo, pr } = prLabel(url);

    const item = document.createElement('div');
    item.className = 'dismissed-item';

    const label = document.createElement('span');
    label.className = 'dismissed-item-label';
    label.title = url;
    label.innerHTML = `<strong>${repo}</strong> ${pr}`;

    const btn = document.createElement('button');
    btn.className = 'btn-danger';
    btn.textContent = 'Réafficher';
    btn.addEventListener('click', async () => {
      const { dismissedUrls: current = [] } = await chrome.storage.local.get('dismissedUrls');
      await chrome.storage.local.set({ dismissedUrls: current.filter((u) => u !== url) });
      await loadDismissedList();
      showStatus('PR remise en liste. Elle réapparaîtra à la prochaine sync.', 'success');
      setTimeout(clearStatus, 3000);
    });

    item.appendChild(label);
    item.appendChild(btn);
    dismissedListEl.appendChild(item);
  }
}

// ─── Save settings ───────────────────────────────────────────────────────────

btnSave.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const pat = patInput.value.trim();
  const color = groupColorInput.value;
  const excludeDependabot = excludeDependabotCb.checked;

  // Parse repos : une ligne par repo, filtre les lignes vides
  const excludedRepos = excludedReposInput.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (!username || !pat) {
    showStatus('Veuillez renseigner le username et le PAT.', 'error');
    return;
  }

  await chrome.storage.sync.set({
    githubUsername: username,
    githubPAT: pat,
    groupColor: color,
    excludeDependabot,
    excludedRepos,
  });

  showStatus('Paramètres sauvegardés !', 'success');
  setTimeout(clearStatus, 3000);
});

// ─── Clear dismissed ─────────────────────────────────────────────────────────

btnClearDismissed.addEventListener('click', async () => {
  await chrome.storage.local.set({ dismissedUrls: [] });
  await loadDismissedList();
  showStatus(
    'Liste des PRs ignorées réinitialisée. Elles réapparaîtront à la prochaine sync.',
    'success',
  );
  setTimeout(clearStatus, 4000);
});

// ─── Test connection ─────────────────────────────────────────────────────────

btnTest.addEventListener('click', async () => {
  const pat = patInput.value.trim();

  if (!pat) {
    showStatus('Veuillez saisir un PAT avant de tester.', 'error');
    return;
  }

  showStatus('Test en cours…', 'info');
  btnTest.disabled = true;

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        showStatus('Token invalide (401 Unauthorized). Vérifiez votre PAT.', 'error');
      } else {
        showStatus(`Erreur ${response.status}: ${response.statusText}`, 'error');
      }
      return;
    }

    const user = await response.json();
    showStatus(`Connecté en tant que @${user.login} ✓`, 'success');

    if (!usernameInput.value.trim()) {
      usernameInput.value = user.login;
    }
  } catch (err) {
    showStatus(`Erreur réseau: ${err.message}`, 'error');
  } finally {
    btnTest.disabled = false;
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

loadSettings();
