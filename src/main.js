const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

// State
// queue: files waiting to be converted { path, name }
// completed: files already processed { path, name, success, sizeBefore, sizeAfter, error? }
let queue = [];
let completed = [];
let converting = false;
let cwebpFound = false;

// DOM refs
const dropZone         = document.getElementById('drop-zone');
const queueSection     = document.getElementById('queue-section');
const queueList        = document.getElementById('queue-list');
const queueCount       = document.getElementById('queue-count');
const completedSection = document.getElementById('completed-section');
const completedList    = document.getElementById('completed-list');
const completedCount   = document.getElementById('completed-count');
const btnFiles         = document.getElementById('btn-files');
const btnFolder        = document.getElementById('btn-folder');
const btnClearQueue    = document.getElementById('btn-clear-queue');
const btnClearComp     = document.getElementById('btn-clear-completed');
const btnConvert       = document.getElementById('btn-convert');

const QUALITY_STEPS = [50, 66, 80, 90, 100];
let currentQualityIndex = 2;

const qualityDotItems  = document.querySelectorAll('.quality-dot-item');
const qualityTrackFill = document.getElementById('quality-track-fill');

function renderQualitySlider() {
  qualityDotItems.forEach((item, i) => {
    item.classList.toggle('active', i === currentQualityIndex);
    item.classList.toggle('past',   i < currentQualityIndex);
  });
  qualityTrackFill.style.width = `calc(${currentQualityIndex / 4} * (100% - 10px))`;
}

function qualityIndexFromX(clientX) {
  const dotsEl = document.querySelector('.quality-dots');
  const rect = dotsEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(pct * 4);
}

const qualityCustomEl = document.querySelector('.quality-custom');

qualityCustomEl.addEventListener('mousedown', (e) => {
  e.preventDefault();
  currentQualityIndex = qualityIndexFromX(e.clientX);
  renderQualitySlider();

  function onMove(e) {
    currentQualityIndex = qualityIndexFromX(e.clientX);
    renderQualitySlider();
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

qualityCustomEl.addEventListener('touchstart', (e) => {
  currentQualityIndex = qualityIndexFromX(e.touches[0].clientX);
  renderQualitySlider();

  function onMove(e) {
    currentQualityIndex = qualityIndexFromX(e.touches[0].clientX);
    renderQualitySlider();
  }
  function onEnd() {
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
  }
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);
}, { passive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_RE = /\.(jpe?g|png)$/i;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + '\u00a0' + sizes[i];
}

function savingsPct(before, after) {
  if (!before || !after) return null;
  return Math.round((1 - after / before) * 100);
}

function addToQueue(paths) {
  const existingPaths = new Set([
    ...queue.map(f => f.path),
    ...completed.map(f => f.path),
  ]);
  for (const p of paths) {
    if (!IMAGE_RE.test(p) || existingPaths.has(p)) continue;
    existingPaths.add(p);
    queue.push({ path: p, name: p.split('/').pop(), status: 'pending' });
  }
  render();
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderQueue();
  renderCompleted();
  btnConvert.disabled = converting || !cwebpFound || queue.length === 0;
}

function renderQueue() {
  if (queue.length === 0) {
    queueSection.classList.add('hidden');
    return;
  }
  queueSection.classList.remove('hidden');
  queueCount.textContent = queue.length;
  queueList.innerHTML = '';

  for (const f of queue) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span class="file-item__name" title="${escapeHtml(f.path)}">${escapeHtml(f.name)}</span>
      <span class="file-item__meta">
        <span class="status-dot ${f.status}"></span>
      </span>`;
    queueList.appendChild(li);
  }
}

function renderCompleted() {
  if (completed.length === 0) {
    completedSection.classList.add('hidden');
    return;
  }
  completedSection.classList.remove('hidden');
  completedCount.textContent = completed.length;
  completedList.innerHTML = '';

  for (const f of completed) {
    const li = document.createElement('li');
    li.className = 'file-item';

    let metaHtml = '';
    if (f.success) {
      const pct = savingsPct(f.sizeBefore, f.sizeAfter);
      const sign = pct > 0 ? `-${pct}%` : pct < 0 ? `+${Math.abs(pct)}%` : '0%';
      const cls = pct > 0 ? '' : 'worse';
      metaHtml = `
        <span>${formatBytes(f.sizeBefore)} → ${formatBytes(f.sizeAfter)}</span>
        <span class="savings ${cls}">${sign}</span>`;
    } else {
      const tip = escapeHtml(f.error ?? 'Errore sconosciuto');
      metaHtml = `<span title="${tip}" style="color:var(--error);font-size:11px">Errore</span>`;
    }

    li.innerHTML = `
      <span class="file-item__name" title="${escapeHtml(f.path)}">${escapeHtml(f.name)}</span>
      <span class="file-item__meta">
        ${metaHtml}
        <span class="status-dot ${f.success ? 'success' : 'error'}"></span>
      </span>`;
    completedList.appendChild(li);
  }
}

// ── Tauri drag & drop ─────────────────────────────────────────────────────────

listen('tauri://drag-enter', () => dropZone.classList.add('drag-over'));
listen('tauri://drag-leave', () => dropZone.classList.remove('drag-over'));
listen('tauri://drag-drop', async (event) => {
  dropZone.classList.remove('drag-over');
  const paths = event.payload?.paths ?? [];
  const imagePaths = [];
  for (const p of paths) {
    if (IMAGE_RE.test(p)) {
      imagePaths.push(p);
    } else {
      try {
        const imgs = await invoke('list_images_in_dir', { dir: p });
        imagePaths.push(...imgs);
      } catch { /* not a readable dir */ }
    }
  }
  addToQueue(imagePaths);
});

// ── Dialogs ───────────────────────────────────────────────────────────────────

btnFiles.addEventListener('click', async () => {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png'] }],
  });
  if (selected) addToQueue(Array.isArray(selected) ? selected : [selected]);
});

btnFolder.addEventListener('click', async () => {
  const dir = await open({ directory: true });
  if (!dir) return;
  const paths = await invoke('list_images_in_dir', { dir });
  addToQueue(paths);
});

// ── Clear ─────────────────────────────────────────────────────────────────────

btnClearQueue.addEventListener('click', () => {
  queue = [];
  render();
});

btnClearComp.addEventListener('click', () => {
  completed = [];
  render();
});

// ── Convert ───────────────────────────────────────────────────────────────────

btnConvert.addEventListener('click', async () => {
  if (converting || queue.length === 0 || !cwebpFound) return;
  converting = true;

  // Mark all queue items as converting
  queue.forEach(f => { f.status = 'converting'; });
  render();

  const toConvert = [...queue];
  const quality = QUALITY_STEPS[currentQualityIndex];

  try {
    const results = await invoke('convert_files', {
      files: toConvert.map(f => f.path),
      quality,
    });

    // Move each item to completed
    for (const res of results) {
      completed.push({
        path: res.input,
        name: res.input.split('/').pop(),
        success: res.success,
        sizeBefore: res.size_before,
        sizeAfter: res.size_after,
        error: res.error ?? null,
      });
    }
  } catch (err) {
    // Fallback: mark all as error
    for (const f of toConvert) {
      completed.push({ path: f.path, name: f.name, success: false, error: String(err) });
    }
  }

  // Remove converted items from queue
  const convertedPaths = new Set(toConvert.map(f => f.path));
  queue = queue.filter(f => !convertedPaths.has(f.path));

  converting = false;
  render();
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  renderQualitySlider();
  try {
    const info = await invoke('detect_tools');
    cwebpFound = info.found;
  } catch {
    cwebpFound = false;
  }
  render();
}

init();
