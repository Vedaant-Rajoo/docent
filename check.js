// Self-check for settings, the extension toggle, and native panel ownership:
//   node check.js
// Uses Node's stdlib and a stub DOM; it does not replace visual checks against YouTube.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const node = () => ({ dataset: {}, children: [], append(...children) { this.children.push(...children); } });
const context = vm.createContext({
  document: { createElement: node, createElementNS: node, addEventListener() {}, dispatchEvent() {} },
  Event,
  addEventListener() {},
  MutationObserver: class { observe() {} },
});
const { subscriptions } = vm.runInContext(`${fs.readFileSync(`${__dirname}/docent.js`, 'utf8')}\n({ subscriptions })`, context);

const channel = (browseId, name, presentationStyle = 'GUIDE_ENTRY_PRESENTATION_STYLE_NONE') => ({ guideEntryRenderer: {
  navigationEndpoint: { browseEndpoint: { browseId } },
  thumbnail: { thumbnails: [{ url: `https://yt3.ggpht.com/${browseId}` }] },
  formattedTitle: { simpleText: name },
  presentationStyle,
} });
const guide = { items: [
  { guideSectionRenderer: { items: [channel('UCyou', 'Your channel')] } },
  { guideSubscriptionsSectionRenderer: { items: [
    channel('UCa', 'A', 'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT'),
    { guideCollapsibleEntryRenderer: { expandableItems: [
      channel('UCb', 'B'),
      { guideEntryRenderer: { navigationEndpoint: { browseEndpoint: { browseId: 'FEchannels' } }, formattedTitle: { simpleText: 'All subscriptions' } } },
    ] } },
  ] } },
] };

// Array.from copies the result out of the vm's realm, whose Array prototype deepStrictEqual rejects.
const links = Array.from(subscriptions(guide), link => [link.title, link.href, link.className, link.children[0].src]);
assert.deepStrictEqual(links, [
  ['A', '/channel/UCa', 'docent-icon docent-new', 'https://yt3.ggpht.com/UCa'],
  ['B', '/channel/UCb', 'docent-icon', 'https://yt3.ggpht.com/UCb'],
]);
assert.strictEqual(subscriptions(null).length, 0);

const signal = () => {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), fire: (...args) => listeners.forEach(listener => listener(...args)) };
};

