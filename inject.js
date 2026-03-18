// ================================================================
// inject.js — MAIN world (Manifest V3)
// Features:
//   1. Intercept Gemini download → remove watermark → save
//   2. Auto-remove watermark from displayed images (fillback)
//   3. IndexedDB caching — cache-first for fillback
//   4. Gallery UI panel — 400px right side, manage saved images
// ================================================================

'use strict';

// ---- Save original fetch before any override ----
const originalFetch = window.fetch;

// ---- Fake blob for intercepted download fetch ----
const fakeBlob = new Blob(['ok'], { type: 'text/plain' });

// ================================================================
// 🖱️ Download Intent Guard
// ================================================================
let _downloadIntentExpiry = 0;
const _isDownloadIntent = () => Date.now() < _downloadIntentExpiry;

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, a, [role="button"], [role="menuitem"]');
  if (!btn) return;
  const label = (btn.getAttribute('aria-label') || '').toLowerCase();
  const title = (btn.title || '').toLowerCase();
  const text  = (btn.textContent || '').trim().toLowerCase();
  const hasIcon = !!btn.querySelector('[data-mat-icon-name="download"], mat-icon[fonticon="download"]');
  if (label.includes('下载') || label.includes('download') ||
      title.includes('下载') || title.includes('download') ||
      text === '下载'         || text === 'download'        || hasIcon) {
    _downloadIntentExpiry = Date.now() + 4000;
    console.log('🖱️ [intent] 下载意图已激活');
  }
}, true);

// ================================================================
// 🔐 Trusted Types — Gemini 页面要求，所有 innerHTML 必须经此通道
// ================================================================
const _ggPolicy = (() => {
  if (typeof trustedTypes === 'undefined' || !trustedTypes.createPolicy) return null;
  try {
    return trustedTypes.createPolicy('gg-gallery-policy', { createHTML: s => s });
  } catch (_) {
    try {
      return trustedTypes.createPolicy('gg-gallery-policy-' + Date.now(), { createHTML: s => s });
    } catch (__) { return null; }
  }
})();

/**
 * 安全设置 innerHTML，自动处理 Trusted Types
 * @param {Element} el
 * @param {string} html
 */
function setHTML(el, html) {
  if (_ggPolicy) {
    el.innerHTML = _ggPolicy.createHTML(html);
  } else {
    el.innerHTML = html;
  }
}

// ================================================================
// 🖼 Watermark reference templates (base64)
// ================================================================
const WATERMARK_BASE64_48 = "data:image/png;base64,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";

const WATERMARK_BASE64_96 = "data:image/png;base64,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";

// ================================================================
// 📦 Section 1: IndexedDB Gallery Module
// ================================================================
const GalleryDB = (() => {
  const DB_NAME = 'GeminiGalleryDB';
  const STORE   = 'images';
  let _db = null;
  const _fpSet = new Set();
  let   _fpReady = false;
  const _fingerprint = (dataUrl) => `${dataUrl.length}:${dataUrl.slice(-64)}`;

  function _open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          s.createIndex('originalSrc', 'originalSrc', { unique: false });
          s.createIndex('timestamp',   'timestamp',   { unique: false });
        }
      };
      req.onsuccess = e => {
        _db = e.target.result;
        res(_db);
        if (!_fpReady) _loadFpSet();
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  async function _loadFpSet() {
    try {
      const all = await getAll();
      all.forEach(r => { if (r.dataUrl) _fpSet.add(_fingerprint(r.dataUrl)); });
      _fpReady = true;
    } catch (_) {}
  }

  async function save({ originalSrc, dataUrl, isTrusted = false, width = 0, height = 0, conversationUrl = '' }) {
    const db = await _open();
    const existing = await findBySrc(originalSrc);
    if (existing) return existing.id;
    const fp = _fingerprint(dataUrl);
    if (_fpSet.has(fp)) return null;
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).add({
        originalSrc, dataUrl, isTrusted, width, height, conversationUrl,
        timestamp: Date.now()
      });
      req.onsuccess = () => { _fpSet.add(fp); res(req.result); };
      req.onerror   = () => rej(req.error);
    });
  }

  async function findBySrc(src) {
    const db = await _open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('originalSrc').getAll(IDBKeyRange.only(src));
      req.onsuccess = () => res(req.result[0] ?? null);
      req.onerror   = () => rej(req.error);
    });
  }

  async function getAll() {
    const db = await _open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function remove(id) {
    const db = await _open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  }

  async function clearAll() {
    const db = await _open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  }

  return { save, findBySrc, getAll, remove, clearAll };
})();

