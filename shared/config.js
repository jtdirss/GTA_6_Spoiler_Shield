/*
 * GTA 6 Spoiler Shield - configuration helpers (shared by content script,
 * popup, options page and service worker).
 *
 * Storage layout (chrome.storage.local):
 *   config  -> user settings and keyword overrides (this file)
 *   stats   -> lifetime statistics (written only by the service worker)
 * chrome.storage.session:
 *   session -> blocked-video counter for the current browser session
 */
(function (root) {
  'use strict';
  const NS = (root.GTA6Shield = root.GTA6Shield || {});

  const CONFIG_KEY = 'config';
  const STATS_KEY = 'stats';
  const SESSION_KEY = 'session';
  const SCHEMA_VERSION = 1;
  const MODES = ['balanced', 'strict', 'custom'];
  const SENSITIVITIES = ['low', 'medium', 'high'];
  const LIMITS = { text: 120, aliases: 12, added: 2000, idLength: 120 };
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function defaultConfig() {
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: true,
      mode: 'strict',
      custom: { sensitivity: 'medium', categories: {} },
      keywords: { disabled: [], deleted: [], edited: {}, added: [] },
      ui: { placeholder: false, allowReveal: false, skipShorts: true }
    };
  }

  const isId = (v) =>
    typeof v === 'string' && v.length > 0 && v.length <= LIMITS.idLength &&
    /^[A-Za-z0-9:_.\-*]+$/.test(v) && !FORBIDDEN_KEYS.has(v);

  const cleanText = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, LIMITS.text);

  function cleanAliases(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const a of list) {
      const t = cleanText(a);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= LIMITS.aliases) break;
    }
    return out;
  }

  function categoryIds() {
    return NS.Keywords.CATEGORIES.map((c) => c.id);
  }

  function newId() {
    return 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Turns anything (old version, hand-edited import, garbage) into a valid config. */
  function sanitize(raw) {
    const c = defaultConfig();
    if (!raw || typeof raw !== 'object') return c;

    c.enabled = raw.enabled !== false;
    c.mode = MODES.includes(raw.mode) ? raw.mode : 'strict';

    const cu = raw.custom && typeof raw.custom === 'object' ? raw.custom : {};
    c.custom.sensitivity = SENSITIVITIES.includes(cu.sensitivity) ? cu.sensitivity : 'medium';
    const validCats = new Set(categoryIds());
    if (cu.categories && typeof cu.categories === 'object') {
      for (const [k, v] of Object.entries(cu.categories)) {
        if (validCats.has(k) && typeof v === 'boolean') c.custom.categories[k] = v;
      }
    }

    const kw = raw.keywords && typeof raw.keywords === 'object' ? raw.keywords : {};
    const idList = (l) => (Array.isArray(l) ? Array.from(new Set(l.filter(isId))).slice(0, 5000) : []);
    c.keywords.disabled = idList(kw.disabled);
    c.keywords.deleted = idList(kw.deleted);

    if (kw.edited && typeof kw.edited === 'object') {
      for (const [id, v] of Object.entries(kw.edited)) {
        if (!isId(id) || !v || typeof v !== 'object') continue;
        const text = cleanText(v.text);
        if (!text) continue;
        const e = { text, aliases: cleanAliases(v.aliases) };
        if (NS.Keywords.VALID_KINDS.includes(v.kind)) e.kind = v.kind;
        c.keywords.edited[id] = e;
      }
    }

    if (Array.isArray(kw.added)) {
      const seen = new Set();
      for (const a of kw.added) {
        if (!a || typeof a !== 'object') continue;
        const text = cleanText(a.text);
        if (!text) continue;
        let id = isId(a.id) ? a.id : newId();
        if (seen.has(id)) id = newId();
        seen.add(id);
        c.keywords.added.push({
          id,
          category: validCats.has(a.category) ? a.category : 'custom',
          text,
          aliases: cleanAliases(a.aliases),
          kind: NS.Keywords.VALID_KINDS.includes(a.kind) ? a.kind : 'direct'
        });
        if (c.keywords.added.length >= LIMITS.added) break;
      }
    }

    const ui = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
    c.ui.placeholder = ui.placeholder === true;
    c.ui.allowReveal = ui.allowReveal === true;
    c.ui.skipShorts = ui.skipShorts !== false;
    return c;
  }

  /* ----------------------------- storage ------------------------------- */

  async function load() {
    const r = await chrome.storage.local.get(CONFIG_KEY);
    return sanitize(r[CONFIG_KEY]);
  }

  async function save(config) {
    const clean = sanitize(config);
    await chrome.storage.local.set({ [CONFIG_KEY]: clean });
    return clean;
  }

  /** Read-modify-write. The mutator may change the object in place. */
  async function update(mutator) {
    const cfg = await load();
    const result = mutator(cfg);
    return save(result || cfg);
  }

  /* ------------------------ effective keyword list ---------------------- */

  /** Default entries (minus deleted, plus edits) followed by the user's own. */
  function effectiveEntries(config) {
    const out = [];
    const deleted = new Set(config.keywords.deleted);
    const disabled = new Set(config.keywords.disabled);
    for (const e of NS.Keywords.getDefaultEntries()) {
      if (deleted.has(e.id)) continue;
      const ed = config.keywords.edited[e.id];
      out.push({
        id: e.id,
        category: e.category,
        text: ed ? ed.text : e.text,
        aliases: ed ? ed.aliases : e.aliases,
        kind: ed && ed.kind ? ed.kind : e.kind,
        enabled: !disabled.has(e.id),
        source: 'default',
        edited: !!ed
      });
    }
    for (const a of config.keywords.added) {
      out.push({
        id: a.id, category: a.category, text: a.text, aliases: a.aliases, kind: a.kind,
        enabled: !disabled.has(a.id), source: 'custom', edited: false
      });
    }
    return out;
  }

  /** Category toggles and sensitivity only apply in Custom mode. */
  function categoryEnabled(config, categoryId) {
    if (config.mode !== 'custom') return true;
    return config.custom.categories[categoryId] !== false;
  }

  function activeEntries(config) {
    return effectiveEntries(config).filter((e) => e.enabled && categoryEnabled(config, e.category));
  }

  function activeCombos(config) {
    const disabled = new Set(config.keywords.disabled);
    return NS.Keywords.COMBOS.filter((c) => !disabled.has(c.id) && categoryEnabled(config, c.category));
  }

  function countActive(config) {
    return activeEntries(config).length;
  }

  /* --------------------------- import / export -------------------------- */

  function exportObject(config) {
    return {
      app: 'GTA 6 Spoiler Shield',
      format: 1,
      exportedAt: new Date().toISOString(),
      config: sanitize(config)
    };
  }

  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!data || typeof data !== 'object') throw new Error('The file does not contain a configuration.');
    const payload = data.config && typeof data.config === 'object' ? data.config : data;
    if (!('mode' in payload || 'keywords' in payload || 'enabled' in payload || 'ui' in payload)) {
      throw new Error('This does not look like a GTA 6 Spoiler Shield configuration.');
    }
    return sanitize(payload);
  }

  NS.Config = {
    CONFIG_KEY, STATS_KEY, SESSION_KEY, MODES, SENSITIVITIES, LIMITS,
    defaultConfig, sanitize, load, save, update, newId,
    effectiveEntries, activeEntries, activeCombos, categoryEnabled, countActive,
    exportObject, parseImport
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