async function checkSettings() {
  const values = {};
  const writes = [];
  const onChanged = signal();
  const local = {
    get: async defaults => Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, key in values ? values[key] : value])),
    set: async changes => {
      const changed = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, { oldValue: values[key], newValue: value }]));
      Object.assign(values, changes);
      writes.push(changes);
      onChanged.fire(changed, 'local');
    },
  };
  const badge = {};
  let optionsOpened = 0;
  const chrome = {
    storage: { local, onChanged },
    action: {
      onClicked: signal(),
      setTitle: async ({ title }) => { badge.title = title; },
      setBadgeText: async ({ text }) => { badge.text = text; },
      setBadgeBackgroundColor: async () => {},
    },
    runtime: {
      id: 'docent-test', onInstalled: signal(), onStartup: signal(), onMessage: signal(),
      openOptionsPage: async () => { optionsOpened++; },
      sendMessage: async message => { chrome.runtime.onMessage.fire(message, { id: chrome.runtime.id }); },
    },
  };
  const background = vm.createContext({ chrome, console });
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, 'utf8'), background);
  chrome.runtime.onInstalled.fire();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(badge.title, 'Disable Docent');
  assert.strictEqual(badge.text, '');

  // A click turns off globally. Two rapid clicks must both count, not read the same stale value.
  chrome.action.onClicked.fire();
  await vm.runInContext('toggles', background);
  assert.strictEqual(values.enabled, false);
  assert.strictEqual(badge.text, 'OFF');
  chrome.action.onClicked.fire();
  chrome.action.onClicked.fire();
  await vm.runInContext('toggles', background);
  assert.deepStrictEqual(writes.map(write => write.enabled), [false, true, false]);

  const document = new EventTarget();
  const received = [];
  document.addEventListener('docent-settings', event => received.push(JSON.parse(event.detail)));
  vm.runInNewContext(fs.readFileSync(`${__dirname}/bridge.js`, 'utf8'), { chrome, document, CustomEvent, console });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(received.at(-1), { enabled: false, autoScroll: true });
  await local.set({ enabled: true, panel: 'chat', autoScroll: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(received.at(-1), { enabled: true, autoScroll: false }, 'legacy panel preferences must not reach the page');
  const count = received.length;
  document.dispatchEvent(new Event('docent-ready'));
  assert.strictEqual(received.length, count + 1, 'main-world startup must receive already-loaded settings');
  document.dispatchEvent(new Event('docent-open-settings'));
  assert.strictEqual(optionsOpened, 1);
  chrome.runtime.onMessage.fire({ type: 'open-options' }, { id: 'another-extension' });
  assert.strictEqual(optionsOpened, 1, 'reject messages from other extensions');

  // Settings reads may finish out of order. The old read must not undo a later toggle.
  const pending = [];
  const racingDocument = new EventTarget();
  const racingChanges = signal();
  const racing = [];
  racingDocument.addEventListener('docent-settings', event => racing.push(JSON.parse(event.detail)));
  vm.runInNewContext(fs.readFileSync(`${__dirname}/bridge.js`, 'utf8'), {
    chrome: { ...chrome, storage: { local: { get: () => new Promise(resolve => pending.push(resolve)) }, onChanged: racingChanges } },
    document: racingDocument, CustomEvent, console,
  });
  racingChanges.fire({ enabled: { newValue: false } }, 'local');
  pending[1]({ enabled: false, panel: 'transcript', autoScroll: true });
  await new Promise(resolve => setImmediate(resolve));
  pending[0]({ enabled: true, panel: 'transcript', autoScroll: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(racing.length, 1);
  assert.strictEqual(racing[0].enabled, false);

  const attributes = new Set(['dark', 'data-docent', 'data-docent-watch']);
  let removed = 0;
  let resized = 0;
  const page = new EventTarget();
  page.documentElement = {
    dataset: { docentPanel: 'transcript' }, hasAttribute: key => attributes.has(key),
    toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key),
  };
  page.querySelectorAll = selector => selector === '[data-docent-node]' ? [{ remove() { removed++; } }] : [];
  const observers = [], frames = [];
  const main = vm.createContext({
    document: page, Event, CustomEvent, location: { pathname: '/watch' }, clearTimeout,
    addEventListener() {}, dispatchEvent() { resized++; },
    requestAnimationFrame: callback => frames.push(callback),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() { this.connected = true; } disconnect() { this.connected = false; } },
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/docent.js`, 'utf8'), main);
  for (const detail of ['broken JSON', 'null', JSON.stringify({ enabled: 'false', autoScroll: true }), JSON.stringify({ enabled: false, autoScroll: 'true' }), JSON.stringify({ enabled: true })]) {
    page.dispatchEvent(new CustomEvent('docent-settings', { detail }));
  }
  assert.strictEqual(removed, 0, 'malformed settings must not change the page');
  page.dispatchEvent(new CustomEvent('docent-settings', { detail: JSON.stringify({ enabled: false, panel: 'transcript', autoScroll: true }) }));
  assert.strictEqual(attributes.has('data-docent'), false);
  assert.strictEqual(attributes.has('data-docent-watch'), false);
  assert.strictEqual(attributes.has('data-docent-home'), false);
  assert.strictEqual(page.documentElement.dataset.docentPanel, undefined);
  assert.strictEqual(removed, 1);
  assert.strictEqual(resized, 1);

  // Home has no player or watch metadata. Repeated toggles must create exactly one shell.
  const created = [];
  page.createElement = tag => {
    const element = node();
    element.tagName = tag.toUpperCase();
    element.setAttribute = () => {};
    element.isConnected = true;
    element.checkVisibility = () => element.isConnected;
    element.focus = () => { page.activeElement = element; };
    element.remove = () => { element.isConnected = false; created.splice(created.indexOf(element), 1); };
    element.insertBefore = (child, before) => element.children.splice(element.children.indexOf(before), 0, child);
    created.push(element);
    return element;
  };
  page.createElementNS = (_, tag) => page.createElement(tag);
  page.body = node();
  page.querySelector = selector => selector === 'ytd-masthead' ? {} : null;
  page.querySelectorAll = selector => selector === '[data-docent-node]' ? created.filter(element => 'docentNode' in element.dataset) : [];
  main.location.pathname = '/';
  const setPage = enabled => page.dispatchEvent(new CustomEvent('docent-settings', { detail: JSON.stringify({ enabled, panel: 'transcript', autoScroll: true }) }));
  setPage(true);
  assert.strictEqual(attributes.has('data-docent'), true);
  assert.strictEqual(attributes.has('data-docent-watch'), false);
  assert.strictEqual(attributes.has('data-docent-home'), true);
  assert.strictEqual(created.filter(element => element.id === 'docent-rail').length, 1);
  assert.strictEqual(created.some(element => element.id === 'docent-recommended'), false, 'recommendations belong to watch pages');
  setPage(true);
  assert.strictEqual(created.filter(element => element.id === 'docent-rail').length, 1);
  setPage(false);
  assert.strictEqual(created.filter(element => 'docentNode' in element.dataset).length, 0);
  assert.strictEqual(attributes.has('data-docent-home'), false);

  // Native actions own the shared column, including panels Docent has never heard of.
  const panels = { children: [], querySelectorAll: () => panels.children.filter(panel => panel.hasAttribute('data-docent-native')) };
  const makePanel = id => {
    const attributes = new Map([['target-id', id], ['visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN']]);
    const panel = {
      parentElement: panels, isConnected: true, draft: '', scrollTop: 0,
      getAttribute: key => attributes.get(key) ?? null, hasAttribute: key => attributes.has(key),
      setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
      closest: () => panel, querySelector: () => null, contains: element => element === panel,
    };
    panels.children.push(panel);
    return panel;
  };
  const chapters = makePanel('engagement-panel-macro-markers-description-chapters');
  const comments = makePanel('engagement-panel-comments-section');
  const ask = makePanel('PAyouchat');
  const transcript = makePanel('PAmodern_transcript_view');
  const other = makePanel('unrecognized-native-panel');
  const ads = makePanel('engagement-panel-ads');
  ads.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  const watch = new EventTarget();
  let videoId = 'native-panel-test', chat, playlist, theater = false, menuClosed = 0;
  const menu = {};
  const trigger = {
    isConnected: true, checkVisibility: () => true, focus: () => { page.activeElement = trigger; },
    closest: selector => selector === 'ytd-menu-renderer' ? menu
      : selector === 'yt-button-shape, yt-icon-button' ? { parentElement: menu }
      : selector === '#secondary' ? null : trigger,
  };
  const items = {
    children: [{ id: 'native-report' }], append: (...nodes) => items.children.push(...nodes),
    querySelector: selector => items.children.find(item => '#' + item.id === selector),
  };
  const related = {
    children: [], prepend: child => related.children.unshift(child),
    querySelector: selector => selector === '#docent-related-header' ? related.children[0]
      : selector === 'h2' ? related.children[0]?.children[0] : null,
  };
  const popup = {
    closest: selector => selector === 'ytd-menu-popup-renderer' ? popup : { close: () => { menuClosed++; } },
    querySelector: selector => selector === '#items' ? items : null,
  };
  watch.getAttribute = key => key === 'video-id' ? videoId : null;
  watch.hasAttribute = key => key === 'theater' && theater;
  watch.contains = element => element === trigger;
  watch.querySelector = selector => {
    if (selector === '#panels') return panels;
    if (selector === '#secondary') return { contains: element => related.children.some(header => header.children.includes(element)) };
    if (selector === '#chat-container ytd-live-chat-frame:not(:has(ytd-message-renderer))') return chat;
    if (selector === '#playlist:not([hidden])') return playlist;
    if (selector === 'ytd-watch-metadata #actions ytd-menu-renderer') return menu;
    if (selector === '#related') return related;
    return null;
  };
  watch.querySelectorAll = () => panels.children.filter(panel => panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  page.querySelector = selector => {
    if (selector === 'ytd-masthead') return {};
    if (selector === 'ytd-watch-flexy') return watch;
    if (selector === 'ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]') return theater ? watch : null;
    if (selector === '.ytp-size-button') return { click: () => { theater = !theater; } };
    return null;
  };
  page.querySelectorAll = selector => selector === '[data-docent-node]' ? created.filter(element => 'docentNode' in element.dataset)
    : selector === '#panels ytd-engagement-panel-section-list-renderer[data-docent-native]' ? panels.querySelectorAll() : [];
  main.URLSearchParams = URLSearchParams;
  main.location.pathname = '/watch';
  main.location.search = `?v=${videoId}`;
  const notify = (panel, visibility = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') => {
    panel.setAttribute('visibility', visibility);
    const event = new CustomEvent('yt-action', { detail: { actionName: 'yt-engagement-panel-visible-changed', args: [panel.data, visibility] } });
    Object.defineProperty(event, 'target', { value: panel });
    watch.dispatchEvent(event);
  };
  const openMenu = () => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: trigger });
    page.dispatchEvent(event);
    const opened = new CustomEvent('yt-popup-opened', { detail: popup });
    Object.defineProperty(opened, 'target', { value: popup });
    page.dispatchEvent(opened);
  };
  page.activeElement = trigger;
  setPage(true);
  const panelObserver = observers.at(-1);
  const recommended = created.find(element => element.id === 'docent-recommended');
  assert.strictEqual(recommended.ariaLabel, 'Recommended videos');
  assert.strictEqual(recommended.ariaControls, 'related');
  assert.strictEqual(recommended.ariaPressed, 'false');
  assert.strictEqual(created.filter(element => element.id === 'docent-recommended').length, 1);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'ordinary videos start without a column, ignoring legacy defaults and ads');
  assert.strictEqual(created.some(element => ['docent-panels', 'docent-search', 'docent-captions', 'docent-ask', 'docent-chapters', 'docent-transcript', 'docent-notes'].includes(element.id)), false);
  notify(ads);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'passive ad panels must not open the column');
  theater = true;
  notify(chapters);
  assert.strictEqual(theater, false, 'an explicit native panel action leaves theater mode');
  assert.deepStrictEqual(panels.querySelectorAll(), [chapters]);
  ask.draft = 'Keep this question';
  transcript.scrollTop = 240;
  notify(ask);
  notify(transcript);
  assert.deepStrictEqual(panels.querySelectorAll(), [transcript], 'Ask and transcript cannot occupy the column together');
  assert.strictEqual(ask.draft, 'Keep this question');
  assert.strictEqual(transcript.scrollTop, 240);
  notify(other);
  assert.deepStrictEqual(panels.querySelectorAll(), [other], 'unknown and lazy native panels need no new control');
  other.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  panelObserver.callback();
  assert.deepStrictEqual(panels.querySelectorAll(), [other], 'native expansion can precede a delayed visibility update');
  other.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  watch.dispatchEvent(new CustomEvent('yt-action', { detail: { actionName: 'yt-engagement-panel-visible-changed', args: [] } }));
  assert.deepStrictEqual(panels.querySelectorAll(), [other], 'malformed events cannot change ownership');
  page.activeElement = other;
  notify(other, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'closing does not reopen an old panel');
  assert.strictEqual(page.activeElement, trigger, 'closing restores the native entry point focus');

  notify(chapters);
  chapters.showPanel = () => notify(chapters);
  page.fullscreenElement = {};
  notify(chapters, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  assert.deepStrictEqual(panels.querySelectorAll(), [chapters], 'fullscreen suspends the current component');
  page.fullscreenElement = null;
  page.dispatchEvent(new Event('fullscreenchange'));
  frames.shift()();
  assert.strictEqual(chapters.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED', 'exit restores through the native panel API');
  notify(chapters, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

  openMenu();
  openMenu();
  assert.strictEqual(items.children.some(item => item.id === 'docent-open-related'), false, 'recommendations have one header entry point');
  assert.strictEqual(items.children[0].id, 'native-report', 'native menu actions remain intact');
  recommended.onclick();
  assert.strictEqual(menuClosed, 0);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'related');
  assert.strictEqual(recommended.ariaPressed, 'true');
  assert.strictEqual(panels.querySelectorAll().length, 0);
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'related', 'native mutations preserve the chosen recommendations');
  recommended.onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'the glyph toggles recommendations closed');
  assert.strictEqual(recommended.ariaPressed, 'false');
  assert.strictEqual(page.activeElement, recommended);
  theater = true;
  recommended.onclick();
  assert.strictEqual(theater, false, 'opening recommendations leaves theater mode');
  notify(ask);
  assert.strictEqual(recommended.ariaPressed, 'false', 'native panels clear the recommendations state');
  assert.deepStrictEqual(panels.querySelectorAll(), [ask]);
  recommended.onclick();
  assert.strictEqual(panels.querySelectorAll().length, 0, 'recommendations replace the visible native panel');
  assert.strictEqual(related.children.length, 1, 'reopening recommendations must not duplicate the header');
  related.children[0].children[1].onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');
  assert.strictEqual(recommended.ariaPressed, 'false');
  assert.strictEqual(page.activeElement, recommended, 'closing recommendations restores the glyph focus');

  // Autoscroll follows the selected native transcript, and settings changes preserve the panel.
  let scrolled = 0;
  const list = { scrollHeight: 600, clientHeight: 200, getBoundingClientRect: () => ({ top: 0, bottom: 200, height: 200 }), scrollBy: ({ top }) => { scrolled += top; } };
  const row = { parentElement: list, checkVisibility: () => true, getBoundingClientRect: () => ({ top: 300, bottom: 320, height: 20 }) };
  transcript.querySelector = selector => selector.startsWith('transcript-segment') ? row : selector.startsWith('.ytwTranscript') ? row : null;
  transcript.matches = () => false;
  main.getComputedStyle = () => ({ overflowY: 'auto' });
  notify(transcript);
  page.dispatchEvent(new Event('timeupdate'));
  assert.strictEqual(scrolled, 210);
  const shell = created.find(element => element.id === 'docent-rail');
  page.dispatchEvent(new CustomEvent('docent-settings', { detail: JSON.stringify({ enabled: true, autoScroll: false }) }));
  assert.strictEqual(created.find(element => element.id === 'docent-rail'), shell, 'autoscroll settings must not rebuild the view');
  page.dispatchEvent(new Event('timeupdate'));
  assert.strictEqual(scrolled, 210);
  notify(transcript, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

  let collapsed = true;
  chat = { hasAttribute: () => collapsed, querySelector: () => ({ click: () => { collapsed = false; }, focus() {} }) };
  playlist = { querySelector: () => null };
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist', 'a collapsed chat must not hide an active playlist');
  openMenu();
  items.querySelector('#docent-open-chat').onclick();
  assert.strictEqual(collapsed, false);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat');
  notify(comments);
  notify(comments, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat', 'closing returns to intentional live context');
  items.querySelector('#docent-open-playlist').onclick();
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist', 'chat updates must not override an explicit playlist choice');
  notify(comments);
  notify(comments, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist', 'closing preserves the chosen queue context');
  chat = undefined;
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist');
  playlist = undefined;
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');

  notify(chapters);
  chapters.isConnected = false;
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'removing a panel cannot leave an empty column');
  chapters.isConnected = true;
  for (const panel of panels.children) panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  videoId = 'next-video';
  main.location.search = `?v=${videoId}`;
  page.dispatchEvent(new Event('yt-navigate-finish'));
  assert.strictEqual(panelObserver.connected, false);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');
  assert.strictEqual(panels.querySelectorAll().length, 0);
  notify(chapters);
  setPage(false);
  assert.strictEqual(chapters.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED', 'disabling must not rewrite native visibility');
  notify(other);
  assert.strictEqual(page.documentElement.dataset.docentPanel, undefined, 'disabled layout ignores native events');
  assert.strictEqual(panels.querySelectorAll().length, 0);
  assert.strictEqual(observers.at(-1).connected, false);

  // The options page saves changes and follows a toggle made from another extension surface.
  const inputs = Object.fromEntries(Object.entries({ enabled: 'checkbox', autoScroll: 'checkbox' }).map(([id, type]) => [id, { id, type }]));
  let change;
  inputs.controls = { addEventListener: (_, listener) => { change = listener; } };
  inputs.preferences = {};
  inputs.status = { toggleAttribute() {}, removeAttribute() {} };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/settings.js`, 'utf8'), { chrome, document: { getElementById: id => inputs[id] }, console });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(inputs.enabled.checked, true);
  assert.strictEqual(inputs.autoScroll.checked, false);
  inputs.autoScroll.checked = true;
  await change({ target: inputs.autoScroll });
  assert.strictEqual(values.autoScroll, true);
  assert.strictEqual(inputs.status.textContent, 'Saved');
  await local.set({ enabled: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(inputs.enabled.checked, false);
  assert.strictEqual(inputs.preferences.disabled, true);
  console.log('ok: subscriptions, toolbar toggle, settings page and bridge, stale reads, validation, home lifecycle, native panels, navigation, disable cleanup');
}
checkSettings().catch(error => { console.error(error); process.exitCode = 1; });
