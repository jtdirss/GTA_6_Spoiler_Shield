/*
 * GTA 6 Spoiler Shield - filtering engine
 * ---------------------------------------------------------------------------
 * Pure logic: no DOM, no chrome.* calls. Takes a video title, answers
 * "should this be hidden, and why?". It is unit-tested under Node
 * (tests/engine.test.js).
 *
 * How a title is judged
 *   1. The title is normalised (see normalize()).
 *   2. Every active keyword is looked up as a whole word / phrase.
 *   3. Decision, in order:
 *        a. a "direct" keyword                       -> block
 *        b. a "strict" keyword in Strict mode        -> block
 *        c. "name" keywords (Jason, Brian, ...)      -> Strict: block
 *                                                       Balanced: block when a
 *                                                       spoiler-ish word or a
 *                                                       generic phrase is next
 *                                                       to it, or two names
 *        d. contextual combinations (Rockstar+leak)  -> block
 *        e. Strict only: generic phrases ("Ending")  -> block when a game-ish
 *                                                       word is also present
 *                                                       or two different
 *                                                       generic phrases appear
 *   4. Strict mode also tries a "de-obfuscated" copy of the title so that
 *      "G T A 6" or "G.T.A. VI" are still caught.
 */
(function (root) {
  'use strict';
  const NS = (root.GTA6Shield = root.GTA6Shield || {});

  const MAX_TITLE_CHARS = 400;
  const MAX_CACHE = 5000;
  const NO_MATCH = Object.freeze({ blocked: false });
  const RANK = { direct: 6, strict: 5, name: 4, context: 3, soft: 2, namectx: 1 };

  /**
   * Lower-cases, strips accents, unifies Unicode punctuation and turns every
   * run of non-letters/digits into a single space.
   *   "𝗚𝗧𝗔 𝟲"            -> "gta 6"
   *   "Lucia’s Secret!!"  -> "lucia secret"
   *   "GTA_VI"            -> "gta vi"
   *   "GTA6"              -> "gta 6"
   *   "Dre’Quan Priest"   -> "drequan priest"
   */
  function normalize(input) {
    if (input === null || input === undefined) return '';
    let s = String(input).slice(0, MAX_TITLE_CHARS);
    try { s = s.normalize('NFKD'); } catch (e) { /* very old engines */ }
    s = s.replace(/[\u0300-\u036f]/g, '').toLowerCase();
    s = s.replace(/[\u2018\u2019\u201B\u02BC\u2032\u0060\u00B4]/g, "'");
    s = s.replace(/'s(?![\p{L}\p{N}])/gu, '');      // possessive: jason's -> jason
    s = s.replace(/s'(?![\p{L}\p{N}])/gu, 's');     // plural possessive: jasons' -> jasons
    s = s.replace(/['"\u201C\u201D\u201E\u00AB\u00BB]/g, ''); // dre'quan -> drequan
    s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
    s = s.replace(/\bgta(?=\d|vi\b|six\b)/g, 'gta '); // gta6 -> gta 6, gtavi -> gta vi
    return s.trim();
  }

  /** "G T A 6" -> "gta 6" (only used in Strict mode, on already-normalised text). */
  function deobfuscate(n) {
    return n
      .replace(/\b(?:[a-z0-9] ){2,}[a-z0-9]\b/g, (m) => m.replace(/ /g, ''))
      .replace(/\bgta(?=\d|vi\b|six\b)/g, 'gta ');
  }

  function compilePattern(raw) {
    const text = String(raw == null ? '' : raw);
    const prefix = /\*\s*$/.test(text);
    const core = normalize(text.replace(/\*+\s*$/, ''));
    if (!core) return null;
    // Padded with spaces so a plain indexOf() is a whole-word match.
    const key = prefix ? ' ' + core : ' ' + core + ' ';
    return { key, prefix };
  }

  function policyFor(config) {
    let level;
    if (config.mode === 'balanced') level = 1;
    else if (config.mode === 'strict') level = 2;
    else level = { low: 0, medium: 1, high: 2 }[config.custom && config.custom.sensitivity] ?? 1;
    return {
      level,
      names: level >= 2 ? 'direct' : level === 1 ? 'context' : 'anchor',
      strictKinds: level >= 2 ? 'direct' : 'context',
      soft: level >= 2,
      obfuscation: level >= 2
    };
  }

  function addPatterns(map, entry) {
    const raws = [entry.text].concat(entry.aliases || []);
    for (const raw of raws) {
      const p = compilePattern(raw);
      if (!p) continue;
      const prev = map.get(p.key);
      if (!prev || RANK[entry.kind] > RANK[prev.entry.kind]) {
        map.set(p.key, { key: p.key, prefix: p.prefix, entry });
      }
    }
  }

  const span = (idx, key) => ({ s: idx + 1, e: idx + key.length - (key.charCodeAt(key.length - 1) === 32 ? 1 : 0) });

  function scan(list, padded) {
    const hits = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const idx = padded.indexOf(p.key);
      if (idx !== -1) {
        const sp = span(idx, p.key);
        hits.push({ p, entry: p.entry, s: sp.s, e: sp.e, len: p.key.length });
      }
    }
    return hits;
  }

  /** Number of hits that do not overlap each other (greedy interval pick). */
  function countDistinct(hits) {
    const sorted = hits.slice().sort((a, b) => a.e - b.e);
    let lastEnd = -1;
    let n = 0;
    for (const h of sorted) {
      if (h.s >= lastEnd) { n++; lastEnd = h.e; }
    }
    return n;
  }

  function longest(hits) {
    return hits.reduce((a, b) => (b.len > a.len ? b : a));
  }

  function distinctEntries(hits) {
    const seen = new Set();
    const out = [];
    for (const h of hits) {
      if (!seen.has(h.entry.id)) { seen.add(h.entry.id); out.push(h); }
    }
    return out;
  }

  /**
   * Builds a matcher for a set of active entries.
   * @param entries  active keyword entries ({id,text,aliases,kind,category})
   * @param combos   active combinations from the keyword DB
   * @param policy   result of policyFor()
   */
  function buildMatcher(entries, combos, policy) {
    const blockMap = new Map();
    const softMap = new Map();
    const nameCtxMap = new Map();
    for (const e of entries) {
      if (e.kind === 'soft') addPatterns(softMap, e);
      else if (e.kind === 'namectx') addPatterns(nameCtxMap, e);
      else addPatterns(blockMap, e);
    }
    const blockList = Array.from(blockMap.values());
    const softList = Array.from(softMap.values());
    const nameCtxList = Array.from(nameCtxMap.values());

    const comboList = [];
    for (const c of combos || []) {
      if (c.minLevel > policy.level) continue;
      const groups = c.groups
        .map((g) => g.map(compilePattern).filter(Boolean).map((p) => p.key))
        .filter((g) => g.length);
      if (groups.length === c.groups.length) comboList.push({ combo: c, groups });
    }

    const cache = new Map();

    const result = (rule, hit) => ({
      blocked: true,
      rule,
      keyword: hit.entry.text,
      entryId: hit.entry.id,
      category: hit.entry.category
    });

    /** Decision on one already-normalised, space-padded string. */
    function decide(padded) {
      const hits = scan(blockList, padded);
      let contexts = [];
      let names = [];

      if (hits.length) {
        const direct = [];
        for (const h of hits) {
          const k = h.entry.kind;
          if (k === 'direct') direct.push(h);
          else if (k === 'strict') {
            if (policy.strictKinds === 'direct') direct.push(h);
            else contexts.push(h);
          } else if (k === 'name') names.push(h);
          else contexts.push(h);
        }
        if (direct.length) return result('direct', longest(direct));
      }

      if (names.length) {
        const nameEntries = distinctEntries(names);
        if (policy.names === 'direct') return result('name', longest(names));
        const hasContext = contexts.length > 0 || nameEntries.length >= 2;
        if (policy.names === 'context') {
          if (hasContext || scan(nameCtxList, padded).length) return result('name-context', longest(names));
        } else if (hasContext) {
          return result('name-context', longest(names));
        }
      }

      for (const c of comboList) {
        if (c.groups.every((g) => g.some((k) => padded.indexOf(k) !== -1))) {
          return {
            blocked: true, rule: 'combo', keyword: c.combo.label,
            entryId: c.combo.id, category: c.combo.category
          };
        }
      }

      if (policy.soft && contexts.length) {
        if (countDistinct(contexts) >= 2) return result('context-pair', longest(contexts));
        let remaining = padded;
        for (const h of contexts) {
          remaining = remaining.slice(0, h.s) + ' '.repeat(h.e - h.s) + remaining.slice(h.e);
        }
        if (scan(softList, remaining).length) return result('context-game-word', longest(contexts));
      }
      return null;
    }

    function evaluate(title) {
      if (typeof title !== 'string' || !title) return NO_MATCH;
      const cached = cache.get(title);
      if (cached) return cached;
      let r = NO_MATCH;
      const n = normalize(title);
      if (n) {
        r = decide(' ' + n + ' ') || NO_MATCH;
        if (!r.blocked && policy.obfuscation) {
          const n2 = deobfuscate(n);
          if (n2 !== n) r = decide(' ' + n2 + ' ') || NO_MATCH;
        }
      }
      if (cache.size >= MAX_CACHE) cache.clear();
      cache.set(title, r);
      return r;
    }

    /** Detailed breakdown for the "Test a title" tool in Settings. */
    function explain(title) {
      const n = normalize(title);
      const padded = ' ' + n + ' ';
      const list = (arr) => arr.map((h) => h.entry.text);
      return {
        normalized: n,
        result: evaluate(title),
        matched: list(scan(blockList, padded)),
        helpers: list(scan(softList, padded)).concat(list(scan(nameCtxList, padded)))
      };
    }

    return {
      evaluate,
      explain,
      policy,
      patternCount: blockList.length + softList.length + nameCtxList.length
    };
  }

  /** Convenience: build a matcher straight from a config object. */
  function fromConfig(config) {
    const cfg = NS.Config;
    return buildMatcher(cfg.activeEntries(config), cfg.activeCombos(config), policyFor(config));
  }

  NS.Engine = { normalize, deobfuscate, policyFor, buildMatcher, fromConfig, NO_MATCH };
})(typeof globalThis !== 'undefined' ? globalThis : self);
