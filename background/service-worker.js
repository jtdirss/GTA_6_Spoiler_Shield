/*
 * GTA 6 Spoiler Shield - background service worker
 * ---------------------------------------------------------------------------
 * Small on purpose. It only:
 *   - writes default settings on first install
 *   - records blocked-video statistics sent by YouTube tabs (one writer, so
 *     several tabs can never overwrite each other's counts)
 *   - shows "OFF" on the toolbar icon while filtering is switched off
 * No network access. Nothing leaves the browser.
 */
importScripts('../data/keywords.js', '../shared/config.js');

const { Config } = self.GTA6Shield;
const MAX_KEYWORD_STATS = 300;

/* Run storage read-modify-write jobs one at a time. */
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.catch(() => {}).then(job);
  queue = run;
  return run;
}

const emptyStats = () => ({ total: 0, byCategory: {}, keywords: {}, since: Date.now(), lastBlockedAt: 0 });

async function readStats() {
  const r = await chrome.storage.local.get(Config.STATS_KEY);
  const s = r[Config.STATS_KEY];
  if (!s || typeof s !== 'object') return emptyStats();
  return {
    total: Number.isFinite(s.total) ? s.total : 0,
    byCategory: s.byCategory && typeof s.byCategory === 'object' ? s.byCategory : {},
    keywords: s.keywords && typeof s.keywords === 'object' ? s.keywords : {},
    since: Number.isFinite(s.since) ? s.since : Date.now(),
    lastBlockedAt: Number.isFinite(s.lastBlockedAt) ? s.lastBlockedAt : 0
  };
}

function cleanDelta(d) {
  const out = { count: 0, byCategory: {}, keywords: {} };
  if (!d || typeof d !== 'object') return out;
  out.count = Math.max(0, Math.min(1000, Math.floor(Number(d.count) || 0)));
  const copy = (src, dst, maxKey) => {
    if (!src || typeof src !== 'object') return;
    for (const [k, v] of Object.entries(src).slice(0, 200)) {
      const n = Math.max(0, Math.min(1000, Math.floor(Number(v) || 0)));
      if (n && k && k.length <= maxKey && k !== '__proto__') dst[k] = n;
    }
  };
  copy(d.byCategory, out.byCategory, 40);
  copy(d.keywords, out.keywords, 80);
  return out;
}

async function recordStats(rawDelta) {
  const delta = cleanDelta(rawDelta);
  if (!delta.count) return;

  const stats = await readStats();
  stats.total += delta.count;
  stats.lastBlockedAt = Date.now();
  for (const [k, v] of Object.entries(delta.byCategory)) stats.byCategory[k] = (stats.byCategory[k] || 0) + v;
  for (const [k, v] of Object.entries(delta.keywords)) stats.keywords[k] = (stats.keywords[k] || 0) + v;

  const keys = Object.keys(stats.keywords);
  if (keys.length > MAX_KEYWORD_STATS) {
    keys.sort((a, b) => stats.keywords[b] - stats.keywords[a]);
    const trimmed = {};
    keys.slice(0, MAX_KEYWORD_STATS).forEach((k) => { trimmed[k] = stats.keywords[k]; });
    stats.keywords = trimmed;
  }
  await chrome.storage.local.set({ [Config.STATS_KEY]: stats });

  const s = await chrome.storage.session.get(Config.SESSION_KEY);
  const session = s[Config.SESSION_KEY] || { count: 0, startedAt: Date.now() };
  session.count += delta.count;
  await chrome.storage.session.set({ [Config.SESSION_KEY]: session });
}

async function resetStats() {
  await chrome.storage.local.set({ [Config.STATS_KEY]: emptyStats() });
  await chrome.storage.session.set({ [Config.SESSION_KEY]: { count: 0, startedAt: Date.now() } });
}

/* ------------------------------- toolbar badge ---------------------------- */

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#6b6585' });
}

async function refreshBadge() {
  try {
    const cfg = await Config.load();
    setBadge(cfg.enabled);
  } catch (e) { /* ignore */ }
}

/* --------------------------------- events -------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const r = await chrome.storage.local.get(Config.CONFIG_KEY);
  if (!r[Config.CONFIG_KEY]) await Config.save(Config.defaultConfig());
  if (details.reason === 'install') {
    await chrome.storage.local.set({ [Config.STATS_KEY]: emptyStats() });
  }
  refreshBadge();
});

chrome.runtime.onStartup.addListener(refreshBadge);
refreshBadge();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[Config.CONFIG_KEY]) {
    setBadge(Config.sanitize(changes[Config.CONFIG_KEY].newValue).enabled);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) return false;

  if (msg.type === 'GTA6SS_STATS') {
    enqueue(() => recordStats(msg.delta)).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true; // async response
  }
  if (msg.type === 'GTA6SS_RESET_STATS') {
    enqueue(resetStats).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
