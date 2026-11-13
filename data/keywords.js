/*
 * GTA 6 Spoiler Shield - keyword database
 * ---------------------------------------------------------------------------
 * This file is DATA ONLY. You can add, remove or change keywords here without
 * touching the filtering engine. (You can also do all of this from the
 * Settings page without editing any code.)
 *
 * Each entry is a tuple:  [ text, kind, aliases? ]
 *
 *   kind        meaning
 *   ----------  ----------------------------------------------------------
 *   direct      Always blocks the video (in every mode).
 *   strict      Blocks in Strict mode. In Balanced it behaves like "context".
 *   name        Common first name (Jason, Brian...). Strict: always blocks.
 *               Balanced: only blocks next to a spoiler-ish word (see the
 *               "Name-context words" category) or another GTA VI term.
 *   context     Generic phrase ("Ending Explained"). Never blocks on its own
 *               in Balanced. Strict: blocks when a game-ish word is also in
 *               the title, or when two different generic phrases appear.
 *   soft        Context helper. Never blocks anything by itself; it only
 *               makes "context" phrases count in Strict mode.
 *   namectx     Name-context word. Never blocks by itself; it lets "name"
 *               entries match in Balanced mode.
 *
 * Text rules
 *   - Matching is case-insensitive and punctuation-insensitive:
 *     "GTA-6", "GTA_6", "gta 6", "GTA6" are all the same thing.
 *   - Possessives are removed: "Lucia's" == "Lucia".
 *   - Whole words only: "Brian" never matches "Brianna".
 *   - A trailing * means "starts with":  "leak*" matches leak, leaks, leaked.
 *   - Aliases are extra spellings that normalisation alone cannot cover.
 */