// ================================================================
// 🎨 Section 2: Gallery CSS
// ================================================================
function injectGalleryCSS() {
  if (document.getElementById('gg-style')) return;
  const s = document.createElement('style');
  s.id = 'gg-style';
  s.textContent = `
/* ── Reset scope ── */
#gg-root, #gg-root *,
#gg-preview, #gg-preview *,
#gg-confirm, #gg-confirm *,
#gg-toast {
  box-sizing: border-box;
  font-family: 'Google Sans', 'DM Sans', 'Segoe UI', sans-serif;
}


/* ── Toggle Button ── */
#gg-toggle {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 999998;
  background: linear-gradient(160deg, #4f46e5 0%, #7c3aed 100%);
  border: none;
  border-radius: 10px 0 0 10px;
  padding: 14px 10px;
  cursor: pointer;
  color: #fff;
  box-shadow: -3px 0 18px rgba(79,70,229,.45);
  transition: all .25s cubic-bezier(.4,0,.2,1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  line-height: 1;
}
#gg-toggle:hover {
  background: linear-gradient(160deg, #6366f1 0%, #8b5cf6 100%);
  padding-left: 13px;
  box-shadow: -5px 0 24px rgba(99,102,241,.6);
}
#gg-toggle svg { width: 18px; height: 18px; fill: #fff; }
#gg-toggle-label {
  writing-mode: vertical-rl;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255,255,255,.9);
  text-transform: uppercase;
}


/* ── Panel ── */
#gg-panel {
  position: fixed;
  top: 0;
  right: -420px;
  width: 400px;
  height: 100dvh;
  z-index: 999999;
  display: flex;
  flex-direction: column;
  background: var(--bard-color-synthetic--mat-card-background) !important;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,.18) 0%, transparent 70%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");
  border-left: 1px solid var(--gem-sys-color--outline-variant) !important;
  box-shadow: rgba(0, 0, 0, 0.4) 0px 4px 12px, rgba(0, 0, 0, 0.3) 0px 1px 4px;
  transition: right .35s cubic-bezier(.4,0,.2,1);
}
#gg-panel.open { right: 0; }

/* ── Header ── */
#gg-header {
  flex-shrink: 0;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--gem-sys-color--outline-variant) !important;
  background: transparent;
}
.gg-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  min-height: 36px;
}
.gg-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--gem-sys-color--on-surface-variant) !important;
  letter-spacing: .3px;
  line-height: 1.3;
}
.gg-title svg { width: 20px; height: 20px; fill: #818cf8; }
.gg-header-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gg-icon-btn {
  background: transparent;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--gem-sys-color--on-surface-variant) !important;
  transition: all .18s;
  line-height: 1;
}
.gg-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }
.gg-icon-btn:hover { background: rgba(255,255,255,.14); color: #fff; }
.gg-icon-btn.danger:hover { background: rgba(244,63,94,.2); border-color: rgba(244,63,94,.35); color: #f87171; }

/* Stats */
.gg-stats {
  display: flex;
  gap: 14px;
  margin-top: 4px;
}
.gg-stat {
  font-size: 11.5px;
  color: var(--gem-sys-color--on-surface-variant) !important;
  letter-spacing: .2px;
  line-height: 1.4;
}
.gg-stat span {
  color: #818cf8;
  font-weight: 600;
}

/* ── Search / Filter bar ── */
#gg-search-wrap {
  flex-shrink: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--gem-sys-color--outline-variant) !important;
}
#gg-search {
  width: 100%;
  background: transparent;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
  border-radius: 9px;
  padding: 8px 12px 8px 34px;
  color: var(--gem-sys-color--on-surface-variant) !important;
  font-size: 13px;
  line-height: 1.4;
  outline: none;
  transition: border-color .15s, background .15s;
}
#gg-search::placeholder { color: var(--gem-sys-color--on-surface-variant) !important; }
#gg-search:focus { border-color: rgba(99,102,241,.5); background: rgba(99,102,241,.06); }
.gg-search-icon {
  position: absolute;
  left: 23px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.gg-search-icon svg { width: 14px; height: 14px; fill: var(--gem-sys-color--on-surface-variant) !important; opacity: 0.4; }
#gg-search-wrap { position: relative; }

/* ── Body ── */
#gg-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--gem-sys-color--outline-variant);
}
#gg-body::-webkit-scrollbar { width: 4px; }
#gg-body::-webkit-scrollbar-track { background: transparent; }
#gg-body::-webkit-scrollbar-thumb { background: rgba(99,102,241,.3); border-radius: 2px; }

/* ── Empty state ── */
.gg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 280px;
  gap: 14px;
  color: rgba(255,255,255,.25);
  text-align: center;
  padding: 20px;
}
.gg-empty svg { width: 52px; height: 52px; fill: rgba(255,255,255,.1); }
.gg-empty p { font-size: 13px; line-height: 1.7; max-width: 220px; margin: 0; }

/* ── Date group ── */
.gg-group {
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
}
.gg-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: rgba(255,255,255,.04);
  transition: background .15s;
}
.gg-group-header:hover { background: rgba(255,255,255,.07); }
.gg-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gem-sys-color--on-surface-variant) !important;
  line-height: 1.4;
}
.gg-group-count {
  font-size: 10.5px;
  font-weight: 700;
  background: rgba(99,102,241,.22);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 20px;
}
.gg-chevron {
  color: rgba(255,255,255,.3);
  transition: transform .2s;
}
.gg-chevron svg { width: 20px; height: 20px; fill: var(--gem-sys-color--on-surface-variant) !important; }
.gg-group.collapsed .gg-chevron { transform: rotate(-90deg); }
.gg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  padding: 6px;
  background: rgba(0,0,0,.06);
}
.gg-group.collapsed .gg-grid { display: none; }

/* ── Image Card ── */
.gg-card {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 7px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255,255,255,.04);
}
.gg-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .25s cubic-bezier(.4,0,.2,1);
}
.gg-card:hover .gg-card-img { transform: scale(1.07); }
.gg-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.3) 50%, transparent 100%);
  opacity: 0;
  transition: opacity .2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 7px;
  gap: 5px;
}
.gg-card:hover .gg-card-overlay { opacity: 1; }
.gg-card-size {
  font-size: 9.5px;
  color: rgba(255,255,255,.65);
  letter-spacing: .3px;
  line-height: 1.3;
}
.gg-card-conv {
  font-size: 9px;
  color: rgba(255,255,255,.4);
  letter-spacing: .2px;
  line-height: 1.3;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gg-card-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}
.gg-act-btn {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,.2);
  background: rgba(14,15,26,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: rgba(255,255,255,.85);
  transition: all .15s;
  backdrop-filter: blur(4px);
}
.gg-act-btn svg { width: 13px; height: 13px; fill: currentColor; }
.gg-act-btn:hover { background: rgba(99,102,241,.5); border-color: #6366f1; transform: scale(1.12); }
.gg-act-btn.del:hover { background: rgba(244,63,94,.4); border-color: #f43f5e; }
.gg-act-btn.lnk:hover { background: rgba(34,197,94,.3); border-color: #22c55e; }

/* Trusted badge */
.gg-badge-hd {
  position: absolute;
  top: 5px;
  right: 5px;
  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  color: #fff;
  font-size: 8.5px;
  font-weight: 800;
  padding: 2px 5px;
  border-radius: 4px;
  letter-spacing: .8px;
  text-transform: uppercase;
  z-index: 2;
  box-shadow: 0 2px 6px rgba(245,158,11,.4);
}

/* ── Preview Lightbox ── */
#gg-preview {
  position: fixed;
  inset: 0;
  background: rgba(5,5,10,.92);
  z-index: 2000000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity .22s;
  backdrop-filter: blur(12px);
}
#gg-preview.active { opacity: 1; pointer-events: all; }
#gg-preview-img {
  max-width: min(92vw, 1200px);
  max-height: 85dvh;
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0,0,0,.9);
  transition: transform .3s cubic-bezier(.4,0,.2,1);
}
#gg-preview-meta {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 12px;
  background: rgba(14, 15, 26, 0.82);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  padding: 10px 16px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  max-width: min(90vw, 700px);
}
.gg-preview-conv-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  justify-content: center;
  border-top: 1px solid rgba(255,255,255,.1);
  padding-top: 7px;
  margin-top: 2px;
}
.gg-preview-conv-url {
  color: rgba(99,102,241,.9) !important;
  font-size: 11px !important;
  text-decoration: underline;
  cursor: pointer;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gg-preview-info {
  font-size: 12px;
  color: rgba(255,255,255,.7);
  white-space: nowrap;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 4px;
}
.gg-preview-info svg { width: 12px; height: 12px; fill: rgba(255,255,255,.4); }
.gg-preview-info b { color: rgba(255,255,255,.9); font-weight: 600; }
.gg-preview-sep { color: rgba(255,255,255,.25); }
.gg-preview-dl {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all .15s;
}
.gg-preview-dl svg { width: 13px; height: 13px; fill: #fff; }
.gg-preview-dl:hover { filter: brightness(1.15); transform: translateY(-1px); }
#gg-preview-close {
  position: absolute;
  top: 18px;
  right: 18px;
  background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,.8);
  transition: all .15s;
}
#gg-preview-close svg { width: 16px; height: 16px; fill: currentColor; }
#gg-preview-close:hover { background: rgba(255,255,255,.2); color: #fff; }
#gg-preview-hd-badge {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: .8px;
  text-transform: uppercase;
  display: none;
}
#gg-preview-hd-badge.show { display: block; }

/* ── Toast ── */
#gg-toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(80px);
  background: var(--bard-color-synthetic--mat-card-background) !important;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
  border-radius: 12px;
  padding: 10px 18px;
  color: var(--gem-sys-color--on-surface-variant) !important;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  z-index: 3000000;
  transition: transform .3s cubic-bezier(.4,0,.2,1), opacity .3s;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0,0,0,.5);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  white-space: nowrap;
}
#gg-toast svg { width: 16px; height: 16px; fill: #818cf8; flex-shrink: 0; }
#gg-toast.show { transform: translateX(-50%) translateY(0); }

/* ── Confirm dialog ── */
#gg-confirm {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.7);
  z-index: 4000000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s;
}
#gg-confirm.active { opacity: 1; pointer-events: all; }
.gg-confirm-box {
  background: var(--bard-color-synthetic--mat-card-background) !important;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
  border-radius: 16px;
  padding: 28px 28px 22px;
  max-width: 320px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,.8);
}
.gg-confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--gem-sys-color--on-surface-variant) !important;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gg-confirm-title svg { width: 20px; height: 20px; fill: #f43f5e; }
.gg-confirm-msg {
  font-size: 13px;
  color: var(--gem-sys-color--on-surface-variant) !important; opacity: 0.65;
  line-height: 1.6;
  margin-bottom: 22px;
  margin-top: 8px;
}
.gg-confirm-btns {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.gg-confirm-cancel {
  background: transparent;
  border: 1px solid var(--gem-sys-color--outline-variant) !important;
  border-radius: 9px;
  padding: 8px 18px;
  color: var(--gem-sys-color--on-surface-variant) !important;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.gg-confirm-cancel:hover { background: rgba(99,102,241,.1); }
.gg-confirm-ok {
  background: linear-gradient(135deg, #f43f5e, #dc2626);
  border: none;
  border-radius: 9px;
  padding: 8px 18px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.gg-confirm-ok:hover { filter: brightness(1.1); }
`;
  (document.head || document.documentElement).appendChild(s);
}

