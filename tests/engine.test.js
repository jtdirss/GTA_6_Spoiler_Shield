/*
 * Engine unit tests. Run with:  node tests/engine.test.js
 * No dependencies. Exits with code 1 if any check fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['data/keywords.js', 'shared/config.js', 'content/filtering-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const NS = ctx.GTA6Shield;

function matcherFor(mode, tweak) {
  const cfg = NS.Config.defaultConfig();
  cfg.mode = mode;
  if (tweak) tweak(cfg);
  return NS.Engine.fromConfig(cfg);
}

let pass = 0;
const failures = [];
function expect(label, matcher, title, shouldBlock) {
  const r = matcher.evaluate(title);
  if (r.blocked === shouldBlock) pass++;
  else failures.push(`${label}: "${title}" expected ${shouldBlock ? 'BLOCK' : 'ALLOW'} but got ${r.blocked ? 'BLOCK (' + r.keyword + ' / ' + r.rule + ')' : 'ALLOW'}`);
}

const balanced = matcherFor('balanced');
const strict = matcherFor('strict');

/* ---------------------------- must block (both) ---------------------------- */
const BLOCK_BOTH = [
  // examples straight from the brief
  'GTA 6 Gameplay', 'GTA VI Ending Explained', 'Grand Theft Auto 6 Full Story', "Lucia's Secret",
  'Vice City Map Revealed', 'Every GTA 6 Mission', "Jason's Death Explained",
  // identifiers and formatting variants
  'GTA6 trailer breakdown', 'gta-6 leaks', 'GTA_6 news today', 'GTAVI release', 'GTA-VI map', 'gta vi',
  'Grand Theft Auto: VI trailer', 'Grand Theft Auto Six', 'GRAND THEFT AUTO 6!!!', 'GTA 6’s biggest secret',
  '#GTA6 #Shorts', 'GTA V1 leaked', 'GTA Vl footage', 'Is this the next GTA?', 'Next Grand Theft Auto is here',
  // Unicode / fancy text
  '𝗚𝗧𝗔 𝟲 𝗧𝗿𝗮𝗶𝗹𝗲𝗿', 'ＧＴＡ６ ＬＥＡＫＳ', 'GTA Ⅵ gameplay',
  // GTA V and others are blocked by design (standalone GTA)
  'GTA 5 funny moments', 'GTA Online heist guide',
  // characters
  'Jason Duval explained', 'Lucia Caminos backstory', 'Lucia and Jason', 'Cal Hampton', 'Brian Heder',
  'Boobie Ike', "Dre'Quan Priest", 'DreQuan Priest', 'Dre’Quan Priest finally revealed', 'Raul Bautista',
  'Real Dimez and Bae-Luxe', 'Baeluxe', 'DWNPLY', "Jason's Story", "Lucia's Story", 'What Happened to Jason?',
  'Jason Explained', 'Lucia Explained',
  // locations
  'Vice City secrets', 'Leonida Keys tour', 'Port Gellhorn', 'Mount Kalaga National Park', 'Mt. Kalaga hike',
  'Grassrivers swamp', 'Ambrosia', 'Leonida Map comparison',
  // name + spoiler-ish word (Balanced context rule)
  "Jason's Death Explained", 'Brian betrayal', 'Raul final mission', 'Cal dies', 'What happened to Roxy',
  'Jason and Cal', 'Rockstar leaks new game', 'Rockstar Games announcement of next game'
];
for (const t of BLOCK_BOTH) { expect('balanced', balanced, t, true); expect('strict', strict, t, true); }

/* ---------------------------- must allow (both) ---------------------------- */
const ALLOW_BOTH = [
  'My Great Adventure', 'General gaming news roundup', 'Unrelated gameplay videos', 'Cooking pasta in 10 minutes',
  'Minecraft building tutorial', 'Python programming for beginners', 'Beautiful sunset timelapse',
  'Brianna Smith vlog', 'Jasonville travel diary', 'Callum plays chess', 'Bigtalk podcast episode 12',
  'Vegan ambrosial dessert tips', 'Rockstar Games Launcher not opening fix', 'Red Dead Redemption 2 Rockstar Games Launcher',
  'Elden Ring boss guide', 'Top 10 movie trailers this week', 'Learning guitar chords for beginners',
  'Daily vlog: a day in Tokyo', 'iPhone review after one year', 'How to fix a leaking tap',
  'Grand piano concerto in D', 'Grand Canyon sunrise hike'
];
for (const t of ALLOW_BOTH) { expect('balanced', balanced, t, false); expect('strict', strict, t, false); }

/* --------------------- Balanced allows, Strict blocks ---------------------- */
const STRICT_ONLY = [
  'Brian Cox on black holes', 'Jason Statham interview', 'Raul Gonzalez highlights', 'Cal Newport on deep work',
  'Roxy Music live in 1975', 'Lori Loughlin interview',
  'G T A 6 Trailer', 'G.T.A. VI leaks', 'Best Game Endings Ever', 'Hollow Knight final boss ending',
  'Rockstar trailer reaction'
];
for (const t of STRICT_ONLY) { expect('balanced', balanced, t, false); expect('strict', strict, t, true); }