(function (root) {
  'use strict';
  const NS = (root.GTA6Shield = root.GTA6Shield || {});

  const KINDS = {
    direct:  { label: 'Always block',        help: 'Blocks the video on its own in every mode.' },
    strict:  { label: 'Strict: always',      help: 'Blocks on its own in Strict mode. Needs GTA VI context in Balanced mode.' },
    name:    { label: 'Common name',         help: 'Strict: always blocks. Balanced: only blocks together with a spoiler-style word or another GTA VI term.' },
    context: { label: 'Needs context',       help: 'Generic phrase. Only blocks together with GTA VI context (Strict also accepts game-related words).' },
    soft:    { label: 'Context helper',      help: 'Never blocks alone. Lets "needs context" phrases match in Strict mode.' },
    namectx: { label: 'Name-context word',   help: 'Never blocks alone. Lets "common name" entries match in Balanced mode.' }
  };

  // Tiny helpers so the tables below stay readable.
  const D = (t, a) => [t, 'direct', a || []];
  const S = (t, a) => [t, 'strict', a || []];
  const N = (t, a) => [t, 'name', a || []];
  const C = (t, a) => [t, 'context', a || []];
  const H = (t, a) => [t, 'soft', a || []];
  const W = (t, a) => [t, 'namectx', a || []];

  const CATEGORIES = [
    {
      id: 'identifiers',
      name: 'Game identifiers',
      description: 'GTA, GTA 6, GTA VI, Grand Theft Auto and common title formats. Standalone "GTA" is blocked on purpose.',
      entries: [
        D('GTA'),
        D('GTA 6', ['GTA6', 'GTA-6', 'GTA_6', 'GTA Six', 'GTA 6th']),
        D('GTA VI', ['GTAVI', 'GTA-VI', 'GTA_VI', 'GTA Vl', 'GTA V1']),
        D('Grand Theft Auto', ['Gran Theft Auto', 'Grand Theif Auto', 'Grand Theft Autos']),
        D('Grand Theft Auto 6', ['Grand Theft Auto: 6']),
        D('Grand Theft Auto VI', ['Grand Theft Auto: VI']),
        D('Grand Theft Auto Six', ['Grand Theft Auto: Six']),
        D('GTA 6 Gameplay', ['GTA VI Gameplay']),
        D('GTA 6 Spoilers', ['GTA VI Spoilers', 'GTA 6 Spoiler']),
        D('GTA 6 Leaks', ['GTA VI Leaks']),
        D('GTA 6 News', ['GTA VI News']),
        D('GTA 6 Story', ['GTA VI Story']),
        D('GTA 6 Ending', ['GTA VI Ending']),
        D('GTA 6 Review', ['GTA VI Review']),
        D('GTA 6 Walkthrough', ['GTA VI Walkthrough']),
        D('GTA 6 Missions', ['GTA VI Missions']),
        D('GTA 6 Secrets', ['GTA VI Secrets']),
        D('GTA 6 Explained', ['GTA VI Explained'])
      ]
    },
    {
      id: 'characters',
      name: 'Characters',
      description: 'Officially revealed GTA VI characters. Common first names are only matched with context in Balanced mode.',
      entries: [
        D('Jason Duval'),
        D('Lucia Caminos'),
        D('Lucia'),
        D('Cal Hampton'),
        D('Brian Heder'),
        D('Boobie Ike'),
        D('Boobie'),
        D("Dre'Quan Priest", ['DreQuan Priest', 'Dre Quan Priest', 'Drequan']),
        D('Raul Bautista'),
        D('Real Dimez'),
        D('Bae-Luxe', ['Baeluxe']),
        D('DWNPLY'),
        N('Jason'),
        N('Brian'),
        N('Raul'),
        N('Cal'),
        N('Roxy'),
        N('Lori'),
        D("Jason's Story"),
        D("Lucia's Story"),
        D("Jason's Secret", ["Jason's Secrets"]),
        D("Lucia's Secret", ["Lucia's Secrets"]),
        D('What Happened to Jason'),
        D('What Happened to Lucia'),
        D('Jason Explained'),
        D('Lucia Explained'),
        C('All Characters Explained'),
        C('Character Deaths'),
        C('Every Character'),
        C('Character Secrets'),
        C('Character Relationships')
      ]
    },
    {
      id: 'locations',
      name: 'Locations',
      description: 'Known GTA VI locations and map-related phrases.',
      entries: [
        D('Vice City'),
        D('Leonida'),
        D('Leonida Keys'),
        D('Port Gellhorn'),
        D('Ambrosia'),
        D('Grassrivers', ['Grass Rivers']),
        D('Mount Kalaga', ['Mt Kalaga']),
        D('Mount Kalaga National Park', ['Mt Kalaga National Park']),
        D('GTA 6 Map', ['GTA VI Map']),
        D('Vice City Map'),
        D('Leonida Map'),
        C('Full Map Revealed'),
        C('Every Location'),
        C('Hidden Locations'),
        C('Secret Locations'),
        C('Map Expansion'),
        C('Map Comparison'),
        C('Map Size'),
        D('Vice City Secrets'),
        D('Leonida Secrets'),
        C('Every Location Revealed')
      ]
    },
    {
      id: 'story',
      name: 'Story and ending spoilers',
      description: 'Generic story phrases. They need GTA VI context, so "Elden Ring ending explained" is not hidden.',
      entries: [
        C('Ending'), C('Endings'), C('True Ending'), C('Secret Ending'), C('Bad Ending'),
        C('Good Ending'), C('Alternate Ending'), C('Final Mission'), C('Final Chapter'),
        C('Final Cutscene'), C('Story Explained'), C('Full Story'), C('Complete Story'),
        C('Plot Twist'), C('Biggest Twist'), C('Secret Character'), C('Hidden Character'),
        C('Character Reveal'), C('Character Death'), C('Death Scene'), C('Who Dies'),
        C('Killed'), C('Betrayal'), C('Unexpected Ending'), C('Story Details'),
        C('Story Breakdown'), C('Full Campaign'), C('Every Mission'), C('All Missions'),
        C('Mission Order'), C('Final Boss'), C('Post-Credits Scene'), C('After Credits'),
        C('Post Game'), C('All Cutscenes'), C('Full Cutscenes'), C('Story Mode')
      ]
    },
    {
      id: 'gameplay',
      name: 'Gameplay spoilers',
      description: 'Gameplay, walkthrough and secrets phrases. They need GTA VI context.',
      entries: [
        C('Full Gameplay'), C('First Gameplay'), C('New Gameplay'),
        S('Gameplay Leaked'), S('Gameplay Revealed'),
        C('First Hour'), C('First 2 Hours'), C('First 3 Hours'),
        C('Full Playthrough'), C('Complete Playthrough'), C('100% Completion'),
        C('Full Game'), C('Full Walkthrough'), C('All Missions'), C('Mission Walkthrough'),
        C('All Vehicles'), C('Every Vehicle'), C('All Weapons'), C('Every Weapon'),
        C('Character Switching'), C('Playable Characters'), C('Hidden Mechanics'),
        C('Secret Mechanics'), C('New Mechanics'), C('Gameplay Secrets'),
        C('Hidden Features'), C('Secret Features'), C('Easter Eggs'), C('All Easter Eggs'),
        C('Secret Interactions'), C('Hidden Details'), C('Things You Missed'),
        C("Things You Didn't Know"), C('All Collectibles'), C('Hidden Collectibles'),
        C('Rare Vehicles'), C('Secret Vehicles'), C('Unlockable Characters'), C('Unlockables')
      ]
    },
    {
      id: 'trailers',
      name: 'Trailers and leaks',
      description: 'Trailer breakdowns, leaks and unreleased footage.',
      entries: [
        D('GTA 6 Trailer', ['GTA VI Trailer']),
        C('Trailer 1'), C('Trailer 2'), C('Trailer 3'),
        C('Official Trailer'), C('Extended Trailer'), C('Final Trailer'),
        C('Gameplay Trailer'), C('Story Trailer'), C('Launch Trailer'),
        C('Trailer Breakdown'), C('Trailer Analysis'), C('Trailer Explained'),
        C('Hidden Trailer Details'), C('Trailer Secrets'),
        D('GTA 6 Leak', ['GTA VI Leak']),
        D('GTA 6 Leaks', ['GTA VI Leaks']),
        S('Gameplay Leak'), S('Story Leak'), S('Map Leak'), S('Character Leak'),
        S('Leaked Footage'), S('Leaked Gameplay'),
        C('Unreleased Footage'), C('Early Footage'), C('Unseen Footage'), C('Deleted Scenes'),
        S('Rockstar Announcement'), S('Rockstar Reveal'),
        D('GTA 6 Update', ['GTA VI Update'])
      ]
    },
    {
      id: 'reviews',
      name: 'Reviews and analysis',
      description: 'Review, ranking and analysis phrases. They need GTA VI context.',
      entries: [
        D('GTA 6 Review', ['GTA VI Review']),
        C('Review After Playing'), C('First Impressions'), C('Full Review'), C('Honest Review'),
        C('Ending Review'), C('Story Review'), C('Complete Analysis'), C('Story Analysis'),
        C('Character Analysis'), C('Mission Ranking'), C('Best Mission'), C('Worst Mission'),
        C('Best Character'), C('Character Ranking'), C('Final Verdict'), C('Biggest Problems'),
        C('Everything You Need to Know')
      ]
    },
    {
      id: 'other',
      name: 'Other contextual terms',
      description: 'Rockstar, RAGE and similar terms. They never block on their own, so Red Dead and GTA V-era Rockstar videos are not hidden just for mentioning Rockstar.',
      entries: [
        H('Rockstar Games'),
        H('Rockstar'),
        H('RAGE Engine'),
        S('New Rockstar Game'),
        D('Next Grand Theft Auto'),
        D('New Grand Theft Auto'),
        D('Vice City Returns'),
        D('GTA 6 Launch', ['GTA VI Launch']),
        D('GTA 6 PC', ['GTA VI PC']),
        D('GTA 6 Console', ['GTA VI Console']),
        D('GTA 6 Performance', ['GTA VI Performance']),
        D('GTA 6 Graphics', ['GTA VI Graphics']),
        D('GTA 6 Physics', ['GTA VI Physics']),
        D('GTA 6 AI', ['GTA VI AI']),
        D('GTA 6 Interiors', ['GTA VI Interiors']),
        D('GTA 6 Open World', ['GTA VI Open World'])
      ]
    },
    {
      id: 'helpers-name',
      name: 'Name-context words',
      description: 'Words that let a common first name (Jason, Brian...) match in Balanced mode, e.g. "Jason\'s Death Explained". They never block on their own.',
      entries: [
        W('Story'), W('Secret'), W('Secrets'), W('Death'), W('Deaths'), W('Dies'), W('Killed'),
        W('Ending'), W('Endings'), W('Betrayal'), W('Betrayed'), W('Twist'), W('Backstory'),
        W('Fate'), W('Mission*'), W('Cutscene*'), W('Gameplay'), W('Trailer'), W('Leak*'),
        W('Spoiler*'), W('Reveal*'), W('Voice Actor'), W('Voice Actress'), W('What Happened to'),
        W('Theory'), W('Theories')
      ]
    },
    {
      id: 'helpers-game',
      name: 'Game-context words',
      description: 'Strict mode only: a generic phrase such as "Ending" counts when one of these words also appears. They never block on their own.',
      entries: [
        H('Game'), H('Games'), H('Gaming'), H('Gameplay'), H('Playthrough'), H('Walkthrough'),
        H('Campaign'), H('Cutscene*'), H('Mission*'), H('DLC'), H('Open World'), H('Trailer'),
        H('Leak*'), H('PS5'), H('PlayStation*'), H('Xbox*'), H('Next Gen')
      ]
    },
    {
      id: 'custom',
      name: 'My keywords',
      description: 'Keywords you add yourself.',
      entries: []
    }
  ];

  /*
   * Contextual combinations: ALL groups must match (any one term per group).
   * minLevel 1 = Balanced and up, 2 = Strict only.
   */
  const COMBOS = [
    {
      id: 'combo:rockstar-news',
      label: 'Rockstar + leak / announcement / release news',
      category: 'other',
      minLevel: 1,
      groups: [
        ['Rockstar', 'Rockstar Games'],
        ['Leak*', 'Leaked', 'Insider*', 'Announcement', 'Announces', 'Announced', 'Reveal*', 'Delay*',
         'Release Date', 'Next Game', 'New Game', 'Upcoming Game']
      ]
    },
    {
      id: 'combo:rockstar-media',
      label: 'Rockstar + trailer / teaser / update / rumor',
      category: 'other',
      minLevel: 2,
      groups: [
        ['Rockstar', 'Rockstar Games'],
        ['Trailer*', 'Teaser*', 'Update*', 'News', 'Rumor*', 'Rumour*', 'Confirmed']
      ]
    },
    {
      id: 'combo:leaker-open-world',
      label: 'Leak / insider + open world / next game',
      category: 'other',
      minLevel: 2,
      groups: [
        ['Leak*', 'Leaker*', 'Insider*'],
        ['Open World', 'Next Game', 'Upcoming Game', 'Next Rockstar']
      ]
    }
  ];

  const VALID_KINDS = Object.keys(KINDS);

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9*]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x';
  }

  let cachedEntries = null;

  /** Flat list of default entries with stable ids ("characters:lucia"). */
  function getDefaultEntries() {
    if (cachedEntries) return cachedEntries;
    const out = [];
    const used = new Set();
    for (const cat of CATEGORIES) {
      for (const [text, kind, aliases] of cat.entries) {
        let id = cat.id + ':' + slug(text);
        let n = 2;
        while (used.has(id)) id = cat.id + ':' + slug(text) + '-' + n++;
        used.add(id);
        out.push({ id, category: cat.id, text, kind, aliases: aliases ? aliases.slice() : [] });
      }
    }
    cachedEntries = out;
    return out;
  }

  NS.Keywords = {
    version: 1,
    KINDS,
    VALID_KINDS,
    CATEGORIES: CATEGORIES.map(({ id, name, description }) => ({ id, name, description })),
    COMBOS,
    getDefaultEntries,
    slug
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