// ================================================================
// 🏗 Section 3: Gallery DOM Builder
// ================================================================
let _galleryOpen = false;
let _previewRecord = null;
let _toastTimer = null;
let _searchQuery = '';

// SVG icon helpers
const SVG = {
  gallery: `<svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>`,
  download:`<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  zoom:    `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>`,
  close:   `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>`,
  clear:   `<svg viewBox="0 0 24 24"><path d="M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12z"/></svg>`,
  image:   `<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
  warn:    `<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  search:  `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
  ok:      `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  link:    `<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
};

function buildGalleryUI() {
  if (document.getElementById('gg-root')) return;

  // ── Gallery trigger button → inject into .right-section ──
  const toggle = document.createElement('button');
  toggle.id = 'gg-nav-btn';
  toggle.title = '图库';
  toggle.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-mdc-tooltip-trigger mat-unthemed ng-star-inserted';
  setHTML(toggle, `
    <span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA30lEQVR4nGNgGAWDBhjO+OBhNPPDY+NZH/5Tgo1mfngEMgvDApAEpYYbI1mCYQFMktKQMMZlzoBaYDTr/VHjWR8O08wC41kfDhvP/HCIZhaQAqhigenkj8LGMz+s01v0nJtiC4xmfbRA5lv0PuI0nvX+GFj9zA/zKbLAePYHV6OZ7/8YzfzQARao/89kNOvDGpQ0P+t9AlkW6E9/r2A08/1buGEz3zcYz/zQj5GxZn74YjrrrTZJFtjP/89hPPPDGeJz7/ursPgYGqkIH8BpDs0LO0NIcf2IZsX1KBgwAADR68ytmFWe+QAAAABJRU5ErkJggg==" alt="图库" style="width:18px;height:18px;object-fit:contain;">
  `);
  toggle.addEventListener('click', togglePanel);

  // ── Main panel ──
  const panel = document.createElement('div');
  panel.id = 'gg-panel';
  setHTML(panel, `
    <div id="gg-header">
      <div class="gg-header-top">
        <div class="gg-title">${SVG.gallery} 图库</div>
        <div class="gg-header-btns">
          <button class="gg-icon-btn danger" id="gg-clear-btn" title="清除所有数据">${SVG.clear}</button>
          <button class="gg-icon-btn" id="gg-close-btn" title="关闭">${SVG.close}</button>
        </div>
      </div>
      <div class="gg-stats">
        <div class="gg-stat">共 <span id="gg-total">0</span> 张图片</div>
        <div class="gg-stat">其中 <span id="gg-hd-count">0</span> 张原图</div>
      </div>
    </div>
    <div id="gg-search-wrap">
      <span class="gg-search-icon">${SVG.search}</span>
      <input id="gg-search" type="text" placeholder="按日期搜索… (e.g. 2025/06/12)" autocomplete="off" />
    </div>
    <div id="gg-body"></div>
  `);

  // ── Lightbox preview ──
  const preview = document.createElement('div');
  preview.id = 'gg-preview';
  setHTML(preview, `
    <button id="gg-preview-close">${SVG.close}</button>
    <img id="gg-preview-img" src="" alt="" />
    <div id="gg-preview-meta">
      <span id="gg-preview-hd-badge">原图</span>
      <span class="gg-preview-info" id="gg-preview-dim"></span>
      <span class="gg-preview-sep">·</span>
      <span class="gg-preview-info" id="gg-preview-date"></span>
      <div class="gg-preview-conv-wrap" id="gg-preview-conv-wrap">
        <span class="gg-preview-info">${SVG.link} 对话：</span>
        <span class="gg-preview-info gg-preview-conv-url" id="gg-preview-conv-url"></span>
      </div>
      <button class="gg-preview-dl" id="gg-preview-dl-btn">${SVG.download} 下载</button>
      <button class="gg-preview-dl" id="gg-preview-lnk-btn" style="background:linear-gradient(135deg,#059669,#047857)">${SVG.link} 跳转对话</button>
    </div>
  `);
  preview.addEventListener('click', e => {
    if (e.target === preview) closePreview();
  });

  // ── Confirm dialog ──
  const confirm = document.createElement('div');
  confirm.id = 'gg-confirm';
  setHTML(confirm, `
    <div class="gg-confirm-box">
      <div class="gg-confirm-title">${SVG.warn} 清除所有图片</div>
      <p class="gg-confirm-msg">此操作将从图库中删除全部 <b id="gg-confirm-count">0</b> 张图片，且无法恢复。确认继续？</p>
      <div class="gg-confirm-btns">
        <button class="gg-confirm-cancel" id="gg-confirm-cancel">取消</button>
        <button class="gg-confirm-ok" id="gg-confirm-ok">清除全部</button>
      </div>
    </div>
  `);

  // ── Toast ──
  const toast = document.createElement('div');
  toast.id = 'gg-toast';

  // ── Root wrapper ──
  const root = document.createElement('div');
  root.id = 'gg-root';
  root.appendChild(panel);
  root.appendChild(preview);
  root.appendChild(confirm);
  root.appendChild(toast);
  document.body.appendChild(root);

  // ── Inject toggle button into .right-section ──
  function injectToggleBtn() {
    if (document.getElementById('gg-nav-btn')) return;
    const rightSection = document.getElementsByClassName('right-section')[0];
    if (rightSection) rightSection.appendChild(toggle);
  }
  injectToggleBtn();
  // Retry on SPA navigation if .right-section not yet mounted
  const _rightObserver = new MutationObserver(() => {
    if (!document.getElementById('gg-nav-btn')) injectToggleBtn();
  });
  _rightObserver.observe(document.documentElement, { childList: true, subtree: true });

  // ── Event bindings ──
  panel.querySelector('#gg-close-btn').addEventListener('click', togglePanel);
  panel.querySelector('#gg-clear-btn').addEventListener('click', () => showConfirm());
  preview.querySelector('#gg-preview-close').addEventListener('click', closePreview);
  preview.querySelector('#gg-preview-dl-btn').addEventListener('click', () => {
    if (_previewRecord) downloadRecord(_previewRecord);
  });
  preview.querySelector('#gg-preview-lnk-btn').addEventListener('click', () => {
    if (_previewRecord) openOriginalLink(_previewRecord);
  });
  confirm.querySelector('#gg-confirm-cancel').addEventListener('click', hideConfirm);
  confirm.querySelector('#gg-confirm-ok').addEventListener('click', execClearAll);

  document.getElementById('gg-search').addEventListener('input', e => {
    _searchQuery = e.target.value.trim().toLowerCase();
    renderGallery();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('gg-preview').classList.contains('active')) closePreview();
      else if (document.getElementById('gg-confirm').classList.contains('active')) hideConfirm();
    }
  });

  // Listen for new images saved
  window.addEventListener('__gg_image_saved__', () => renderGallery());

  renderGallery();
}

