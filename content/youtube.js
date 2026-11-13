/*
 * GTA 6 Spoiler Shield - YouTube adapter
 * ---------------------------------------------------------------------------
 * Everything that knows about YouTube's DOM lives here:
 *   - which elements are video cards (CARD_SELECTORS)
 *   - which outer element must be hidden for each card (OUTER_SELECTOR)
 *   - where the title text lives for each kind of card (TITLE_SELECTORS_*)
 *
 * If YouTube renames an element, this is the only file that needs updating.
 *
 * Hiding is done with ONE attribute (data-gta6ss) and CSS (content/youtube.css).
 * We never remove or rewrite YouTube's own nodes, so restoring is just
 * removing the attribute (and our optional placeholder child).
 *
 *   data-gta6ss="pending"      title not rendered yet - kept invisible (never for more than 1.5 s)
 *   data-gta6ss="hidden"       blocked, display:none
 *   data-gta6ss="placeholder"  blocked, replaced by a small notice
 *   data-gta6ss="revealed"     blocked, but the user pressed "Show anyway"
 */
(function () {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : self;
  const NS = root.GTA6Shield;
  if (!NS || !NS.Config || !NS.Engine || !NS.DomObserver) {
    console.warn('[GTA 6 Spoiler Shield] modules failed to load');
    return;
  }
  if (root.__gta6ssLoaded) return; // guard against double injection
  root.__gta6ssLoaded = true;

  const { Config, Engine, DomObserver } = NS;

  const ATTR = 'data-gta6ss';
  const PH_CLASS = 'gta6ss-ph';
  const PENDING_MAX_MS = 1500;

  /* ------------------------------------------------------------------------
   * Card types. Separate lists per surface, as YouTube uses different
   * components on different pages (and migrates between them over time).
   * ---------------------------------------------------------------------- */

  const CARD_SELECTORS = [
    // Home, Subscriptions, channel Videos/Shorts/Live tabs (grid)
    'ytd-rich-item-renderer',
    // Search results, history, channel search, list-style subscriptions, trending
    'ytd-video-renderer',
    // Watch page sidebar and the recommendations below the player (narrow layout)
    'ytd-compact-video-renderer', 'ytd-compact-playlist-renderer', 'ytd-compact-radio-renderer',
    // Channel home shelves, classic grids, playlists, mixes
    'ytd-grid-video-renderer', 'ytd-grid-playlist-renderer',
    'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer',
    'ytd-playlist-renderer', 'ytd-radio-renderer',
    // Shorts shelves (home, search, channel) and the full-screen Shorts feed
    'ytd-reel-item-renderer', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
    'ytd-reel-video-renderer',
    // Channel page featured video
    'ytd-channel-video-player-renderer',
    // Newer "lockup" component used for videos, playlists and mixes on many pages
    'yt-lockup-view-model',
    // Suggestions shown inside the player (end screen / video wall / end cards)
    '.ytp-videowall-still', '.ytp-modern-videowall-still', '.ytp-ce-video'
  ];

  // The element we actually hide. A lockup inside a rich grid cell resolves to
  // the whole cell so the grid closes the gap. The outermost match wins.
  const OUTER_SELECTORS = [
    'ytd-rich-item-renderer', 'ytd-video-renderer',
    'ytd-compact-video-renderer', 'ytd-compact-playlist-renderer', 'ytd-compact-radio-renderer',
    'ytd-grid-video-renderer', 'ytd-grid-playlist-renderer',
    'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer',
    'ytd-playlist-renderer', 'ytd-radio-renderer',
    'ytd-reel-item-renderer', 'ytd-reel-video-renderer', 'ytd-channel-video-player-renderer',
    '.ytp-videowall-still', '.ytp-modern-videowall-still', '.ytp-ce-video'
  ];

  const CARD_SELECTOR = CARD_SELECTORS.join(',');
  const OUTER_SELECTOR = OUTER_SELECTORS.join(',');

  /* Where the title text lives. Tried in order; first non-empty wins. */
  const TITLE_SELECTORS_DEFAULT = [
    '#video-title', 'a#video-title-link',                                   // classic renderers
    '.yt-lockup-metadata-view-model-wiz__title', '.yt-lockup-metadata-view-model__title', // lockup
    '.shortsLockupViewModelHostMetadataTitle', '.shortsLockupViewModelHostOutsideMetadataTitle', // shorts lockup
    'h3 a', 'h3'
  ];
  const TITLE_SELECTORS_REEL = [
    '.ytShortsVideoTitleViewModelShortsVideoTitle', 'yt-shorts-video-title-view-model h2',
    'yt-shorts-video-title-view-model', '.reel-player-header-renderer .title', '#overlay h2', 'h2'
  ];
  const TITLE_SELECTORS_CHANNEL_PLAYER = ['#title a', '#title', 'h3'];
  const TITLE_SELECTORS_VIDEOWALL = ['.ytp-videowall-still-info-title', '.ytp-modern-videowall-still-info-title'];
  const TITLE_SELECTORS_ENDCARD = ['.ytp-ce-video-title'];
  const TITLE_FALLBACK = 'a[href*="/watch?v="][title], a[href^="/shorts/"][title]';

  // Used by the observer to tell title mutations from unrelated ones.
  const TITLE_SELECTOR_ALL = Array.from(new Set([].concat(
    TITLE_SELECTORS_DEFAULT, TITLE_SELECTORS_REEL, TITLE_SELECTORS_CHANNEL_PLAYER,
    TITLE_SELECTORS_VIDEOWALL, TITLE_SELECTORS_ENDCARD
  ))).join(',');

  const isReel = (el) => el.localName === 'ytd-reel-video-renderer';

  function titleSelectorsFor(el) {
    if (isReel(el)) return TITLE_SELECTORS_REEL;
    if (el.localName === 'ytd-channel-video-player-renderer') return TITLE_SELECTORS_CHANNEL_PLAYER;
    const cl = el.classList;
    if (cl.contains('ytp-videowall-still') || cl.contains('ytp-modern-videowall-still')) return TITLE_SELECTORS_VIDEOWALL;
    if (cl.contains('ytp-ce-video')) return TITLE_SELECTORS_ENDCARD;
    return TITLE_SELECTORS_DEFAULT;
  }

  function textOf(el) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return t || (el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  }

  /** Title text of a card ('' while YouTube has not rendered it yet). Title only - never channel or description. */
  function readTitle(container) {
    const sels = titleSelectorsFor(container);
    for (let i = 0; i < sels.length; i++) {
      const el = container.querySelector(sels[i]);
      if (el) {
        const t = textOf(el);
        if (t) return t;
      }
    }
    const a = container.querySelector(TITLE_FALLBACK);
    return a ? (a.getAttribute('title') || '').replace(/\s+/g, ' ').trim() : '';
  }

  function resolveContainer(card) {
    let c = card.closest(OUTER_SELECTOR) || card;
    for (;;) {
      const parent = c.parentElement;
      const outer = parent && parent.closest(OUTER_SELECTOR);
      if (!outer) return c;
      c = outer;
    }
  }

  /* ------------------------------------------------------------------------
   * State
   * ---------------------------------------------------------------------- */

  let cfg = null;
  let matcher = null;
  let cfgVer = 0;
  let running = false;
  let records = new WeakMap(); // container -> { title, ver, state, born }
  const pending = new Set();   // containers waiting for their title
  let pendingTimer = 0;
  let navTimers = [];

  /* ------------------------------ statistics ------------------------------ */

  const counted = new Set(); // each video is counted once per page load
  let statBuf = { count: 0, byCategory: {}, keywords: {} };
  let statTimer = 0;

  function videoKey(c, title) {
    const a = c.querySelector('a[href*="/watch?v="], a[href*="/shorts/"], a[href*="list="]');
    const href = a && a.getAttribute('href');
    const m = href && /(?:[?&]v=|\/shorts\/|[?&]list=)([\w-]{6,})/.exec(href);
    return m ? 'id:' + m[1] : 't:' + title;
  }

  function countBlocked(c, title, result) {
    const key = videoKey(c, title);
    if (counted.has(key)) return;
    counted.add(key);
    statBuf.count++;
    const cat = result.category || 'other';
    statBuf.byCategory[cat] = (statBuf.byCategory[cat] || 0) + 1;
    const kw = String(result.keyword || '').slice(0, 80);
    if (kw) statBuf.keywords[kw] = (statBuf.keywords[kw] || 0) + 1;
    if (!statTimer) statTimer = setTimeout(flushStats, 1500);
  }

  function flushStats() {
    statTimer = 0;
    if (!statBuf.count) return;
    const delta = statBuf;
    statBuf = { count: 0, byCategory: {}, keywords: {} };
    try {
      const p = chrome.runtime.sendMessage({ type: 'GTA6SS_STATS', delta });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* extension was reloaded; nothing to report to */ }
  }

  /* ------------------------------ placeholder ----------------------------- */

  function removePlaceholder(c) {
    const ph = c.querySelector(':scope > .' + PH_CLASS);
    if (ph) ph.remove();
  }

  function onReveal(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const c = ev.currentTarget.closest('[' + ATTR + ']');
    if (!c) return;
    const rec = records.get(c);
    if (rec) rec.state = 'revealed';
    c.setAttribute(ATTR, 'revealed');
    removePlaceholder(c);
  }

  function ensurePlaceholder(c) {
    let ph = c.querySelector(':scope > .' + PH_CLASS);
    if (!ph) {
      ph = document.createElement('div');
      ph.className = PH_CLASS;
      ph.setAttribute('role', 'note');
      const msg = document.createElement('span');
      msg.textContent = 'Video hidden by GTA 6 Spoiler Shield.';
      ph.appendChild(msg);
      c.appendChild(ph);
    }
    let btn = ph.querySelector('button');
    if (cfg.ui.allowReveal && !btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Show anyway';
      btn.addEventListener('click', onReveal, true);
      ph.appendChild(btn);
    } else if (!cfg.ui.allowReveal && btn) {
      btn.remove();
    }
  }

  /* -------------------------------- Shorts -------------------------------- */

  const silencedVideos = new WeakSet();
  let skipTimer = 0;
  let lastSkipAt = 0;
  let skipStreak = 0;
  let lastActiveIdx = -1;

  const indexIn = (el) => (el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : -1);

  function noteActiveReel(c) {
    if (c.hasAttribute('is-active')) lastActiveIdx = indexIn(c);
  }

  function isBlockedState(c) {
    const s = c.getAttribute(ATTR);
    return s === 'hidden' || s === 'placeholder';
  }

  /** A blocked Short must never keep playing audio, and the feed should move on. */
  function enforceReel(c) {
    const v = c.querySelector('video');
    if (v) {
      try { v.pause(); } catch (e) { /* ignore */ }
      if (!silencedVideos.has(v)) {
        silencedVideos.add(v);
        v.addEventListener('play', () => {
          if (isBlockedState(c)) { try { v.pause(); } catch (e) { /* ignore */ } }
        });
      }
    }
    if (c.hasAttribute('is-active')) skipShort(c);
  }

  function skipShort(c) {
    if (!cfg.ui.skipShorts || skipTimer) return;
    skipTimer = setTimeout(() => {
      skipTimer = 0;
      if (!running || !c.isConnected || !c.hasAttribute('is-active') || !isBlockedState(c)) return;
      const now = Date.now();
      if (now - lastSkipAt > 10000) skipStreak = 0;
      if (skipStreak >= 25) return; // never fight the page forever
      const idx = indexIn(c);
      const dir = lastActiveIdx >= 0 && idx >= 0 && idx < lastActiveIdx ? 'up' : 'down';
      const btn = document.querySelector('#navigation-button-' + dir + ' button') ||
                  document.querySelector('#navigation-button-' + dir);
      if (btn) {
        lastSkipAt = now;
        skipStreak++;
        lastActiveIdx = idx;
        btn.click();
      }
    }, 250);
  }

  /* ------------------------------ per-card logic --------------------------- */

  function release(c, rec) {
    if (c.getAttribute(ATTR) === 'pending') c.removeAttribute(ATTR);
    rec.state = 'clear';
    pending.delete(c);
  }

  function allow(c, rec) {
    if (c.hasAttribute(ATTR)) c.removeAttribute(ATTR);
    removePlaceholder(c);
    rec.state = 'clear';
    pending.delete(c);
    if (isReel(c)) noteActiveReel(c);
  }

  function block(c, rec, result, title) {
    const usePlaceholder = cfg.ui.placeholder;
    c.setAttribute(ATTR, usePlaceholder ? 'placeholder' : 'hidden');
    if (usePlaceholder) ensurePlaceholder(c); else removePlaceholder(c);
    rec.state = 'blocked';
    pending.delete(c);
    countBlocked(c, title, result);
    if (isReel(c)) enforceReel(c);
  }

  function processContainer(c) {
    if (!running || !matcher || !c.isConnected) return;
    let rec = records.get(c);
    if (!rec) {
      rec = { title: '', ver: -1, state: 'new', born: Date.now() };
      records.set(c, rec);
    }
    const title = readTitle(c);

    if (!title) {
      // YouTube renders titles slightly after the card itself. Keep the card
      // invisible until the title arrives, but never for longer than PENDING_MAX_MS.
      if (rec.state === 'new') {
        c.setAttribute(ATTR, 'pending');
        rec.state = 'pending';
        pending.add(c);
        schedulePendingSweep();
      } else if (rec.state === 'pending' && Date.now() - rec.born > PENDING_MAX_MS) {
        release(c, rec);
      }
      return;
    }

    if (rec.title === title && rec.ver === cfgVer && rec.state !== 'pending') {
      // Nothing changed. Reels still get re-enforced (Shorts re-activate on scroll).
      if (rec.state === 'blocked' && isReel(c)) enforceReel(c);
      else if (rec.state === 'clear' && isReel(c)) noteActiveReel(c);
      return;
    }
    if (rec.state === 'revealed' && rec.title === title) { rec.ver = cfgVer; return; }

    const result = matcher.evaluate(title);
    rec.title = title;
    rec.ver = cfgVer;
    if (result.blocked) block(c, rec, result, title); else allow(c, rec);
  }

  function schedulePendingSweep() {
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = 0;
      pending.forEach((c) => {
        if (!c.isConnected) { pending.delete(c); return; }
        processContainer(c);
      });
      if (pending.size) schedulePendingSweep();
    }, 250);
  }

  function handleCards(cards) {
    const seen = new Set();
    for (const card of cards) {
      const c = resolveContainer(card);
      if (seen.has(c)) continue;
      seen.add(c);
      processContainer(c);
    }
  }

  const scanAll = () => handleCards(document.querySelectorAll(CARD_SELECTOR));

  /* ------------------------------ lifecycle ------------------------------- */

  const observer = DomObserver.create({
    cardSelector: CARD_SELECTOR,
    titleSelector: TITLE_SELECTOR_ALL,
    attributeFilter: ['title', 'href', 'is-active'],
    isOwnNode: (n) => n.classList && n.classList.contains(PH_CLASS),
    onCards: handleCards,
    onFullScan: scanAll,
    onNavigate: () => {
      lastActiveIdx = -1;
      scanAll();
      // YouTube fills the new page in stages; look again as it settles.
      navTimers.forEach(clearTimeout);
      navTimers = [setTimeout(scanAll, 400), setTimeout(scanAll, 1500)];
    }
  });

  function restoreAll() {
    document.querySelectorAll('[' + ATTR + ']').forEach((el) => el.removeAttribute(ATTR));
    document.querySelectorAll('.' + PH_CLASS).forEach((el) => el.remove());
    records = new WeakMap();
    pending.clear();
  }

  function startFiltering() {
    running = true;
    observer.start();
    scanAll();
    navTimers.forEach(clearTimeout);
    navTimers = [setTimeout(scanAll, 400)];
  }

  function stopFiltering() {
    running = false;
    observer.stop();
    navTimers.forEach(clearTimeout);
    navTimers = [];
    clearTimeout(pendingTimer);
    pendingTimer = 0;
    clearTimeout(skipTimer);
    skipTimer = 0;
    restoreAll();
  }

  function applyConfig() {
    matcher = Engine.fromConfig(cfg);
    cfgVer++;
    if (cfg.enabled) {
      if (!running) startFiltering(); else scanAll();
    } else if (running) {
      stopFiltering();
    }
  }

  function countHidden() {
    return document.querySelectorAll('[' + ATTR + '="hidden"],[' + ATTR + '="placeholder"]').length;
  }

  function onMessage(msg, sender, sendResponse) {
    if (!msg || msg.type !== 'GTA6SS_GET_STATUS') return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return false;
    sendResponse({
      ok: true,
      running,
      enabled: !!(cfg && cfg.enabled),
      hidden: countHidden(),
      path: location.pathname
    });
    return false;
  }

  async function init() {
    try {
      cfg = await Config.load();
    } catch (e) {
      console.warn('[GTA 6 Spoiler Shield] could not read settings', e);
      return;
    }
    applyConfig();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[Config.CONFIG_KEY]) return;
      cfg = Config.sanitize(changes[Config.CONFIG_KEY].newValue);
      applyConfig();
    });
    chrome.runtime.onMessage.addListener(onMessage);
    window.addEventListener('pagehide', flushStats);
  }

  init();
})();
