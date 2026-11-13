/*
 * GTA 6 Spoiler Shield - DOM observer
 * ---------------------------------------------------------------------------
 * Watches the page for new or changed video cards and reports them to the
 * YouTube adapter. It knows nothing about keywords.
 *
 * Two paths keep things fast without missing anything:
 *   quick path   - runs on the next animation frame (before the browser
 *                  paints), so a freshly inserted card is judged before it
 *                  is ever visible. Only touches cards affected by mutations.
 *   safety scan  - debounced full scan after a burst of card-related
 *                  mutations, in case something slipped through.
 *
 * Loop safety: the observer only listens for title/href/is-active attribute
 * changes, so the data-gta6ss attribute we set ourselves never re-triggers
 * it, and nodes we create (placeholders) are ignored via isOwnNode().
 */
(function (root) {
  'use strict';
  const NS = (root.GTA6Shield = root.GTA6Shield || {});

  function create(opts) {
    const cardSelector = opts.cardSelector;
    const titleSelector = opts.titleSelector;
    const attributeFilter = opts.attributeFilter || ['title', 'href'];
    const isOwnNode = opts.isOwnNode || (() => false);
    const onCards = opts.onCards;
    const onFullScan = opts.onFullScan;
    const onNavigate = opts.onNavigate;
    const debounceMs = opts.debounceMs || 250;
    const maxWaitMs = opts.maxWaitMs || 1500;
    const pollMs = opts.pollMs || 1000;

    let observer = null;
    let running = false;
    let dirtyRoots = new Set();
    let dirtyCards = new Set();
    let sawCards = false;
    let rafId = 0;
    let quickTimer = 0;
    let debounceTimer = 0;
    let firstDirtyAt = 0;
    let pollTimer = 0;
    let lastUrl = '';
    let lastNavAt = 0;

    /* ---------------------------- mutation triage --------------------------- */

    function noteTitleish(el) {
      if (!el || !el.closest) return;
      const card = el.closest(cardSelector);
      if (card && (el === card || el.closest(titleSelector))) dirtyCards.add(card);
    }

    function onMutations(list) {
      if (!running) return;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.type === 'childList') {
          const added = m.addedNodes;
          for (let j = 0; j < added.length; j++) {
            const n = added[j];
            if (n.nodeType === 1) {
              if (!isOwnNode(n)) dirtyRoots.add(n);
            } else if (n.nodeType === 3) {
              noteTitleish(n.parentElement); // a title text node was replaced
            }
          }
        } else if (m.type === 'characterData') {
          noteTitleish(m.target.parentElement);
        } else {
          noteTitleish(m.target); // title / href / is-active attribute
        }
      }
      if (dirtyRoots.size || dirtyCards.size) scheduleQuick();
    }

    /* ------------------------------- scheduling ----------------------------- */

    function scheduleQuick() {
      if (rafId || quickTimer) return;
      rafId = requestAnimationFrame(runQuick);
      quickTimer = setTimeout(runQuick, 120); // background tabs do not run rAF
    }

    function cancelQuick() {
      if (rafId) cancelAnimationFrame(rafId);
      if (quickTimer) clearTimeout(quickTimer);
      rafId = 0;
      quickTimer = 0;
    }

    function runQuick() {
      cancelQuick();
      if (!running) return;
      const roots = dirtyRoots;
      const direct = dirtyCards;
      dirtyRoots = new Set();
      dirtyCards = new Set();

      const cards = new Set(direct);
      roots.forEach((r) => {
        if (!r.isConnected) return;
        if (r.matches(cardSelector)) cards.add(r);
        const up = r.closest(cardSelector);
        if (up) cards.add(up);
        const inner = r.querySelectorAll(cardSelector);
        for (let i = 0; i < inner.length; i++) cards.add(inner[i]);
      });

      if (cards.size) {
        sawCards = true;
        onCards(Array.from(cards));
        scheduleDebounced();
      }
    }

    function scheduleDebounced() {
      const now = Date.now();
      if (!firstDirtyAt) firstDirtyAt = now;
      clearTimeout(debounceTimer);
      const wait = Math.max(0, Math.min(debounceMs, firstDirtyAt + maxWaitMs - now));
      debounceTimer = setTimeout(runSafetyScan, wait);
    }

    function runSafetyScan() {
      firstDirtyAt = 0;
      if (!running || !sawCards) return;
      sawCards = false;
      onFullScan();
    }

    /* ------------------------------- navigation ----------------------------- */

    function handleNavigation() {
      if (!running) return;
      const now = Date.now();
      if (now - lastNavAt < 150) return; // several YouTube events fire per navigation
      lastNavAt = now;
      lastUrl = location.href;
      onNavigate(location.href);
    }

    function poll() {
      if (location.href !== lastUrl) handleNavigation();
    }

    const NAV_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated', 'popstate', 'hashchange'];

    /* --------------------------------- public ------------------------------- */

    function start() {
      if (running) return;
      running = true;
      lastUrl = location.href;

      const begin = () => {
        if (!running || observer) return;
        observer = new MutationObserver(onMutations);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter
        });
      };
      if (document.documentElement) begin();
      else document.addEventListener('DOMContentLoaded', begin, { once: true });

      NAV_EVENTS.forEach((ev) => {
        document.addEventListener(ev, handleNavigation, true);
        window.addEventListener(ev, handleNavigation, true);
      });
      pollTimer = setInterval(poll, pollMs);
    }

    function stop() {
      running = false;
      if (observer) observer.disconnect();
      observer = null;
      cancelQuick();
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      NAV_EVENTS.forEach((ev) => {
        document.removeEventListener(ev, handleNavigation, true);
        window.removeEventListener(ev, handleNavigation, true);
      });
      dirtyRoots = new Set();
      dirtyCards = new Set();
      sawCards = false;
      firstDirtyAt = 0;
    }

    return { start, stop, isRunning: () => running };
  }

  NS.DomObserver = { create };
})(typeof globalThis !== 'undefined' ? globalThis : self);