// ── Panel toggle ──
function togglePanel() {
  const panel = document.getElementById('gg-panel');
  _galleryOpen = !_galleryOpen;
  panel.classList.toggle('open', _galleryOpen);
  if (_galleryOpen) renderGallery();
}

// ── Render gallery ──
async function renderGallery() {
  const body = document.getElementById('gg-body');
  const totalEl = document.getElementById('gg-total');
  const hdEl    = document.getElementById('gg-hd-count');
  if (!body) return;

  let records = await GalleryDB.getAll();

  // Sort newest first
  records.sort((a, b) => b.timestamp - a.timestamp);

  // Update stats
  const total = records.length;
  const hdCount = records.filter(r => r.isTrusted).length;
  if (totalEl) totalEl.textContent = total;
  if (hdEl)    hdEl.textContent    = hdCount;

  // Apply search filter
  if (_searchQuery) {
    records = records.filter(r => {
      const d = new Date(r.timestamp);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      return dateStr.includes(_searchQuery);
    });
  }

  if (records.length === 0) {
    setHTML(body, `
      <div class="gg-empty">
        ${SVG.image}
        <p>${_searchQuery ? '没有找到匹配的图片' : '图库为空'}</p>
      </div>`);
    return;
  }

  // Group by local date
  const groups = {};
  records.forEach(r => {
    const d    = new Date(r.timestamp);
    const key  = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const frag = document.createDocumentFragment();
  Object.entries(groups).forEach(([dateKey, items]) => {
    const group = document.createElement('div');
    group.className = 'gg-group';
    group.dataset.date = dateKey;

    const header = document.createElement('div');
    header.className = 'gg-group-header';
    setHTML(header, `
      <div class="gg-group-label">
        📅 ${dateKey}
        <span class="gg-group-count">${items.length}</span>
      </div>
      <span class="gg-chevron">${SVG.chevron}</span>`);
    header.addEventListener('click', () => group.classList.toggle('collapsed'));

    const grid = document.createElement('div');
    grid.className = 'gg-grid';

    items.forEach(record => {
      const card = createImageCard(record);
      grid.appendChild(card);
    });

    group.appendChild(header);
    group.appendChild(grid);
    frag.appendChild(group);
  });

  setHTML(body, '');
  body.appendChild(frag);
}

function createImageCard(record) {
  const card = document.createElement('div');
  card.className = 'gg-card';
  card.dataset.id = record.id;

  const dimText = record.width && record.height ? `${record.width}×${record.height}` : '';

  setHTML(card, `
    ${record.isTrusted ? '<span class="gg-badge-hd">原图</span>' : ''}
    <img class="gg-card-img" src="${record.dataUrl}" loading="lazy" alt="" />
    <div class="gg-card-overlay">
      ${dimText ? `<span class="gg-card-size">${dimText}</span>` : ''}
      ${record.conversationUrl ? `<span class="gg-card-conv" title="${record.conversationUrl}">${(() => { try { return new URL(record.conversationUrl).pathname.replace('/app/', '').substring(0,8)+'…'; } catch(_) { return ''; } })()}</span>` : ''}
      <div class="gg-card-actions">
        <button class="gg-act-btn dl-btn"   title="下载">${SVG.download}</button>
        <button class="gg-act-btn lnk lnk-btn" title="跳转到对话页面">${SVG.link}</button>
        <button class="gg-act-btn del del-btn" title="删除">${SVG.trash}</button>
      </div>
    </div>`);

  card.querySelector('.dl-btn').addEventListener('click',   e => { e.stopPropagation(); downloadRecord(record); });
  card.querySelector('.lnk-btn').addEventListener('click',  e => { e.stopPropagation(); openOriginalLink(record); });
  card.querySelector('.del-btn').addEventListener('click',  e => { e.stopPropagation(); deleteRecord(record.id); });

  // Click card body = preview
  card.addEventListener('click', () => openPreview(record));

  return card;
}

// ── Preview ──
function openPreview(record) {
  _previewRecord = record;
  const ov    = document.getElementById('gg-preview');
  const img   = document.getElementById('gg-preview-img');
  const dim   = document.getElementById('gg-preview-dim');
  const date  = document.getElementById('gg-preview-date');
  const hdBdg = document.getElementById('gg-preview-hd-badge');

  img.src = record.dataUrl;
  setHTML(dim, record.width && record.height
    ? `<b>${record.width}</b> × <b>${record.height}</b>`
    : '');
  const d = new Date(record.timestamp);
  date.textContent = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  hdBdg.classList.toggle('show', !!record.isTrusted);
  // Show conversation URL
  const convUrlEl = document.getElementById('gg-preview-conv-url');
  if (convUrlEl) {
    const convUrl = record.conversationUrl || '';
    if (convUrl) {
      // Extract just the path part for display
      try {
        const u = new URL(convUrl);
        convUrlEl.textContent = u.pathname;
        convUrlEl.title = convUrl;
        convUrlEl.parentElement.style.display = '';
      } catch(_) {
        convUrlEl.textContent = convUrl.substring(0, 40) + '…';
        convUrlEl.parentElement.style.display = '';
      }
    } else {
      convUrlEl.parentElement.style.display = 'none';
    }
  }
  ov.classList.add('active');
}

function closePreview() {
  document.getElementById('gg-preview').classList.remove('active');
  _previewRecord = null;
}

// ── Download ──
function downloadRecord(record) {
  const a = document.createElement('a');
  a.href = record.dataUrl;
  a.download = `Gemini_Gallery_${record.isTrusted ? 'HD_' : ''}${record.id}_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`${SVG.ok} 图片已下载`);
}

// ── Open original source URL ──
function openOriginalLink(record) {
  const url = record.conversationUrl || record.originalSrc;
  if (!url) {
    showToast(`${SVG.warn} 对话链接不存在`);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  showToast(`${SVG.link} 已跳转到对话页面`);
}

// ── Delete ──
async function deleteRecord(id) {
  await GalleryDB.remove(id);
  // Remove card from DOM directly (fast, avoids full re-render)
  const card = document.querySelector(`.gg-card[data-id="${id}"]`);
  if (card) {
    card.style.transition = 'opacity .2s, transform .2s';
    card.style.opacity = '0';
    card.style.transform = 'scale(.85)';
    setTimeout(() => {
      card.remove();
      renderGallery(); // refresh counts
    }, 200);
  }
  showToast(`${SVG.trash} 图片已删除`);
}

// ── Confirm / Clear all ──
async function showConfirm() {
  const records = await GalleryDB.getAll();
  document.getElementById('gg-confirm-count').textContent = records.length;
  document.getElementById('gg-confirm').classList.add('active');
}
function hideConfirm() {
  document.getElementById('gg-confirm').classList.remove('active');
}
async function execClearAll() {
  await GalleryDB.clearAll();
  hideConfirm();
  renderGallery();
  showToast(`${SVG.clear} 已清除所有图片`);
}

// ── Toast ──
function showToast(html, duration = 2400) {
  const t = document.getElementById('gg-toast');
  if (!t) return;
  setHTML(t, html);
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Init gallery when DOM ready ──
function initGallery() {
  injectGalleryCSS();
  buildGalleryUI();
}

if (document.body) {
  initGallery();
} else {
  document.addEventListener('DOMContentLoaded', initGallery);
}

// ================================================================
// 🔗 Section 4: Core watermark removal logic (original + enhanced)
// ================================================================

// ── Intercept download requests ──
window.fetch = async function(...args) {
  const input = args[0];
  const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

  if (url && url.includes('googleusercontent.com')) {
    if (!_isDownloadIntent()) {
      return originalFetch.apply(this, args);
    }
    _downloadIntentExpiry = 0;
    console.log("🚀 [1] 拦截到下载请求:", url.substring(0, 80) + "...");
    processAndDownload(url, args[1]).catch(err => console.error("❌ 致命错误:", err));
    return new Response(fakeBlob, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/plain' } });
  }

  return originalFetch.apply(this, args);
};

async function processAndDownload(interceptedUrl, fetchOptions) {
  try {
    let currentUrl = interceptedUrl;
    const MAX_REDIRECTS = 10;

    for (let depth = 0; depth < MAX_REDIRECTS; depth++) {
      console.log(`⏳ 第 ${depth + 1} 层请求: ${currentUrl.substring(0, 100)}...`);

      let response;
      try {
        response = await originalFetch(currentUrl, {
          ...(depth === 0 ? fetchOptions : {}),
          credentials: 'include',
          redirect: 'follow'
        });
      } catch (fetchError) {
        console.warn(`⚠️ 第 ${depth + 1} 层 fetch 失败 (${fetchError.message})`);
        console.log("🔄 切换策略：用浏览器原生方式下载...");
        downloadViaIframe(currentUrl);
        return;
      }

      if (!response.ok) {
        console.warn(`⚠️ 第 ${depth + 1} 层返回 ${response.status}`);
        console.log("🔄 状态码异常，切换为浏览器原生下载...");
        downloadViaIframe(currentUrl);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      console.log(`   📋 Content-Type: ${contentType}`);

      if (contentType.startsWith('image/')) {
        const imgBlob = await response.blob();
        console.log(`✅ 第 ${depth + 1} 层拿到图片！大小: ${(imgBlob.size / 1024).toFixed(2)}KB`);
        loadAndProcess(imgBlob, interceptedUrl);
        return;
      }

      if (contentType.includes('octet-stream')) {
        const blob = await response.blob();
        const imgType = await detectImageType(blob);
        if (imgType) {
          console.log(`✅ octet-stream 实际是图片 (${imgType})`);
          loadAndProcess(new Blob([blob], { type: imgType }), interceptedUrl);
          return;
        }
        const text = await blob.text();
        const nextUrl = extractUrl(text);
        if (!nextUrl) {
          console.log("🔄 无法解析，切换浏览器原生下载...");
          downloadViaIframe(currentUrl);
          return;
        }
        currentUrl = nextUrl;
        continue;
      }

      const text = await response.text();
      console.log(`   📄 前120字符: ${text.substring(0, 120)}`);

      const nextUrl = extractUrl(text);
      if (!nextUrl) {
        console.error(`❌ 未找到下一层URL`);
        downloadViaIframe(currentUrl);
        return;
      }

      currentUrl = nextUrl;
      console.log(`🔗 → 第 ${depth + 2} 层: ${currentUrl.substring(0, 100)}...`);
    }

  } catch (err) {
    console.error("❌ 异常:", err);
  }
}

function downloadViaIframe(url) {
  console.log("📥 正在通过浏览器原生方式下载...");
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => document.body.removeChild(iframe), 5000);
}

function fetchViaXHR(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.withCredentials = true;
    xhr.onload = () => xhr.status === 200 ? resolve(xhr.response) : reject(new Error(`XHR 失败: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('XHR 网络错误'));
    xhr.send();
  });
}

