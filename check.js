// Self-check for settings, the extension toggle, native panel ownership, and the player bar:
//   node check.js
// Uses Node's stdlib and a stub DOM; it does not replace visual checks against YouTube.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const node = () => ({ dataset: {}, children: [], append(...children) {
  for (const child of children) this.children.push(Object.assign(child, { parentNode: this, previousSibling: this.children.at(-1) }));
} });
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
  assert.deepStrictEqual(received.at(-1), { enabled: false, autoScroll: true, showDislike: false });
  await local.set({ enabled: true, panel: 'chat', autoScroll: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(received.at(-1), { enabled: true, autoScroll: false, showDislike: false }, 'legacy panel preferences must not reach the page');
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
    Option: class { constructor(text, value) { this.textContent = text; this.value = String(value); } get text() { return this.textContent; } },
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
  // Moves an element under a parent, as the DOM does: an element has one place at a time.
  const place = (parent, element, index = parent.children.length) => {
    const siblings = element.parentNode?.children;
    if (siblings?.includes(element)) siblings.splice(siblings.indexOf(element), 1);
    parent.children.splice(Math.min(index, parent.children.length), 0, element);
    element.parentNode = parent;
  };
  let optionWrites = 0;
  page.createElement = tag => {
    const element = node();
    element.tagName = tag.toUpperCase();
    element.setAttribute = () => {};
    element.isConnected = true;
    element.checkVisibility = () => element.isConnected;
    element.focus = () => { page.activeElement = element; };
    element.blur = () => { if (page.activeElement === element) page.activeElement = page.body; };
    element.remove = () => {
      element.isConnected = false;
      created.splice(created.indexOf(element), 1);
      const siblings = element.parentNode?.children;
      if (siblings?.includes(element)) siblings.splice(siblings.indexOf(element), 1);
    };
    element.insertBefore = (child, before) => element.children.splice(element.children.indexOf(before), 0, child);
    element.after = (...elements) => elements.forEach((next, offset) => place(element.parentNode, next, element.parentNode.children.indexOf(element) + 1 + offset));
    if (tag === 'select') {
      element.selectedIndex = -1;
      Object.defineProperties(element, {
        options: { get: () => element.children },
        value: { get: () => element.children[element.selectedIndex]?.value ?? '', set: value => { element.selectedIndex = element.children.findIndex(option => option.value === String(value)); } },
      });
      element.replaceChildren = (...options) => { element.children = options; element.selectedIndex = options.length ? 0 : -1; optionWrites++; };
    }
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
  let videoId = 'native-panel-test', dataVideoId, chatInfo, chat, playlist, theater = false, menuClosed = 0, chatCollapsed = true, chatRequests = 0;
  const cards = ['WATCH_UI_TEASER_TYPE_LIVE_CHAT', 'WATCH_UI_TEASER_TYPE_CHAPTERS'].map(teaserType => {
    const attributes = new Set();
    return {
      data: { teaserType }, hasAttribute: key => attributes.has(key),
      toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key),
      removeAttribute: key => attributes.delete(key),
    };
  });
  Object.defineProperty(watch, 'data', { get: () => ({
    currentVideoEndpoint: { watchEndpoint: { videoId: dataVideoId ?? videoId } },
    contents: { twoColumnWatchNextResults: { conversationBar: chatInfo ? { liveChatRenderer: chatInfo } : undefined } },
  }) });
  const chatFocus = { focus: () => { page.activeElement = chatFocus; } };
  const chatContainer = {
    contains: element => element === chatFocus,
    querySelector: () => chat ? chatFocus : null,
  };
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
    contains: element => related.children.some(header => header.children.includes(element)),
    querySelector: selector => selector === '#docent-related-header' ? related.children[0]
      : selector === 'h2, button, iframe' ? related.children[0]?.children[0] : null,
  };
  const popup = {
    closest: selector => selector === 'ytd-menu-popup-renderer' ? popup : { close: () => { menuClosed++; } },
    querySelector: selector => selector === '#items' ? items : null,
  };
  // YouTube's player: the right-hand controls Docent joins and the API its pickers read.
  const makePlayer = () => {
    const controls = { children: ['ytp-autonav-toggle', 'ytp-subtitles-button', 'ytp-settings-button'].map(className => ({ className })) };
    controls.contains = element => controls.children.includes(element);
    controls.insertBefore = (element, before) => place(controls, element, before ? controls.children.indexOf(before) : undefined);
    controls.querySelector = selector => controls.children.find(child => selector === `:scope > .${child.className}`) ?? null;
    const player = {
      controls, listeners: [], rate: 1, rates: [0.25, 0.5, 1, 1.5, 2], preferred: 'auto', playing: 'hd1080',
      qualities: [{ quality: 'hd2160', qualityLabel: '2160p', isPlayable: false }, { quality: 'hd1080', qualityLabel: '1080p', isPlayable: true }, { quality: 'hd720', qualityLabel: '720p', isPlayable: true }],
      querySelector: selector => selector === '.ytp-right-controls-left' ? controls : null,
      addEventListener: (type, listener) => player.listeners.push([type, listener]),
      focus() {},
      getPlaybackRate: () => player.rate, setPlaybackRate: rate => { player.rate = rate; }, getAvailablePlaybackRates: () => player.rates,
      getAvailableQualityData: () => player.qualities, getPreferredQuality: () => player.preferred, getPlaybackQuality: () => player.playing,
      getPlaybackQualityLabel: () => player.qualities.find(option => option.quality === player.playing)?.qualityLabel ?? '',
      setPlaybackQualityRange: quality => { player.preferred = quality; },
      togglePictureInPicture: () => { player.pip = !player.pip; },
    };
    return player;
  };
  let player = makePlayer();
  const bar = () => player.controls.children.map(child => child.children?.[1]?.id ?? child.className);
  const fullBar = ['ytp-autonav-toggle', 'docent-speed', 'docent-quality', 'ytp-subtitles-button', 'ytp-button docent-pip', 'ytp-settings-button'];
  page.pictureInPictureEnabled = true;
  watch.getAttribute = key => key === 'video-id' ? videoId : null;
  watch.hasAttribute = key => key === 'theater' && theater;
  watch.contains = element => element === trigger;
  watch.querySelector = selector => {
    if (selector === '#panels') return panels;
    if (selector === '#secondary') return { contains: element => related.children.some(header => header.children.includes(element)) };
    if (selector === '#chat-container') return chatInfo ? chatContainer : null;
    if (selector === '#chat-container ytd-live-chat-frame') return chat;
    if (selector === '#playlist:not([hidden])') return playlist;
    if (selector === 'ytd-watch-metadata #actions ytd-menu-renderer') return menu;
    if (selector === '#related') return related;
    return null;
  };
  watch.querySelectorAll = selector => selector === 'ytd-watch-metadata yt-carousel-item-view-model' ? cards
    : selector === '[data-docent-chat-entry]' ? cards.filter(card => card.hasAttribute('data-docent-chat-entry'))
    : panels.children.filter(panel => panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  page.querySelector = selector => {
    if (selector === 'ytd-masthead') return {};
    if (selector === 'ytd-watch-flexy') return watch;
    if (selector === 'ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]') return theater ? watch : null;
    if (selector === '.ytp-size-button') return { click: () => { theater = !theater; } };
    if (selector === '#movie_player') return player;
    if (selector.startsWith('#docent-')) return created.find(element => element.id === selector.slice(1)) ?? null;
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
  const notifyChat = (collapsed, target = chat) => {
    if (target === chat) chatCollapsed = collapsed;
    const event = new CustomEvent('yt-chat-collapsed-changed', { detail: collapsed });
    Object.defineProperty(event, 'target', { value: target });
    watch.dispatchEvent(event);
  };
  watch.toggleLiveChatPanel = collapsed => {
    chatRequests++;
    if (chat) notifyChat(collapsed);
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
  const chatButton = created.find(element => element.id === 'docent-chat');
  assert.strictEqual(chatButton.hidden, true, 'ordinary videos have no chat glyph');
  assert.strictEqual(chatButton.ariaPressed, 'false');
  assert.strictEqual(recommended.ariaLabel, 'Recommended videos');
  assert.strictEqual(recommended.ariaControls, 'related');
  assert.strictEqual(recommended.ariaPressed, 'false');
  assert.strictEqual(created.filter(element => element.id === 'docent-recommended').length, 1);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'ordinary videos start without a column, ignoring legacy defaults and ads');
  assert.strictEqual(created.find(element => element.id === 'docent-panels').children.length, 2, 'only chat and recommendations belong in the panel bar');
  assert.strictEqual(created.some(element => ['docent-search', 'docent-captions', 'docent-ask', 'docent-chapters', 'docent-transcript', 'docent-notes'].includes(element.id)), false);

  // The player bar: speed and resolution pickers show what the player offers and plays, follow changes
  // made elsewhere, and set the player through its API.
  assert.deepStrictEqual(bar(), fullBar, 'speed and resolution precede captions; picture-in-picture precedes settings');
  const speed = created.find(element => element.id === 'docent-speed');
  const quality = created.find(element => element.id === 'docent-quality');
  const shown = select => [select.previousSibling.textContent, select.value, select.parentNode.title];
  assert.deepStrictEqual(Array.from(speed.options, option => option.value), ['0.25', '0.5', '1', '1.5', '2']);
  assert.deepStrictEqual(shown(speed), ['1×', '1', 'Playback speed: 1×']);
  assert.deepStrictEqual(Array.from(quality.options, option => option.textContent), ['1080p', '720p', 'Auto (1080p)'], 'only playable qualities are offered');
  assert.deepStrictEqual(shown(quality), ['1080p', 'auto', 'Video resolution: Auto (1080p)'], 'Auto shows the resolution playing now');
  speed.value = '1.5';
  page.activeElement = speed;
  speed.onchange();
  assert.strictEqual(player.rate, 1.5);
  assert.deepStrictEqual(shown(speed), ['1.5×', '1.5', 'Playback speed: 1.5×']);
  assert.strictEqual(page.activeElement, page.body, 'a choice hands the keyboard back to YouTube');
  player.rate = 1.05;
  page.dispatchEvent(new Event('ratechange'));
  assert.deepStrictEqual(Array.from(speed.options, option => option.value), ['0.25', '0.5', '1', '1.05', '1.5', '2'], 'a custom speed from YouTube joins the list');
  assert.deepStrictEqual(shown(speed), ['1.05×', '1.05', 'Playback speed: 1.05×']);
  player.preferred = 'hd720';
  panelObserver.callback();
  assert.deepStrictEqual(shown(quality), ['720p', 'hd720', 'Video resolution: 720p'], 'YouTube\'s menu changes the preference without an event');
  quality.value = 'auto';
  quality.onchange();
  assert.strictEqual(player.preferred, 'auto');
  assert.strictEqual(player.listeners.length, 1);
  const [[qualityEvent, onQuality]] = player.listeners;
  assert.strictEqual(qualityEvent, 'onPlaybackQualityChange');
  player.playing = 'hd720';
  onQuality();
  assert.deepStrictEqual(shown(quality), ['720p', 'auto', 'Video resolution: Auto (720p)']);
  player.preferred = 'hd2160';
  panelObserver.callback();
  assert.deepStrictEqual(shown(quality), ['720p', 'hd720', 'Video resolution: 720p'], 'a preference this video cannot play shows what plays');
  // Docent's writes are page mutations too, so unchanged state must not write again.
  let textWrites = 0;
  for (const label of [speed.previousSibling, quality.previousSibling]) {
    let text = label.textContent;
    Object.defineProperty(label, 'textContent', { get: () => text, set: value => { text = value; textWrites++; } });
  }
  const optionsBefore = optionWrites;
  panelObserver.callback();
  panelObserver.callback();
  assert.strictEqual(optionWrites + textWrites, optionsBefore, 'an unchanged player must not wake the observer again');
  const pip = created.find(element => element.className === 'ytp-button docent-pip');
  assert.strictEqual(pip.hidden, false);
  assert.strictEqual(pip.ariaLabel, 'Picture-in-picture');
  pip.onclick();
  assert.strictEqual(player.pip, true, 'picture-in-picture goes through the player API');
  player.preferred = 'auto';
  player.playing = 'hd1080';
  page.activeElement = trigger;
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
  const showDislike = value => page.dispatchEvent(new CustomEvent('docent-settings', { detail: JSON.stringify({ enabled: true, autoScroll: false, showDislike: value }) }));
  showDislike(true);
  assert.strictEqual(attributes.has('data-docent-dislike'), true);
  assert.strictEqual(created.find(element => element.id === 'docent-rail'), shell, 'showing Dislike must not rebuild the view');
  showDislike('true');
  assert.strictEqual(attributes.has('data-docent-dislike'), false, 'only a real true shows Dislike');
  page.dispatchEvent(new Event('timeupdate'));
  assert.strictEqual(scrolled, 210);
  notify(transcript, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

  chatInfo = {};
  panelObserver.callback();
  assert.strictEqual(chatButton.hidden, false, 'watch data exposes chat before its iframe exists');
  assert.strictEqual(chatButton.ariaLabel, 'Live chat');
  assert.strictEqual(cards[0].hasAttribute('data-docent-chat-entry'), true);
  assert.strictEqual(cards[1].hasAttribute('data-docent-chat-entry'), false, 'other metadata entry points stay available');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'availability cannot open a panel');
  chatButton.onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat');
  assert.strictEqual(chatRequests, 1, 'a lazy chat is opened through YouTube');
  chat = { isConnected: true, hasAttribute: () => chatCollapsed };
  notifyChat(true);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat', 'initial lazy collapse cannot cancel the requested panel');
  panelObserver.callback();
  assert.strictEqual(chatCollapsed, false, 'a late chat iframe completes the pending open');
  assert.strictEqual(chatButton.ariaPressed, 'true');
  recommended.onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'related');
  assert.strictEqual(chatButton.ariaPressed, 'false');
  notifyChat(false);
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'related', 'background chat updates cannot replace recommendations');
  recommended.onclick();
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'closing recommendations must not reopen chat');
  assert.strictEqual(chatButton.ariaPressed, 'false');
  chatButton.onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat');
  chatButton.onclick();
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'chat glyph toggles closed without a fallback');
  chatButton.onclick();
  notify(comments);
  assert.strictEqual(chatButton.ariaPressed, 'false', 'native panels replace chat');
  notify(comments, 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'native close does not reopen chat');
  chatButton.onclick();
  notifyChat(true);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'native chat close clears the selection');
  assert.strictEqual(page.activeElement, chatButton, 'native chat close restores its glyph focus');

  chatInfo = { isReplay: true };
  panelObserver.callback();
  assert.strictEqual(chatButton.ariaLabel, 'Live chat replay');
  chatButton.onclick();
  page.fullscreenElement = {};
  notifyChat(true);
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat', 'fullscreen suspends chat');
  page.fullscreenElement = null;
  page.dispatchEvent(new Event('fullscreenchange'));
  frames.shift()();
  assert.strictEqual(chatCollapsed, false, 'fullscreen exit restores the selected chat through YouTube');
  chatButton.onclick();
  theater = true;
  panelObserver.callback();
  assert.strictEqual(theater, false, 'Docent normalizes native theater mode even with no panel selected');

  playlist = { querySelector: () => null };
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none', 'late playlists cannot choose a panel');
  openMenu();
  openMenu();
  assert.strictEqual(items.children.filter(item => item.id === 'docent-open-playlist').length, 1);
  assert.strictEqual(items.children.some(item => item.id === 'docent-open-chat'), false, 'chat has no duplicate menu entry');
  items.querySelector('#docent-open-playlist').onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist');
  chatButton.onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'chat');
  items.querySelector('#docent-open-playlist').onclick();
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'playlist');
  playlist = undefined;
  panelObserver.callback();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');
  chatButton.onclick();
  dataVideoId = 'old-video';
  panelObserver.callback();
  assert.strictEqual(chatButton.hidden, true, 'stale video data cannot advertise chat');
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');
  dataVideoId = undefined;
  chatInfo = undefined;
  panelObserver.callback();
  assert.strictEqual(chatButton.hidden, true, 'a leftover iframe does not imply chat availability');
  assert.strictEqual(cards[0].hasAttribute('data-docent-chat-entry'), false);
  chat = undefined;

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
  assert.strictEqual(created.find(element => element.id === 'docent-chat').hidden, true, 'navigation clears the previous chat capability');
  assert.strictEqual(panels.querySelectorAll().length, 0);
  // yt-navigate-finish fires before the watch page shows the new video, so setup waits for it. Meanwhile
  // no panel is selected, and that state must have no column, or the column flashes open on every load.
  const timers = [];
  main.setTimeout = (callback, _, ...args) => timers.push(() => callback(...args));
  created.find(element => element.id === 'docent-recommended').onclick();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'related');
  main.location.search = '?v=later-video';
  page.dispatchEvent(new Event('yt-navigate-finish'));
  assert.strictEqual(page.documentElement.dataset.docentPanel, undefined, 'the previous panel is dropped while the next video loads');
  assert.match(fs.readFileSync(`${__dirname}/docent.css`, 'utf8'), /:not\(\[data-docent-panel\]\)[^{]*ytd-watch-flexy \{\s*--ytd-watch-flexy-sidebar-width: 0px/, 'no selected panel means no column');
  videoId = 'later-video';
  timers.shift()();
  assert.strictEqual(page.documentElement.dataset.docentPanel, 'none');
  assert.strictEqual(timers.length, 0);
  notify(chapters);
  chatInfo = {};
  observers.at(-1).callback();
  assert.strictEqual(cards[0].hasAttribute('data-docent-chat-entry'), true);
  assert.deepStrictEqual(bar(), fullBar, 'setup reruns and navigation leave one of each player control');
  assert.strictEqual(player.listeners.length, 1, 'and one quality listener on the player');
  const replaced = player;
  player = makePlayer();
  observers.at(-1).callback();
  assert.deepStrictEqual(bar(), fullBar, 'a rebuilt player gets the controls back');
  assert.deepStrictEqual(replaced.controls.children.map(child => child.className), ['ytp-autonav-toggle', 'ytp-subtitles-button', 'ytp-settings-button']);
  assert.strictEqual(player.listeners.length, 1);
  assert.deepStrictEqual(shown(created.find(element => element.id === 'docent-quality')), ['1080p', 'auto', 'Video resolution: Auto (1080p)'], 'the new player\'s state, not the old one\'s');
  setPage(false);
  assert.strictEqual(chapters.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED', 'disabling must not rewrite native visibility');
  notify(other);
  assert.strictEqual(page.documentElement.dataset.docentPanel, undefined, 'disabled layout ignores native events');
  assert.strictEqual(panels.querySelectorAll().length, 0);
  assert.strictEqual(observers.at(-1).connected, false);
  assert.strictEqual(cards.some(card => card.hasAttribute('data-docent-chat-entry')), false);
  assert.deepStrictEqual(bar(), ['ytp-autonav-toggle', 'ytp-subtitles-button', 'ytp-settings-button'], 'disabling leaves YouTube\'s controls as they were');
  setPage(true);
  assert.deepStrictEqual(bar(), fullBar, 're-enabling adds each control once');
  assert.strictEqual(player.listeners.length, 1);

  // The options page saves changes and follows a toggle made from another extension surface.
  const inputs = Object.fromEntries(Object.entries({ enabled: 'checkbox', autoScroll: 'checkbox', showDislike: 'checkbox' }).map(([id, type]) => [id, { id, type }]));
  let change;
  inputs.controls = { addEventListener: (_, listener) => { change = listener; } };
  inputs.preferences = {};
  inputs.status = { toggleAttribute() {}, removeAttribute() {} };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/settings.js`, 'utf8'), { chrome, document: { getElementById: id => inputs[id] }, console });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(inputs.enabled.checked, true);
  assert.strictEqual(inputs.autoScroll.checked, false);
  assert.strictEqual(inputs.showDislike.checked, false, 'Dislike stays hidden by default');
  inputs.autoScroll.checked = true;
  await change({ target: inputs.autoScroll });
  assert.strictEqual(values.autoScroll, true);
  assert.strictEqual(inputs.status.textContent, 'Saved');
  await local.set({ enabled: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(inputs.enabled.checked, false);
  assert.strictEqual(inputs.preferences.disabled, true);
  console.log('ok: subscriptions, toolbar toggle, settings and bridge, native panels, live/replay chat, panel toggles, player bar, navigation, disable cleanup');
}
checkSettings().catch(error => { console.error(error); process.exitCode = 1; });
