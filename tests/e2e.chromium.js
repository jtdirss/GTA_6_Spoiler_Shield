/*
 * End-to-end test (optional developer tool, not part of the extension).
 *
 * Loads the unpacked extension into a real Chromium, serves a MOCK YouTube page
 * at https://www.youtube.com/ (request interception, no network needed), and
 * exercises hiding, restoring, dynamic loading, SPA navigation, Shorts,
 * ON/OFF, modes, placeholder/reveal, stats, popup and settings pages.
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright CHROME=/path/to/chrome node tests/e2e.chromium.js
 *
 * The mock DOM follows the element names the extension targets. It proves the
 * logic works; it cannot prove YouTube still uses those element names today.
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const EXT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || undefined;

let passed = 0;
const failed = [];
function check(label, cond, extra) {
  if (cond) passed++;
  else failed.push(label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MOCK = `<!doctype html><html><head><title>YouTube</title></head><body>
<ytd-app><div id="page"></div></ytd-app></body></html>`;

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gta6ss-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: false,
    executablePath: CHROME,
    args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await ctx.route('https://www.youtube.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: MOCK }));

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const setConfig = async (patch) => {
    await sw.evaluate(async (p) => {
      const { Config } = self.GTA6Shield;
      await Config.update((c) => {
        if (p.enabled !== undefined) c.enabled = p.enabled;
        if (p.mode) c.mode = p.mode;
        if (p.ui) Object.assign(c.ui, p.ui);
        if (p.added) c.keywords.added.push(...p.added);
      });
    }, patch);
    await sleep(350);
  };
  const getStats = () => sw.evaluate(async () => (await chrome.storage.local.get('stats')).stats);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('https://www.youtube.com/');
  await sleep(500);

  /* ---- helpers that build mock YouTube markup in the page ---- */
  await page.evaluate(() => {
    window.rich = (title, id, chan) => `<ytd-rich-item-renderer data-t="${title.replace(/"/g, '')}"><div id="content"><ytd-rich-grid-media><a id="thumbnail" href="/watch?v=${id}"></a><h3><a id="video-title-link" title="${title}"><yt-formatted-string id="video-title">${title}</yt-formatted-string></a></h3><div id="channel-name">${chan || 'Some Channel'}</div></ytd-rich-grid-media></div></ytd-rich-item-renderer>`;
    window.lockup = (title, id, chan) => `<ytd-rich-item-renderer data-t="${title.replace(/"/g, '')}"><yt-lockup-view-model><a href="/watch?v=${id}"></a><h3 title="${title}"><a class="yt-lockup-metadata-view-model-wiz__title"><span>${title}</span></a></h3><div>${chan || 'Some Channel'}</div></yt-lockup-view-model></ytd-rich-item-renderer>`;
    window.search = (title, id) => `<ytd-video-renderer data-t="${title.replace(/"/g, '')}"><a id="thumbnail" href="/watch?v=${id}"></a><h3><a id="video-title" title="${title}"><yt-formatted-string>${title}</yt-formatted-string></a></h3></ytd-video-renderer>`;
    window.compact = (title, id) => `<ytd-compact-video-renderer data-t="${title.replace(/"/g, '')}"><a href="/watch?v=${id}"></a><h3><span id="video-title" title="${title}">${title}</span></h3></ytd-compact-video-renderer>`;
    window.shortsLockup = (title, id) => `<ytd-rich-item-renderer data-t="${title.replace(/"/g, '')}"><ytm-shorts-lockup-view-model><a class="shortsLockupViewModelHostEndpoint" href="/shorts/${id}" title="${title}"></a><h3 class="shortsLockupViewModelHostMetadataTitle"><a href="/shorts/${id}"><span>${title}</span></a></h3></ytm-shorts-lockup-view-model></ytd-rich-item-renderer>`;
    window.setPage = (html) => { document.getElementById('page').innerHTML = html; };
    window.appendHTML = (html) => { document.getElementById('page').insertAdjacentHTML('beforeend', html); };
    // card whose title text is rendered late (like YouTube's Polymer bindings)
    window.appendDelayed = (title, id, ms) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = window.rich('', id);
      const card = wrap.firstElementChild;
      document.getElementById('page').appendChild(card);
      setTimeout(() => { card.querySelector('#video-title').textContent = title; card.dataset.t = title; }, ms);
      return card;
    };
    window.state = () => {
      const out = {};
      document.querySelectorAll('[data-t]').forEach((c) => { out[c.dataset.t] = c.getAttribute('data-gta6ss') || 'visible'; });
      return out;
    };
  });
  const st = () => page.evaluate(() => window.state());
  const isHidden = (v) => v === 'hidden' || v === 'placeholder';

  /* ---------- 1. Homepage: classic + lockup cards, channel name must NOT matter ---------- */
  const homeBlock = ['GTA 6 Gameplay Leaked', 'GTA VI Trailer 2 Breakdown', 'Grand Theft Auto 6 Full Story', "Lucia's Secret Revealed",
    'Vice City Map Explained', 'Brian Cox on black holes'];
  const homeAllow = ['My Great Adventure', 'Elden Ring ending explained', 'Cooking pasta fast', 'Rockstar Games Launcher fix'];
  await page.evaluate(([b, a]) => {
    let h = '';
    b.forEach((t, i) => { h += (i % 2 ? window.lockup(t, 'AAAA' + i) : window.rich(t, 'AAAA' + i)); });
    a.forEach((t, i) => { h += window.rich(t, 'BBBB' + i, i === 0 ? 'GTA 6 News Channel' : undefined); });
    window.setPage(h);
  }, [homeBlock, homeAllow]);
  await sleep(600);
  let s = await st();
  homeBlock.forEach((t) => check('home blocks: ' + t, isHidden(s[t]), s[t]));
  homeAllow.forEach((t) => check('home allows: ' + t, s[t] === 'visible', s[t]));
  check('channel name containing GTA does not hide a video', s['My Great Adventure'] === 'visible');

  /* ---------- 2. Delayed titles ---------- */
  await page.evaluate(() => {
    window.d1 = window.appendDelayed('GTA 6 Ending Explained', 'DDDD1', 200);
    window.d2 = window.appendDelayed('Totally Normal Video', 'DDDD2', 200);
  });
  await sleep(40);
  const pendingNow = await page.evaluate(() => window.d1.getAttribute('data-gta6ss'));
  check('card without title is kept pending (invisible)', pendingNow === 'pending', pendingNow);
  await sleep(700);
  s = await st();
  check('delayed GTA title gets hidden once rendered', isHidden(s['GTA 6 Ending Explained']), s['GTA 6 Ending Explained']);
  check('delayed normal title is released', s['Totally Normal Video'] === 'visible', s['Totally Normal Video']);

  // titleless card must be released after the safety timeout
  await page.evaluate(() => window.appendHTML('<ytd-rich-item-renderer id="notitle" data-t="notitle"><div>ad slot</div></ytd-rich-item-renderer>'));
  await sleep(1900);
  s = await st();
  check('titleless card released after timeout', s['notitle'] === 'visible', s['notitle']);

  /* ---------- 3. Infinite scroll / dynamic append in bulk ---------- */
  await page.evaluate(() => {
    let h = '';
    for (let i = 0; i < 40; i++) h += window.rich(i % 4 === 0 ? `GTA6 clip number ${i}` : `Random clip ${i}`, 'EEEE' + String(i).padStart(2, '0'));
    window.appendHTML(h);
  });
  await sleep(500);
  s = await st();
  let ok = true;
  for (let i = 0; i < 40; i++) {
    const t = i % 4 === 0 ? `GTA6 clip number ${i}` : `Random clip ${i}`;
    if (i % 4 === 0 ? !isHidden(s[t]) : s[t] !== 'visible') ok = false;
  }
  check('40 dynamically appended cards filtered correctly', ok);

  /* ---------- 4. Title recycling (YouTube reuses elements) ---------- */
  await page.evaluate(() => {
    const c = document.querySelector('[data-t="Cooking pasta fast"]');
    c.querySelector('#video-title').textContent = 'GTA VI Ending';
    c.dataset.t = 'GTA VI Ending';
    const b = document.querySelector('[data-t="GTA 6 Gameplay Leaked"]');
    b.querySelector('#video-title').textContent = 'Gardening tips';
    b.dataset.t = 'Gardening tips';
  });
  await sleep(500);
  s = await st();
  check('visible card recycled to GTA title becomes hidden', isHidden(s['GTA VI Ending']), s['GTA VI Ending']);
  check('hidden card recycled to normal title is restored', s['Gardening tips'] === 'visible', s['Gardening tips']);

  /* ---------- 5. Search / sidebar renderers ---------- */
  await page.evaluate(() => window.setPage(
    window.search('GTA 6 Walkthrough Part 1', 'SSSS01') + window.search('Learn JavaScript in 1 hour', 'SSSS02') +
    window.search('Lucia', 'SSSS03') + window.compact('Jason Duval Explained', 'CCCC01') +
    window.compact('Piano lesson for kids', 'CCCC02') + window.shortsLockup('Port Gellhorn tour #shorts', 'ZZZZ01') +
    window.shortsLockup('Funny cat #shorts', 'ZZZZ02')));
  await sleep(500);
  s = await st();
  ['GTA 6 Walkthrough Part 1', 'Lucia', 'Jason Duval Explained', 'Port Gellhorn tour #shorts'].forEach((t) => check('renderer hides: ' + t, isHidden(s[t]), s[t]));
  ['Learn JavaScript in 1 hour', 'Piano lesson for kids', 'Funny cat #shorts'].forEach((t) => check('renderer keeps: ' + t, s[t] === 'visible', s[t]));
  const hiddenDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('[data-t="Lucia"]')).display);
  check('hidden card is display:none', hiddenDisplay === 'none', hiddenDisplay);

  /* ---------- 6. SPA navigation (no page reload) ---------- */
  await page.evaluate(() => {
    history.pushState({}, '', '/results?search_query=x');
    window.setPage(window.search('GTA Online heist guide', 'NAV001') + window.search('Calm piano music', 'NAV002'));
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await sleep(500);
  s = await st();
  check('after SPA navigation: GTA hidden', isHidden(s['GTA Online heist guide']), s['GTA Online heist guide']);
  check('after SPA navigation: normal visible', s['Calm piano music'] === 'visible');

  /* ---------- 7. Master switch OFF / ON ---------- */
  await page.evaluate(() => window.setPage(
    window.rich('GTA 6 Gameplay', 'OFF001') + window.rich('Normal one', 'OFF002') + window.lockup('Leonida Keys tour', 'OFF003')));
  await sleep(400);
  await setConfig({ ui: { placeholder: true } });
  s = await st();
  check('placeholder mode used', s['GTA 6 Gameplay'] === 'placeholder', s['GTA 6 Gameplay']);
  const phCount = await page.evaluate(() => document.querySelectorAll('.gta6ss-ph').length);
  check('placeholders exist', phCount === 2, phCount);
  const noBtn = await page.evaluate(() => document.querySelectorAll('.gta6ss-ph button').length);
  check('reveal button disabled by default', noBtn === 0, noBtn);

  await setConfig({ ui: { allowReveal: true } });
  const btn = await page.evaluate(() => document.querySelectorAll('.gta6ss-ph button').length);
  check('reveal button appears only when enabled', btn === 2, btn);
  await page.click('[data-t="GTA 6 Gameplay"] .gta6ss-ph button');
  s = await st();
  check('manual reveal works for that one card', s['GTA 6 Gameplay'] === 'revealed' && s['Leonida Keys tour'] === 'placeholder', s);
  await setConfig({ ui: { placeholder: false, allowReveal: false } });
  s = await st();
  check('back to plain hiding; revealed stays under user control', s['Leonida Keys tour'] === 'hidden', s['Leonida Keys tour']);

  await setConfig({ enabled: false });
  const leftovers = await page.evaluate(() => ({ attrs: document.querySelectorAll('[data-gta6ss]').length, ph: document.querySelectorAll('.gta6ss-ph').length }));
  check('OFF restores everything and removes placeholders', leftovers.attrs === 0 && leftovers.ph === 0, leftovers);
  await page.evaluate(() => window.appendHTML(window.rich('GTA 6 Trailer', 'OFF004')));
  await sleep(500);
  s = await st();
  check('while OFF new content is not filtered', s['GTA 6 Trailer'] === 'visible', s['GTA 6 Trailer']);
  await setConfig({ enabled: true });
  s = await st();
  check('ON rescans the page immediately', isHidden(s['GTA 6 Trailer']) && isHidden(s['Leonida Keys tour']), s);

  /* ---------- 8. Modes ---------- */
  await page.evaluate(() => window.setPage(window.rich('Brian Cox on black holes', 'MOD001') + window.rich("Jason's Death Explained", 'MOD002')));
  await sleep(400);
  s = await st();
  check('strict hides common name alone', isHidden(s['Brian Cox on black holes']));
  await setConfig({ mode: 'balanced' });
  s = await st();
  check('balanced shows common name alone', s['Brian Cox on black holes'] === 'visible', s['Brian Cox on black holes']);
  check('balanced still hides name+context', isHidden(s["Jason's Death Explained"]));
  await setConfig({ mode: 'strict' });
  s = await st();
  check('switching back to strict re-hides', isHidden(s['Brian Cox on black holes']));

  /* ---------- 9. Custom keyword ---------- */
  await page.evaluate(() => window.appendHTML(window.rich('Franklin Clinton returns', 'CUS001')));
  await sleep(400);
  s = await st();
  check('custom keyword not yet matched', s['Franklin Clinton returns'] === 'visible');
  await setConfig({ added: [{ id: 'custom:e2e', category: 'custom', text: 'Franklin Clinton', aliases: [], kind: 'direct' }] });
  s = await st();
  check('custom keyword applies live without refresh', isHidden(s['Franklin Clinton returns']), s['Franklin Clinton returns']);

  /* ---------- 10. Shorts feed ---------- */
  await page.evaluate(() => {
    const reel = (t, active) => `<ytd-reel-video-renderer data-t="${t}" ${active ? 'is-active' : ''}><video></video><div id="overlay"><yt-shorts-video-title-view-model><h2 class="ytShortsVideoTitleViewModelShortsVideoTitle"><span>${t}</span></h2></yt-shorts-video-title-view-model></div></ytd-reel-video-renderer>`;
    window.setPage('<div id="shorts-inner-container">' + reel('Normal short A', true) + reel('GTA 6 secret revealed #shorts') + reel('Port Gellhorn drive #shorts') + reel('Normal short B') +
      '</div><div id="navigation-button-down"><button id="down">v</button></div><div id="navigation-button-up"><button id="up">^</button></div>');
    window.clicks = 0;
    document.getElementById('down').addEventListener('click', () => {
      window.clicks++;
      const reels = [...document.querySelectorAll('ytd-reel-video-renderer')];
      const i = reels.findIndex((r) => r.hasAttribute('is-active'));
      reels[i].removeAttribute('is-active');
      if (reels[i + 1]) reels[i + 1].setAttribute('is-active', '');
    });
  });
  await sleep(500);
  s = await st();
  check('Shorts feed hides GTA Shorts', isHidden(s['GTA 6 secret revealed #shorts']) && isHidden(s['Port Gellhorn drive #shorts']), s);
  check('Shorts feed keeps normal Shorts', s['Normal short A'] === 'visible' && s['Normal short B'] === 'visible');
  const vis = await page.evaluate(() => getComputedStyle(document.querySelector('[data-t="GTA 6 secret revealed #shorts"]')).visibility);
  check('blocked Short keeps layout space but is invisible', vis === 'hidden', vis);
  // user scrolls to the blocked Short -> extension pauses it and moves on
  await page.evaluate(() => { document.getElementById('down').click(); window.clicks = 0; });
  await sleep(1400);
  const after = await page.evaluate(() => ({ clicks: window.clicks, active: document.querySelector('[is-active]')?.dataset.t }));
  check('auto-skips past consecutive blocked Shorts to the next normal one', after.active === 'Normal short B', after);

  /* ---------- 11. Performance: 600 cards at once ---------- */
  await page.evaluate(() => window.setPage(''));
  const perf = await page.evaluate(async () => {
    let h = '';
    for (let i = 0; i < 600; i++) h += window.rich(i % 3 === 0 ? `GTA 6 leak video ${i}` : `Video about topic ${i}`, 'PERF' + String(i).padStart(3, '0'));
    const t0 = performance.now();
    window.appendHTML(h);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dt = performance.now() - t0;
    const hidden = document.querySelectorAll('[data-gta6ss="hidden"]').length;
    const pend = document.querySelectorAll('[data-gta6ss="pending"]').length;
    return { dt, hidden, pend };
  });
  check('600-card burst: all 200 GTA cards hidden', perf.hidden === 200 && perf.pend === 0, perf);
  console.log(`  perf: 600 cards inserted and filtered in ${perf.dt.toFixed(0)} ms`);

  // idle CPU: no mutation work when nothing changes
  const idle = await page.evaluate(async () => {
    let n = 0;
    const mo = new MutationObserver((l) => { n += l.length; });
    mo.observe(document.documentElement, { attributes: true, subtree: true, childList: true, attributeFilter: ['data-gta6ss'] });
    await new Promise((r) => setTimeout(r, 2500));
    mo.disconnect();
    return n;
  });
  check('no repeated DOM writes while idle (no observer loop)', idle === 0, idle);

  /* ---------- 12. Statistics ---------- */
  await sleep(2000);
  const stats = await getStats();
  check('statistics recorded in the service worker', stats && stats.total > 200, stats && stats.total);
  check('statistics count each video once (<= unique blocked)', stats.total < 400, stats.total);

  /* ---------- 13. Popup ---------- */
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
  await sleep(500);
  const popState = await pop.evaluate(() => ({
    title: document.querySelector('h1').textContent,
    kw: document.getElementById('statKeywords').textContent,
    session: document.getElementById('statSession').textContent,
    master: document.getElementById('master').checked,
    mode: document.querySelector('.modes [aria-checked="true"]')?.dataset.mode
  }));
  check('popup renders name, keywords, session count', popState.title === 'GTA 6 Spoiler Shield' && Number(popState.kw) > 200 && Number(popState.session) > 0, popState);
  check('popup shows strict as default/current mode', popState.mode === 'strict', popState.mode);
  await pop.click('.modes [data-mode="balanced"]');
  await sleep(300);
  const modeAfter = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config.mode);
  check('popup mode switch persists to storage', modeAfter === 'balanced', modeAfter);
  await pop.click('#master', { force: true });
  await sleep(300);
  const enAfter = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config.enabled);
  check('popup master toggle persists', enAfter === false, enAfter);
  const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  check('toolbar badge shows OFF while disabled', badge === 'OFF', badge);
  await pop.click('#master', { force: true });
  await sleep(300);
  await pop.close();

  /* ---------- 14. Settings page ---------- */
  const opt = await ctx.newPage();
  const optErrors = [];
  opt.on('pageerror', (e) => optErrors.push(String(e)));
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await sleep(600);
  const rows = await opt.evaluate(() => document.querySelectorAll('.kw').length);
  check('settings lists keywords', rows > 0, rows);
  await opt.fill('#kwSearch', 'lucia');
  await sleep(400);
  const found = await opt.evaluate(() => [...document.querySelectorAll('.kw-text')].map((n) => n.firstChild.textContent));
  check('keyword search works', found.includes('Lucia') && !found.includes('Vice City'), found);
  await opt.fill('#kwSearch', '');
  await opt.fill('#addText', 'Tommy Vercetti');
  await opt.click('#addBtn');
  await sleep(500);
  let cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('add custom keyword from settings', cfgNow.keywords.added.some((a) => a.text === 'Tommy Vercetti'));
  // edit it
  await opt.fill('#kwSearch', 'tommy');
  await sleep(300);
  await opt.click('.kw-edit-btn');
  await opt.fill('.ed-text', 'Tommy Vercetti Jr');
  await opt.click('.kw-save');
  await sleep(500);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('edit custom keyword', cfgNow.keywords.added.some((a) => a.text === 'Tommy Vercetti Jr'));
  // disable, then delete
  await opt.click('.kw .switch');
  await sleep(400);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('disable keyword', cfgNow.keywords.disabled.some((id) => id.startsWith('custom:')));
  await opt.click('.kw-del');
  await sleep(400);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('delete custom keyword', !cfgNow.keywords.added.some((a) => a.text.startsWith('Tommy')));
  // delete a default + restore
  await opt.fill('#kwSearch', 'ambrosia');
  await sleep(300);
  await opt.click('.kw-del');
  await sleep(400);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('delete default keyword (reversible)', cfgNow.keywords.deleted.includes('locations:ambrosia'));
  await opt.click('#restoreDeleted');
  await sleep(400);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('restore deleted keywords', cfgNow.keywords.deleted.length === 0);
  // custom mode: category toggle
  await opt.click('input[name="mode"][value="custom"]', { force: true });
  await sleep(300);
  await opt.click('.cat-item[data-id="locations"] .switch', { force: true });
  await sleep(400);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('custom mode category toggle persists', cfgNow.mode === 'custom' && cfgNow.custom.categories.locations === false, cfgNow.custom);
  // tester
  await opt.click('#testBtn');
  const testRows = await opt.evaluate(() => document.querySelectorAll('#testResults tbody tr').length);
  check('title tester renders a row per title', testRows >= 10, testRows);
  // export
  const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#exportBtn')]);
  const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('export produces a valid configuration file', exported.app === 'GTA 6 Spoiler Shield' && exported.config.mode === 'custom');
  // import round trip
  const tmp = path.join(userDir, 'import.json');
  exported.config.mode = 'balanced';
  fs.writeFileSync(tmp, JSON.stringify(exported));
  await opt.setInputFiles('#importFile', tmp);
  await sleep(500);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('import applies configuration', cfgNow.mode === 'balanced', cfgNow.mode);
  fs.writeFileSync(tmp, '{"nonsense": true}');
  await opt.setInputFiles('#importFile', tmp);
  await sleep(400);
  const impMsg = await opt.textContent('#backupMsg');
  check('import rejects non-configuration files', /does not look like/i.test(impMsg), impMsg);
  // restore defaults
  opt.once('dialog', (d) => d.accept());
  await opt.click('#defaultsBtn');
  await sleep(500);
  cfgNow = await sw.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('restore defaults -> strict, enabled', cfgNow.mode === 'strict' && cfgNow.enabled === true && cfgNow.keywords.added.length === 0, cfgNow.mode);
  // reset stats
  opt.once('dialog', (d) => d.accept());
  await opt.click('#resetStats');
  await sleep(600);
  const st2 = await getStats();
  check('reset statistics', st2.total === 0, st2.total);
  check('settings page has no script errors', optErrors.length === 0, optErrors);
  await opt.close();

  /* ---------- 15. Persistence across browser restart ---------- */
  await sw.evaluate(async () => { const { Config } = self.GTA6Shield; await Config.update((c) => { c.mode = 'balanced'; c.keywords.added.push({ id: 'custom:persist', category: 'custom', text: 'Persist Me', aliases: [], kind: 'direct' }); }); });
  await ctx.close();
  const ctx2 = await chromium.launchPersistentContext(userDir, {
    headless: false, executablePath: CHROME,
    args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await ctx2.route('https://www.youtube.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: MOCK }));
  let sw2 = ctx2.serviceWorkers()[0];
  if (!sw2) sw2 = await ctx2.waitForEvent('serviceworker');
  const persisted = await sw2.evaluate(async () => (await chrome.storage.local.get('config')).config);
  check('settings persist after browser restart', persisted.mode === 'balanced' && persisted.keywords.added.some((a) => a.text === 'Persist Me'), persisted.mode);
  const p2 = await ctx2.newPage();
  await p2.goto('https://www.youtube.com/');
  await sleep(500);
  await p2.evaluate(() => { document.getElementById('page').innerHTML = '<ytd-video-renderer data-t="x"><h3><a id="video-title">Persist Me now</a></h3></ytd-video-renderer>'; });
  await sleep(500);
  const afterRestart = await p2.evaluate(() => document.querySelector('[data-t="x"]').getAttribute('data-gta6ss'));
  check('after restart the saved settings are applied to YouTube', afterRestart === 'hidden', afterRestart);
  await ctx2.close();

  const realErrors = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  check('no JavaScript errors on the YouTube page', realErrors.length === 0, realErrors);

  console.log(`\n${passed} checks passed, ${failed.length} failed`);
  if (failed.length) { console.log('FAILED:\n - ' + failed.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
