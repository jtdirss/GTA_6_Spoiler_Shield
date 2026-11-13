(function () {
  'use strict';
  const { Config } = self.GTA6Shield;
  const $ = (id) => document.getElementById(id);

  const MODE_NAMES = { balanced: 'Balanced', strict: 'Strict', custom: 'Custom' };
  const MODE_HELP = {
    balanced: 'Blocks every GTA identifier, location and unique character name. Common names like Jason or Brian need spoiler-style context.',
    strict: 'Maximum protection. Also blocks common names on their own and more generic phrases, so a few unrelated videos may be hidden.',
    custom: 'Uses the categories and sensitivity you set in Settings.'
  };

  let config = Config.defaultConfig();
  let tab = { state: 'checking' };
  let sessionCount = 0;

  async function readSession() {
    try {
      const r = await chrome.storage.session.get(Config.SESSION_KEY);
      return (r[Config.SESSION_KEY] && r[Config.SESSION_KEY].count) || 0;
    } catch (e) {
      return 0;
    }
  }

  /** Ask the active tab's content script how it is doing. Fails quietly on non-YouTube tabs. */
  async function probeTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0] || tabs[0].id == null) return { state: 'none' };
      const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GTA6SS_GET_STATUS' });
      return res && res.ok ? Object.assign({ state: 'ok' }, res) : { state: 'none' };
    } catch (e) {
      return { state: 'none' };
    }
  }

  function render() {
    $('master').checked = config.enabled;
    $('statusText').textContent = config.enabled ? MODE_NAMES[config.mode] + ' mode' : 'Filtering is off';

    const pill = $('statusPill');
    const text = $('pillText');
    if (!config.enabled) {
      pill.dataset.state = 'off';
      text.textContent = 'Filtering is off. Nothing is being hidden.';
    } else if (tab.state === 'ok' && tab.running) {
      pill.dataset.state = 'active';
      text.textContent = 'Filtering is active on this page';
    } else if (tab.state === 'none') {
      pill.dataset.state = 'warn';
      text.textContent = 'On: open or refresh a YouTube tab to filter it';
    } else {
      pill.dataset.state = 'idle';
      text.textContent = 'Checking this tab…';
    }

    document.querySelectorAll('.modes button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.mode === config.mode));
    });
    $('modeHelp').textContent = MODE_HELP[config.mode];

    $('statSession').textContent = String(sessionCount);
    $('statTab').textContent = tab.state === 'ok' && config.enabled ? String(tab.hidden) : '–';
    $('statKeywords').textContent = String(Config.countActive(config));
  }

  async function refreshTab() {
    tab = await probeTab();
    render();
  }

  async function init() {
    config = await Config.load();
    sessionCount = await readSession();
    render();
    refreshTab();

    $('master').addEventListener('change', async (e) => {
      const on = e.target.checked;
      config = await Config.update((c) => { c.enabled = on; });
      render();
      setTimeout(refreshTab, 350); // give the page a moment to apply the change
    });

    document.querySelectorAll('.modes button').forEach((b) => {
      b.addEventListener('click', async () => {
        const mode = b.dataset.mode;
        config = await Config.update((c) => { c.mode = mode; });
        render();
        setTimeout(refreshTab, 350);
      });
    });

    $('openSettings').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes[Config.CONFIG_KEY]) {
        config = Config.sanitize(changes[Config.CONFIG_KEY].newValue);
        render();
      } else if (area === 'session' && changes[Config.SESSION_KEY]) {
        sessionCount = await readSession();
        render();
      }
    });

    setInterval(refreshTab, 1500); // live "hidden on this page" count while the popup is open
  }

  init();
})();