// ── loadAndProcess now accepts originalSrc ──
function loadAndProcess(imgBlob, originalSrc = null) {
  const objectUrl = URL.createObjectURL(imgBlob);
  const img = new Image();

  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    console.log(`⏳ 图片 ${img.width}x${img.height} 渲染完成，去水印中...`);
    removeWatermarkAndSave(img, originalSrc);
  };

  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    console.error("❌ 图片渲染失败");
  };

  img.src = objectUrl;
}

function extractUrl(text) {
  const patterns = [
    /(https:\/\/lh3\.googleusercontent\.com\/[^\s"'<>\]\\]+)/,
    /(https:\/\/lh3\.google\.com\/[^\s"'<>\]\\]+)/,
    /(https:\/\/[a-z0-9.-]*google[a-z.]*\.com\/[^\s"'<>\]\\]+)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/\\u0026/g, '&').replace(/\\u003d/g, '=');
    }
  }
  return null;
}

async function detectImageType(blob) {
  const arr = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (arr[0]===0x89 && arr[1]===0x50 && arr[2]===0x4E && arr[3]===0x47) return 'image/png';
  if (arr[0]===0xFF && arr[1]===0xD8 && arr[2]===0xFF) return 'image/jpeg';
  if (arr[0]===0x52 && arr[1]===0x49 && arr[2]===0x46 && arr[3]===0x46 &&
      arr[8]===0x57 && arr[9]===0x45 && arr[10]===0x42 && arr[11]===0x50) return 'image/webp';
  return null;
}

// ── removeWatermarkAndSave: download flow + save to DB ──
function removeWatermarkAndSave(img, originalSrc = null) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = img.width, h = img.height;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0);

  let wmSize = 48, margin = 32;
  if (w > 1024 && h > 1024) { wmSize = 96; margin = 64; }

  const startX = w - wmSize - margin;
  const startY = h - wmSize - margin;

  const bgImg = new Image();
  bgImg.src = (wmSize === 96) ? WATERMARK_BASE64_96 : WATERMARK_BASE64_48;

  bgImg.onload = () => {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = wmSize;
    bgCanvas.height = wmSize;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.drawImage(bgImg, 0, 0);
    const bgData = bgCtx.getImageData(0, 0, wmSize, wmSize).data;

    const wmImageData = ctx.getImageData(startX, startY, wmSize, wmSize);
    const data = wmImageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = Math.max(bgData[i], bgData[i+1], bgData[i+2]) / 255.0;
      if (alpha > 0) {
        const a = Math.min(alpha, 0.95);
        for (let c = 0; c < 3; c++) {
          data[i+c] = Math.max(0, Math.min(255, (data[i+c] - a*255) / (1.0-a)));
        }
      }
    }
    ctx.putImageData(wmImageData, startX, startY);

    canvas.toBlob(async (blob) => {
      // ── Trigger download ──
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `Gemini_Clean_${Date.now()}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("🎉🎉🎉 去水印图片已下载！");

      // ── Save to IndexedDB ──
      if (originalSrc) {
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            await GalleryDB.save({
              originalSrc,
              dataUrl: reader.result,
              isTrusted: false,
              width: w,
              height: h,
              conversationUrl: window.location.href
            });
            window.dispatchEvent(new CustomEvent('__gg_image_saved__'));
            showToast(`${SVG.ok} 图片已保存到图库`);
            console.log('💾 [GalleryDB] 下载图片已保存');
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          console.warn('⚠️ [GalleryDB] 保存失败:', e);
        }
      }
    }, 'image/png');
  };
}

// ================================================================
// 🔄 Section 5: removeWatermarkAndFillback — cache-first + save
// ================================================================

/**
 * 判断一张图片是否是用户自己发送的（而非 AI 生成的）。
 * 用户消息在 Gemini DOM 里位于 user-query、.user-turn 等容器内。
 * AI 生成的图片在 model-response / .response-container 内。
 */
function _isUserSentImage(imgEl) {
  // 1. 小图缩略图：带有 data-test-id="uploaded-img"
  if (imgEl.getAttribute('data-test-id') === 'uploaded-img') return true;
  // 2. 大图预览（trusted-image viewer）：用户图片的 src 是 blob: 开头，
  //    AI 生成图片的 src 是 http: 开头，以此区分
  if (imgEl.getAttribute('data-test-id') === 'trusted-image' ||
      !!imgEl.closest('[data-test-id="trusted-image"]')) {
    return (imgEl.src || '').startsWith('blob:');
  }
  return false;
}

/**
 * dataUrl → Blob URL。
 * 用 Blob URL 替代直接设置 base64 src，避免浏览器在主线程
 * 解码数 MB 的 base64 字符串导致的明显卡顿。
 */
function _dataUrlToBlobUrl(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

async function removeWatermarkAndFillback(imgElement) {
  const src = imgElement.src;
  if (!src || imgElement.dataset.wmRemoved) return;

  // ① 跳过用户自己发送的图片 — 无需去水印，也无需存图库
  if (_isUserSentImage(imgElement)) {
    imgElement.dataset.wmRemoved = 'skip';
    console.log('⏭️ [fillback] 跳过用户发送图片:', src.substring(0, 60));
    return;
  }

  // ② 必须在任何 await 之前标记，防止 MutationObserver 在异步间隙
  //    重复触发，造成多个并发调用同时处理同一元素（race condition）
  imgElement.dataset.wmRemoved = 'processing';

  const isTrusted = imgElement.getAttribute('data-test-id') === 'trusted-image' ||
                    !!imgElement.closest('[data-test-id="trusted-image"]');

  // ── Cache-first lookup ──
  try {
    const cached = await GalleryDB.findBySrc(src);
    if (cached) {
      // Blob URL 替代 base64 src，浏览器无需在主线程解码，立即显示
      imgElement.src = _dataUrlToBlobUrl(cached.dataUrl);
      imgElement.dataset.wmRemoved = 'true';
      console.log(`⚡ [cache] 命中缓存，Blob URL 回填 (id=${cached.id})`);
      return;
    }
  } catch (cacheErr) {
    console.warn('⚠️ [cache] IndexedDB 查询失败，继续正常流程:', cacheErr);
  }

  console.log(`⏳ [fillback] 请求 content.js 代理 fetch: ${src.substring(0, 80)}...`);

  const reqId = 'wm_' + Date.now() + '_' + Math.random().toString(36).slice(2);

  function onResponse(e) {
    if (e.detail.id !== reqId) return;
    window.removeEventListener('__wm_fetch_response__', onResponse);

    if (e.detail.error) {
      imgElement.dataset.wmRemoved = '';
      console.warn(`⚠️ [fillback] 代理 fetch 失败: ${e.detail.error}`);
      return;
    }

    fetch(e.detail.dataUrl)
      .then(r => r.blob())
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        const tempImg = new Image();

        tempImg.onload = () => {
          URL.revokeObjectURL(objectUrl);

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const w = tempImg.width, h = tempImg.height;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(tempImg, 0, 0);

          let wmSize = 48, margin = 32;
          if (w > 1024 && h > 1024) { wmSize = 96; margin = 64; }

          const startX = w - wmSize - margin;
          const startY = h - wmSize - margin;

          const bgImg = new Image();
          bgImg.src = (wmSize === 96) ? WATERMARK_BASE64_96 : WATERMARK_BASE64_48;

          bgImg.onload = () => {
            const bgCanvas = document.createElement('canvas');
            bgCanvas.width = wmSize;
            bgCanvas.height = wmSize;
            const bgCtx = bgCanvas.getContext('2d');
            bgCtx.drawImage(bgImg, 0, 0);
            const bgData = bgCtx.getImageData(0, 0, wmSize, wmSize).data;

            const wmImageData = ctx.getImageData(startX, startY, wmSize, wmSize);
            const data = wmImageData.data;

            for (let i = 0; i < data.length; i += 4) {
              const alpha = Math.max(bgData[i], bgData[i+1], bgData[i+2]) / 255.0;
              if (alpha > 0) {
                const a = Math.min(alpha, 0.95);
                for (let c = 0; c < 3; c++) {
                  data[i+c] = Math.max(0, Math.min(255, (data[i+c] - a*255) / (1.0-a)));
                }
              }
            }
            ctx.putImageData(wmImageData, startX, startY);

            canvas.toBlob(async (cleanBlob) => {
              const reader = new FileReader();
              reader.onload = async () => {
                const dataUrl = reader.result;

                // 同样用 Blob URL 回填，避免 base64 src 卡顿
                imgElement.src = _dataUrlToBlobUrl(dataUrl);
                imgElement.dataset.wmRemoved = 'true';
                console.log(`✅ [fillback] 去水印完成，Blob URL 已回填`);

                try {
                  await GalleryDB.save({ originalSrc: src, dataUrl, isTrusted, width: w, height: h, conversationUrl: window.location.href });
                  window.dispatchEvent(new CustomEvent('__gg_image_saved__'));
                  console.log(`💾 [GalleryDB] 已保存 (isTrusted=${isTrusted})`);
                } catch (dbErr) {
                  console.warn('⚠️ [GalleryDB] 保存失败:', dbErr);
                }
              };
              reader.readAsDataURL(cleanBlob);
            }, 'image/png');
          };

          bgImg.onerror = () => {
            imgElement.dataset.wmRemoved = '';
            console.error('❌ [fillback] 水印模板加载失败');
          };
        };

        tempImg.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          imgElement.dataset.wmRemoved = '';
          console.error('❌ [fillback] blob 转 Image 失败');
        };

        tempImg.src = objectUrl;
      });
  }

  window.addEventListener('__wm_fetch_response__', onResponse);

  window.dispatchEvent(new CustomEvent('__wm_fetch_request__', {
    detail: { id: reqId, url: src }
  }));

  setTimeout(() => {
    if (imgElement.dataset.wmRemoved === 'processing') {
      window.removeEventListener('__wm_fetch_response__', onResponse);
      imgElement.dataset.wmRemoved = '';
      console.error('❌ [fillback] 10秒超时！content_bridge.js 未响应。');
    }
  }, 10000);
}

// ================================================================
// 👁 Section 6: MutationObservers (unchanged from original)
// ================================================================
const imageObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      if (node.tagName === 'IMG' &&
          node.classList.contains('image') &&
          node.classList.contains('loaded') &&
          !node.dataset.wmRemoved) {
        console.log('🔍 [Observer] 发现新 img.image.loaded，准备去水印:', node.src?.substring(0, 80));
        removeWatermarkAndFillback(node);
      }

      const imgs = node.querySelectorAll('img.image.loaded:not([data-wm-removed])');
      imgs.forEach(img => {
        console.log('🔍 [Observer] 发现子孙 img.image.loaded，准备去水印:', img.src?.substring(0, 80));
        removeWatermarkAndFillback(img);
      });
    }

    if (mutation.type === 'attributes' &&
        mutation.attributeName === 'class' &&
        mutation.target.tagName === 'IMG' &&
        mutation.target.classList.contains('image') &&
        mutation.target.classList.contains('loaded') &&
        !mutation.target.dataset.wmRemoved) {
      console.log('🔍 [Observer] img class 变为 loaded，准备去水印:', mutation.target.src?.substring(0, 80));
      removeWatermarkAndFillback(mutation.target);
    }
  }
});

const trustedImageObserver = new MutationObserver(() => {
  const trustedImg = document.querySelector('[data-test-id="trusted-image"]');
  if (trustedImg && !trustedImg.dataset.wmRemoved) {
    console.log('🔍 [trusted-image] 检测到 trusted-image，准备去水印:', trustedImg.src?.substring(0, 80));
    removeWatermarkAndFillback(trustedImg);
  }
});

function startObservers() {
  const target = document.body || document.documentElement;

  imageObserver.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  console.log('👁️ [Observer] 已启动监听 img.image.loaded');

  trustedImageObserver.observe(target, {
    childList: true,
    subtree: true
  });
  console.log('👁️ [trusted-image] 已启动监听 [data-test-id="trusted-image"]');
}

if (document.body) {
  startObservers();
} else {
  document.addEventListener('DOMContentLoaded', startObservers);
}

console.log("✅ 脚本已激活（支持多层追踪 + IndexedDB 缓存 + 图库 UI）");