/* ------------- Balanced and Strict both allow plain generic titles ----------- */
const GENERIC_ALLOWED_IN_BALANCED = ['Elden Ring ending explained', 'Best movie endings', 'Final boss guide'];
for (const t of GENERIC_ALLOWED_IN_BALANCED) expect('balanced', balanced, t, false);
expect('strict', strict, 'Red Dead Redemption 2 ending explained', false);
expect('strict', strict, 'Movie ending explained', false);

/* ------------------------------ Custom mode ------------------------------- */
{
  const noGta = matcherFor('custom', (c) => {
    c.keywords.disabled.push('identifiers:gta');
  });
  expect('custom-no-bare-gta', noGta, 'GTA 5 funny moments', false);
  expect('custom-no-bare-gta', noGta, 'GTA 6 Gameplay', true);

  const noLoc = matcherFor('custom', (c) => { c.custom.categories.locations = false; });
  expect('custom-no-locations', noLoc, 'Port Gellhorn tour', false);
  expect('custom-no-locations', noLoc, 'Lucia secrets', true);

  const low = matcherFor('custom', (c) => { c.custom.sensitivity = 'low'; });
  expect('custom-low', low, "Jason's Death Explained", false);   // name needs context; low only allows name+generic phrase
  expect('custom-low', low, 'Jason and Cal', true);
  expect('custom-low', low, 'GTA 6', true);

  const high = matcherFor('custom', (c) => { c.custom.sensitivity = 'high'; });
  expect('custom-high', high, 'Brian Cox on black holes', true);

  const custom = matcherFor('custom', (c) => {
    c.keywords.added.push({ id: 'custom:test1', category: 'custom', text: 'Franklin Clinton', aliases: ['Franklin'], kind: 'direct' });
  });
  expect('custom-added', custom, 'Franklin Clinton returns', true);
  expect('custom-added', custom, 'franklin', true);

  const deleted = matcherFor('balanced', (c) => { c.keywords.deleted.push('locations:ambrosia'); });
  expect('deleted-keyword', deleted, 'Ambrosia', false);

  const edited = matcherFor('balanced', (c) => { c.keywords.edited['locations:ambrosia'] = { text: 'Ambrosia Falls', aliases: [], kind: 'direct' }; });
  expect('edited-keyword', edited, 'Ambrosia Falls', true);
  expect('edited-keyword', edited, 'Ambrosia recipe', false);

  const disabledCombo = matcherFor('balanced', (c) => { c.keywords.disabled.push('combo:rockstar-news'); });
  expect('disabled-combo', disabledCombo, 'Rockstar leaks new game', false);
}

/* ------------------------- normalisation sanity ---------------------------- */
const N = NS.Engine.normalize;
const eq = (a, b) => (a === b ? pass++ : failures.push(`normalize: expected "${b}" got "${a}"`));
eq(N('GTA-6'), 'gta 6');
eq(N('GTA_VI'), 'gta vi');
eq(N('GTA6'), 'gta 6');
eq(N('GTAVI'), 'gta vi');
eq(N("Lucia’s Secret!!"), 'lucia secret');
eq(N("Dre'Quan Priest"), 'drequan priest');
eq(N('𝗚𝗧𝗔 𝟲'), 'gta 6');
eq(N('Café   “Déjà vu”'), 'cafe deja vu');
eq(N(null), '');

/* ---------------------------- sanitiser safety ----------------------------- */
{
  const bad = NS.Config.sanitize({
    mode: 'nonsense', enabled: 'yes',
    keywords: { disabled: ['__proto__', 'ok:id', 5], edited: { '__proto__': { text: 'x' }, 'a:b': { text: '' } }, added: [{ text: '  <b>x</b>  ', kind: 'weird' }, null, 7] },
    ui: { placeholder: 'true' }
  });
  eq(bad.mode, 'strict');
  eq(bad.keywords.disabled.join(','), 'ok:id');
  eq(Object.keys(bad.keywords.edited).length, 0);
  eq(bad.keywords.added.length, 1);
  eq(bad.keywords.added[0].kind, 'direct');
  eq(bad.ui.placeholder, false);
  let threw = false;
  try { NS.Config.parseImport('not json'); } catch (e) { threw = true; }
  eq(threw, true);
}

/* ------------------------------ performance -------------------------------- */
{
  const titles = [];
  for (let i = 0; i < 20000; i++) titles.push(`Random video number ${i} about cooking, travel and music ${i % 97}`);
  const t0 = process.hrtime.bigint();
  for (const t of titles) strict.evaluate(t);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`Perf: 20,000 uncached Strict evaluations in ${ms.toFixed(0)} ms (${(ms / 20).toFixed(3)} ms per 1,000)`);
  if (ms > 4000) failures.push(`performance too slow: ${ms} ms`);
  else pass++;
}

console.log(`Active patterns (Strict): ${strict.patternCount}`);
console.log(`${pass} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
