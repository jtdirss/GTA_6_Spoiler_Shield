(function () {
  'use strict';
  const { Config, Engine, Keywords } = self.GTA6Shield;
  const $ = (id) => document.getElementById(id);

  let config = Config.defaultConfig();
  let query = '';
  let editingId = null;
  const openGroups = new Set(['characters']);

  const SAMPLE_TITLES = [
    'GTA 6 Gameplay', 'GTA VI Ending Explained', 'Grand Theft Auto 6 Full Story', "Lucia's Secret",
    'Vice City Map Revealed', 'Every GTA 6 Mission', "Jason's Death Explained",
    'Brian Cox on black holes', 'Rockstar Games Launcher not opening', 'Elden Ring ending explained',
    'Best Game Endings Ever', 'G T A 6 Trailer', 'My Great Adventure', 'Unrelated gameplay videos'
  ];

  /* ------------------------------ small helpers ---------------------------- */

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'data') Object.assign(n.dataset, v);
        else if (k === 'checked' || k === 'disabled' || k === 'value' || k === 'hidden') n[k] = v;
        else n.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  function flash(id, text, kind) {
    const m = $(id);
    m.textContent = text;
    m.dataset.kind = kind || '';
  }

  function categoryName(id) {
    const c = Keywords.CATEGORIES.find((x) => x.id === id);
    return c ? c.name : id;
  }

  async function mutate(fn) {
    config = await Config.update(fn);
    renderAll();
  }

  function toggleSwitch(checked, cls, label) {
    return el('label', { class: 'switch sm' }, [
      el('input', { type: 'checkbox', class: cls, checked, 'aria-label': label }),
      el('span', { class: 'slider' })
    ]);
  }

  /* -------------------------------- filtering ------------------------------ */

  function renderMode() {
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === config.mode; });
    $('master').checked = config.enabled;
    $('sensitivity').value = config.custom.sensitivity;

    const panel = $('customPanel');
    const inactive = config.mode !== 'custom';
    panel.dataset.inactive = String(inactive);
    $('customNote').textContent = inactive
      ? 'These options only apply in Custom mode. Pick Custom above to use them.'
      : '';

    const entries = Config.effectiveEntries(config);
    const list = $('categoryList');
    list.textContent = '';
    for (const cat of Keywords.CATEGORIES) {
      const total = entries.filter((e) => e.category === cat.id).length;
      const on = config.custom.categories[cat.id] !== false;
      list.appendChild(el('div', { class: 'cat-item' }, [
        toggleSwitch(on, 'cat-toggle', 'Enable ' + cat.name),
        el('div', { class: 'txt', data: { id: cat.id } }, [
          el('div', { class: 'name', text: cat.name + ' (' + total + ')' }),
          el('div', { class: 'desc', text: cat.description })
        ])
      ]));
      list.lastChild.dataset.id = cat.id;
    }
  }

  function renderDisplay() {
    $('optPlaceholder').checked = config.ui.placeholder;
    $('optReveal').checked = config.ui.allowReveal;
    $('optReveal').disabled = !config.ui.placeholder;
    $('optSkip').checked = config.ui.skipShorts;
  }

  /* -------------------------------- keywords ------------------------------- */

  function matchesQuery(e, q, qNorm) {
    const hay = [e.text].concat(e.aliases || []);
    return hay.some((t) => t.toLowerCase().includes(q) || (qNorm && Engine.normalize(t).includes(qNorm)));
  }

  function buildRow(e) {
    const row = el('div', { class: 'kw', data: { id: e.id, enabled: String(e.enabled) } });
    row.appendChild(toggleSwitch(e.enabled, 'kw-toggle', 'Enable ' + e.text));

    const main = el('div', {}, [el('span', { class: 'kw-text', text: e.text })]);
    if (e.aliases && e.aliases.length) main.firstChild.appendChild(el('span', { class: 'kw-alias', text: 'Also: ' + e.aliases.join(', ') }));
    row.appendChild(main);

    if (editingId === e.id) {
      row.appendChild(el('div', { class: 'kw-edit' }, [
        el('input', { type: 'text', class: 'ed-text', value: e.text, maxlength: 120, 'aria-label': 'Keyword text' }),
        el('input', { type: 'text', class: 'ed-aliases', value: (e.aliases || []).join(', '), placeholder: 'Alternate spellings, comma separated', 'aria-label': 'Alternate spellings' }),
        (() => {
          const s = el('select', { class: 'ed-kind', 'aria-label': 'Keyword type' });
          Keywords.VALID_KINDS.forEach((k) => {
            const o = el('option', { value: k, text: Keywords.KINDS[k].label });
            if (k === e.kind) o.selected = true;
            s.appendChild(o);
          });
          return s;
        })()
      ]));
      row.appendChild(el('div', { class: 'kw-edit-actions' }, [
        el('button', { type: 'button', class: 'primary kw-save', text: 'Save' }),
        el('button', { type: 'button', class: 'kw-cancel', text: 'Cancel' })
      ]));
      return row;
    }

    row.appendChild(el('span', { class: 'badge', data: { kind: e.kind }, text: Keywords.KINDS[e.kind].label, title: Keywords.KINDS[e.kind].help }));
    const actions = el('div', { class: 'kw-actions' }, [
      el('button', { type: 'button', class: 'kw-edit-btn', text: 'Edit' }),
      e.edited ? el('button', { type: 'button', class: 'kw-reset', text: 'Reset' }) : null,
      el('button', { type: 'button', class: 'danger kw-del', text: 'Delete' })
    ]);
    row.appendChild(actions);
    return row;
  }

  function renderKeywords() {
    const list = $('kwList');
    list.textContent = '';
    const q = query.trim().toLowerCase();
    const qNorm = Engine.normalize(query);
    const entries = Config.effectiveEntries(config);
    let shown = 0;

    for (const cat of Keywords.CATEGORIES) {
      let items = entries.filter((e) => e.category === cat.id);
      const total = items.length;
      if (q) items = items.filter((e) => matchesQuery(e, q, qNorm));
      if (q && !items.length) continue;
      shown += items.length;

      const details = el('details', { class: 'group', data: { id: cat.id } });
      if (q || openGroups.has(cat.id) || editingId && items.some((e) => e.id === editingId)) details.open = true;
      const activeCount = items.filter((e) => e.enabled).length;
      details.appendChild(el('summary', {}, [
        el('span', { text: cat.name }),
        el('span', { class: 'count', text: q ? items.length + ' of ' + total + ' match' : activeCount + ' of ' + total + ' active' })
      ]));
      details.appendChild(el('div', { class: 'group-desc', text: cat.description }));
      const body = el('div', { class: 'group-body' });
      if (!items.length) body.appendChild(el('div', { class: 'empty', text: cat.id === 'custom' ? 'No keywords of your own yet. Add one above.' : 'Nothing here.' }));
      const frag = document.createDocumentFragment();
      items.forEach((e) => frag.appendChild(buildRow(e)));
      body.appendChild(frag);
      details.appendChild(body);
      list.appendChild(details);
    }
    if (q && !shown) list.appendChild(el('div', { class: 'empty', text: 'No keywords match “' + query.trim() + '”.' }));

    const nDeleted = config.keywords.deleted.length;
    $('restoreDeleted').hidden = nDeleted === 0;
    $('restoreDeleted').textContent = 'Restore ' + nDeleted + ' deleted keyword' + (nDeleted === 1 ? '' : 's');

    renderCombos();
  }

  function renderCombos() {
    const box = $('comboList');
    box.textContent = '';
    const disabled = new Set(config.keywords.disabled);
    for (const c of Keywords.COMBOS) {
      const detail = c.groups.map((g) => g.join(' / ')).join('  +  ') + (c.minLevel >= 2 ? '   (Strict / High only)' : '');
      const row = el('div', { class: 'combo', data: { id: c.id } }, [
        toggleSwitch(!disabled.has(c.id), 'combo-toggle', 'Enable ' + c.label),
        el('div', {}, [el('div', { text: c.label }), el('div', { class: 'detail', text: detail })])
      ]);
      box.appendChild(row);
    }
  }

  function setDisabled(id, on) {
    return mutate((c) => {
      const s = new Set(c.keywords.disabled);
      if (on) s.delete(id); else s.add(id);
      c.keywords.disabled = Array.from(s);
    });
  }

  function deleteKeyword(id) {
    return mutate((c) => {
      const custom = c.keywords.added.some((a) => a.id === id);
      if (custom) c.keywords.added = c.keywords.added.filter((a) => a.id !== id);
      else if (!c.keywords.deleted.includes(id)) c.keywords.deleted.push(id);
      delete c.keywords.edited[id];
      c.keywords.disabled = c.keywords.disabled.filter((d) => d !== id);
    });
  }

  function parseAliases(s) {
    return String(s).split(',').map((x) => x.trim()).filter(Boolean);
  }

  function saveEdit(row) {
    const id = row.dataset.id;
    const text = row.querySelector('.ed-text').value.replace(/\s+/g, ' ').trim();
    const aliases = parseAliases(row.querySelector('.ed-aliases').value);
    const kind = row.querySelector('.ed-kind').value;
    if (!Engine.normalize(text)) {
      row.querySelector('.ed-text').focus();
      return;
    }
    editingId = null;
    return mutate((c) => {
      const custom = c.keywords.added.find((a) => a.id === id);
      if (custom) {
        custom.text = text; custom.aliases = aliases; custom.kind = kind;
        return;
      }
      const def = Keywords.getDefaultEntries().find((d) => d.id === id);
      const same = def && def.text === text && def.kind === kind && def.aliases.join('|') === aliases.join('|');
      if (same) delete c.keywords.edited[id];
      else c.keywords.edited[id] = { text, aliases, kind };
    });
  }

  function addKeyword() {
    const text = $('addText').value.replace(/\s+/g, ' ').trim();
    const kind = $('addKind').value;
    const norm = Engine.normalize(text);
    if (!norm) { flash('addMsg', 'Enter a keyword with at least one letter or number.', 'error'); return; }
    const dup = Config.effectiveEntries(config).find((e) => e.kind === kind && Engine.normalize(e.text) === norm);
    if (dup) { flash('addMsg', '“' + dup.text + '” is already in the list (' + categoryName(dup.category) + ').', 'error'); return; }
    $('addText').value = '';
    query = '';
    $('kwSearch').value = '';
    openGroups.add('custom');
    flash('addMsg', 'Added “' + text + '” to My keywords.', 'ok');
    mutate((c) => { c.keywords.added.push({ id: Config.newId(), category: 'custom', text, aliases: [], kind }); });
  }

  /* --------------------------------- tester -------------------------------- */

  function runTest() {
    const lines = $('testInput').value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200);
    const mk = (mode) => Engine.fromConfig(Object.assign({}, config, { mode }));
    const matchers = [mk('balanced'), mk('strict'), mk('custom')];
    const out = $('testResults');
    out.textContent = '';
    if (!lines.length) { out.appendChild(el('div', { class: 'empty', text: 'Enter at least one title.' })); return; }

    const table = el('table');
    table.appendChild(el('thead', {}, [el('tr', {}, ['Title', 'Balanced', 'Strict', 'Custom (current settings)'].map((h) => el('th', { text: h })))]));
    const tbody = el('tbody');
    for (const line of lines) {
      const tr = el('tr', {}, [el('td', { text: line })]);
      for (const m of matchers) {
        const r = m.evaluate(line);
        tr.appendChild(el('td', {}, [
          r.blocked
            ? el('span', { class: 'chip block', title: 'Rule: ' + r.rule }, ['Hidden ', el('small', { text: '· ' + r.keyword })])
            : el('span', { class: 'chip allow', text: 'Visible' })
        ]));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    out.appendChild(table);
  }

  /* -------------------------------- statistics ----------------------------- */

  async function renderStats() {
    const r = await chrome.storage.local.get(Config.STATS_KEY);
    const s = r[Config.STATS_KEY] || { total: 0, byCategory: {}, keywords: {}, since: Date.now() };
    let session = 0;
    try {
      const ss = await chrome.storage.session.get(Config.SESSION_KEY);
      session = (ss[Config.SESSION_KEY] && ss[Config.SESSION_KEY].count) || 0;
    } catch (e) { /* ignore */ }

    const grid = $('statsGrid');
    grid.textContent = '';
    const box = (n, l) => el('div', { class: 'stat-box' }, [el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: l })]);
    grid.appendChild(box(s.total, 'Blocked in total'));
    grid.appendChild(box(session, 'Blocked this browser session'));
    grid.appendChild(box(new Date(s.since).toLocaleDateString(), 'Counting since'));

    const top = $('topKeywords');
    top.textContent = '';
    const kws = Object.entries(s.keywords || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!kws.length) top.appendChild(el('li', {}, [el('span', { class: 'none', text: 'Nothing blocked yet.' })]));
    kws.forEach(([k, v]) => top.appendChild(el('li', {}, [el('span', { text: k }), el('span', { class: 'v', text: String(v) })])));

    const cats = $('byCategory');
    cats.textContent = '';
    const ce = Object.entries(s.byCategory || {}).sort((a, b) => b[1] - a[1]);
    if (!ce.length) cats.appendChild(el('li', {}, [el('span', { class: 'none', text: 'Nothing blocked yet.' })]));
    ce.forEach(([k, v]) => cats.appendChild(el('li', {}, [el('span', { text: categoryName(k) }), el('span', { class: 'v', text: String(v) })])));
  }

  /* --------------------------------- backup -------------------------------- */

  function exportConfig() {
    const blob = new Blob([JSON.stringify(Config.exportObject(config), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'gta6-spoiler-shield-config.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flash('backupMsg', 'Configuration exported.', 'ok');
  }

  async function importConfig(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('That file is too large to be a configuration.');
      const next = Config.parseImport(await file.text());
      config = await Config.save(next);
      editingId = null;
      renderAll();
      flash('backupMsg', 'Configuration imported.', 'ok');
    } catch (err) {
      flash('backupMsg', err.message || 'Import failed.', 'error');
    }
    $('importFile').value = '';
  }

  async function restoreDefaults() {
    if (!confirm('Restore all default settings? Your keyword changes and custom keywords will be removed. Statistics are kept.')) return;
    config = await Config.save(Config.defaultConfig());
    editingId = null;
    renderAll();
    flash('backupMsg', 'Default settings restored.', 'ok');
  }

  /* ---------------------------------- wiring -------------------------------- */

  function renderAll() {
    renderMode();
    renderDisplay();
    renderKeywords();
  }

  function wire() {
    $('master').addEventListener('change', (e) => mutate((c) => { c.enabled = e.target.checked; }));

    document.querySelectorAll('input[name="mode"]').forEach((r) => {
      r.addEventListener('change', () => mutate((c) => { c.mode = r.value; }));
    });
    $('sensitivity').addEventListener('change', (e) => mutate((c) => { c.custom.sensitivity = e.target.value; }));
    $('categoryList').addEventListener('change', (e) => {
      if (!e.target.classList.contains('cat-toggle')) return;
      const id = e.target.closest('.cat-item').dataset.id;
      mutate((c) => { c.custom.categories[id] = e.target.checked; });
    });

    $('optPlaceholder').addEventListener('change', (e) => mutate((c) => {
      c.ui.placeholder = e.target.checked;
      if (!e.target.checked) c.ui.allowReveal = false;
    }));
    $('optReveal').addEventListener('change', (e) => mutate((c) => { c.ui.allowReveal = e.target.checked; }));
    $('optSkip').addEventListener('change', (e) => mutate((c) => { c.ui.skipShorts = e.target.checked; }));

    let searchTimer = 0;
    $('kwSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { query = e.target.value; renderKeywords(); }, 120);
    });
    $('restoreDeleted').addEventListener('click', () => mutate((c) => { c.keywords.deleted = []; }));
    $('addBtn').addEventListener('click', addKeyword);
    $('addText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

    const list = $('kwList');
    list.addEventListener('toggle', (e) => {
      const g = e.target;
      if (!g.classList || !g.classList.contains('group') || query.trim()) return;
      if (g.open) openGroups.add(g.dataset.id); else openGroups.delete(g.dataset.id);
    }, true);
    list.addEventListener('change', (e) => {
      if (e.target.classList.contains('kw-toggle')) setDisabled(e.target.closest('.kw').dataset.id, e.target.checked);
    });
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.kw');
      if (!row) return;
      const id = row.dataset.id;
      const t = e.target;
      if (t.classList.contains('kw-edit-btn')) { editingId = id; renderKeywords(); const i = list.querySelector('.ed-text'); if (i) i.focus(); }
      else if (t.classList.contains('kw-cancel')) { editingId = null; renderKeywords(); }
      else if (t.classList.contains('kw-save')) saveEdit(row);
      else if (t.classList.contains('kw-del')) deleteKeyword(id);
      else if (t.classList.contains('kw-reset')) mutate((c) => { delete c.keywords.edited[id]; });
    });
    list.addEventListener('keydown', (e) => {
      const row = e.target.closest('.kw');
      if (!row || !e.target.closest('.kw-edit')) return;
      if (e.key === 'Enter') { e.preventDefault(); saveEdit(row); }
      else if (e.key === 'Escape') { editingId = null; renderKeywords(); }
    });
    $('comboList').addEventListener('change', (e) => {
      if (e.target.classList.contains('combo-toggle')) setDisabled(e.target.closest('.combo').dataset.id, e.target.checked);
    });

    $('testInput').value = SAMPLE_TITLES.join('\n');
    $('testBtn').addEventListener('click', runTest);

    $('resetStats').addEventListener('click', async () => {
      if (!confirm('Reset all blocked-video statistics?')) return;
      await chrome.runtime.sendMessage({ type: 'GTA6SS_RESET_STATS' });
      renderStats();
    });

    $('exportBtn').addEventListener('click', exportConfig);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e) => importConfig(e.target.files[0]));
    $('defaultsBtn').addEventListener('click', restoreDefaults);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[Config.CONFIG_KEY]) {
        config = Config.sanitize(changes[Config.CONFIG_KEY].newValue);
        renderMode();
        renderDisplay();
        if (editingId === null) renderKeywords();
      }
      if ((area === 'local' && changes[Config.STATS_KEY]) || (area === 'session' && changes[Config.SESSION_KEY])) renderStats();
    });
  }

  async function init() {
    config = await Config.load();
    wire();
    renderAll();
    renderStats();
    runTest();
  }

  init();
})();
