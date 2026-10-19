// Docent adds a minimal shell across YouTube and reworks the watch page around its video.
// docent.css restyles YouTube's own nodes while <html> has data-docent. This file sets that
// attribute while enabled and adds Docent's own nodes. YouTube re-renders and re-measures
// its nodes, so Docent hides and restyles them but never moves them.
//
// This file runs in the page's main world because the player API (setPlaybackRate,
// getAvailableQualityData) lives there. YouTube enforces Trusted Types in that world, so innerHTML
// throws; build nodes with createElement and textContent.
// bridge.js handles storage in the isolated world.

const $ = (selector, root = document) => root.querySelector(selector);

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.dataset.docentNode = '';
  node.append(...children);
  return node;
};

const svg = (tag, attributes, ...children) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
};

const icon = d => svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg('path', { d }));

// YouTube's logo: a red rounded rectangle with a white play triangle.
const logo = () => svg('svg', { viewBox: '0 0 28 20', width: 28, height: 20 },
  svg('path', { fill: '#f00', d: 'M27.4 3.1A3.6 3.6 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.6 3.6 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.6 3.6 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.6 3.6 0 0 0 2.5-2.5c.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9z' }),
  svg('path', { fill: '#fff', d: 'M11.2 14.3 18.4 10l-7.2-4.3z' }));

const ICONS = {
  home: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  watchLater: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3',
  playlists: 'M4 6h12M4 12h12M4 18h7M17 14l4 3-4 3z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  liked: 'M7 10v10H4V10zM7 10l4-7c1.5 0 2.5 1 2.2 2.5L12.5 9H19a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 20H7',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  reload: 'M20 12a8 8 0 1 1-2.3-5.7L20 8M20 3v5h-5',
  related: 'M3 6h7v5H3zM13 7h8M13 10h5M3 14h7v5H3zM13 15h8M13 18h5',
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 3-2zM7 9h10M7 13h6',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
};

const iconButton = (name, label, onclick) => el('button', { className: 'docent-icon', title: label, ariaLabel: label, onclick }, icon(ICONS[name]));
const iconLink = (name, label, href) => el('a', { className: 'docent-icon', title: label, ariaLabel: label, href }, icon(ICONS[name]));

let settings;
let setupTimer;
let restoreWatch = () => {};

let guide;

// YouTube serves two transcript layouts: transcript-segment-view-model rows and the older
// ytd-transcript-segment-renderer rows. Find the open panel by its rows, because its
// target-id is sometimes missing.
const transcriptPanel = () => [...document.querySelectorAll('#panels ytd-engagement-panel-section-list-renderer[data-docent-native]')]
  .find(panel => panel.querySelector('transcript-segment-view-model, ytd-transcript-segment-renderer'));

// Links to the channels in the guide's subscriptions section, which YouTube orders by recent
// activity. Channels with new videos get a dot. The section nests the channels past the first
// few inside a "Show more" entry, so collect channel entries at any depth.
const subscriptions = data => {
  const entries = [];
  const collect = node => {
    const entry = node?.guideEntryRenderer;
    if (entry?.thumbnail && entry.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')) entries.push(entry);
    else if (node && typeof node === 'object') Object.values(node).forEach(collect);
  };
  collect(data?.items?.find(item => item.guideSubscriptionsSectionRenderer));
  return entries.map(entry => {
    const name = entry.formattedTitle?.simpleText ?? entry.title;
    const isNew = entry.presentationStyle === 'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT';
    return el('a', { className: isNew ? 'docent-icon docent-new' : 'docent-icon', title: name, ariaLabel: name, href: `/channel/${entry.navigationEndpoint.browseEndpoint.browseId}` },
      el('img', { src: entry.thumbnail.thumbnails[0].url, alt: '', loading: 'lazy' }));
  });
};

// The player's speed and resolution pickers: a native select laid over the value it shows, so the
// bar reads "1×" or "1080p" while the browser's own list offers the choices.
const picker = (id, label, choose) => el('span', { className: 'docent-picker' },
  el('span', { ariaHidden: 'true' }),
  el('select', { id, ariaLabel: label, onchange() {
    choose($('#movie_player'), this.value);
    syncPlayer();
    // Blur after picking so YouTube's keyboard shortcuts reach the player again.
    this.blur();
  } }));
// Writes only what changed. The watch page's observer runs this, and every write would run it again.
const fillPicker = (select, choices, value, text) => {
  if (String([...select.options].map(option => [option.textContent, option.value])) !== String(choices)) {
    select.replaceChildren(...choices.map(([label, choice]) => new Option(label, choice)));
  }
  select.value = value;
  const chosen = select.options[select.selectedIndex]?.text ?? '';
  const title = `${select.ariaLabel}: ${chosen}`;
  text ??= chosen;
  if (select.previousSibling.textContent !== text) select.previousSibling.textContent = text;
  if (select.parentNode.title !== title) select.parentNode.title = title;
};

// Shows the choices the player offers for this video and what it plays. YouTube lists the higher
// qualities only once the video starts, and its own menu can change the preferred quality without an
// event, so this runs on speed and quality changes and on the watch page's mutations.
const syncPlayer = () => {
  const speed = $('#docent-speed'), quality = $('#docent-quality'), player = $('#movie_player');
  if (!speed || !quality) return;
  const rate = player.getPlaybackRate();
  // The custom speed slider in YouTube's settings sets rates the list doesn't name.
  fillPicker(speed, [...new Set([...player.getAvailablePlaybackRates(), rate])].sort((a, b) => a - b).map(value => [`${value}×`, value]), rate);
  const qualities = player.getAvailableQualityData().filter(option => option.isPlayable);
  // A preferred quality above what this video offers matches no option; show what plays instead.
  const chosen = [player.getPreferredQuality(), player.getPlaybackQuality()]
    .find(value => value === 'auto' || qualities.some(option => option.quality === value)) ?? 'auto';
  // On Auto the picker shows the resolution playing now, and its list names Auto.
  const playing = player.getPlaybackQualityLabel();
  fillPicker(quality, [...qualities.map(option => [option.qualityLabel, option.quality]), [playing ? `Auto (${playing})` : 'Auto', 'auto']],
    chosen, chosen === 'auto' ? playing || 'Auto' : undefined);
};
const listening = new WeakSet();

function setup(tries = 0) {
  clearTimeout(setupTimer);
  restoreWatch();
  restoreWatch = () => {};
  const root = document.documentElement;
  const onWatchPage = location.pathname === '/watch';
  // Dark theme only: YouTube's light-theme text colors do not suit this layout.
  const on = Boolean(settings?.enabled && root.hasAttribute('dark'));
  const wasOn = root.hasAttribute('data-docent');
  document.querySelectorAll('[data-docent-node]').forEach(node => node.remove());
  root.toggleAttribute('data-docent', on);
  root.toggleAttribute('data-docent-watch', on && onWatchPage);
  root.toggleAttribute('data-docent-home', on && location.pathname === '/');
  delete root.dataset.docentPanel;
  if (!on) {
    if (wasOn) dispatchEvent(new Event('resize'));
    return;
  }
  // yt-navigate-finish fires before the watch page shows the new video. On first load the
  // description isn't rendered yet, and after in-app navigation the previous video's transcript
  // button is still there. ytd-watch-flexy's video-id switches once the new metadata is in.
  if (tries < 100 && (!document.body || !$('ytd-masthead') || (onWatchPage && $('ytd-watch-flexy')?.getAttribute('video-id') !== new URLSearchParams(location.search).get('v')))) {
    setupTimer = setTimeout(setup, 50, tries + 1);
    return;
  }
  if (!document.body) return;

  // Header
  document.body.append(
    el('div', { id: 'docent-nav' }, iconButton('back', 'Back', () => history.back()), iconButton('forward', 'Forward', () => history.forward())),
    el('div', { id: 'docent-reload' }, iconButton('reload', 'Reload', () => location.reload())),
  );
  $('yt-searchbox')?.append(el('kbd', { id: 'docent-kbd', textContent: /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl K' }));

  // Icon rail: YouTube's logo on top, then the library, then the subscriptions once the guide loads
  const channels = el('div', { id: 'docent-subscriptions', role: 'group', ariaLabel: 'Subscriptions' });
  const rail = el('nav', { id: 'docent-rail', ariaLabel: 'Library' },
    iconLink('home', 'Home', '/'),
    iconLink('watchLater', 'Watch later', '/playlist?list=WL'),
    iconLink('playlists', 'Playlists', '/feed/playlists'),
    iconLink('history', 'History', '/feed/history'),
    iconLink('liked', 'Liked videos', '/playlist?list=LL'),
    channels,
    Object.assign(iconButton('settings', 'Docent settings', () => document.dispatchEvent(new Event('docent-open-settings'))), { id: 'docent-settings' }),
  );
  document.body.append(el('a', { id: 'docent-logo', title: 'YouTube', ariaLabel: 'YouTube', href: '/' }, logo()), rail);
  // ponytail: one fetch per page load, so channels subscribed to since then show after a reload.
  guide ??= $('ytd-app')?.guideService?.fetchGuideData?.();
  guide?.then(data => {
    if (rail.isConnected) channels.replaceChildren(...subscriptions(data));
  }, () => { guide = undefined; });
  if (!onWatchPage) {
    dispatchEvent(new Event('resize'));
    return;
  }

  const watch = $('ytd-watch-flexy');
  if (!watch) return;
  const player = $('#movie_player');
  const panels = $('#panels', watch);
  let activePanel, activeChat, opener, lastTrigger, fullscreenPanel, menuRequested = false;
  const surface = name => {
    const selector = { related: '#related', chat: '#chat-container', playlist: '#playlist:not([hidden])' }[name];
    return name === 'native' ? activePanel : selector ? $(selector, watch) : null;
  };
  const chatFrame = () => $('#chat-container ytd-live-chat-frame', watch);
  // ponytail: desktop watch-next data; update this path if YouTube changes how it advertises chat.
  const chatData = () => watch.data?.currentVideoEndpoint?.watchEndpoint?.videoId === watch.getAttribute('video-id')
    ? watch.data?.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer : null;
  const expandChat = () => {
    activeChat = chatFrame();
    if (!activeChat || activeChat.hasAttribute('collapsed')) watch.toggleLiveChatPanel?.(false);
  };
  // CSS selects one native component. Do not close, move, or rebuild it: drafts and reading
  // positions belong to YouTube. Ordinary videos have no column until an action opens it.
  const show = (name, panel) => {
    fullscreenPanel = undefined;
    if (name !== 'chat') activeChat = undefined;
    activePanel?.removeAttribute('data-docent-native');
    activePanel = panel;
    panel?.setAttribute('data-docent-native', '');
    recommended.ariaPressed = String(name === 'related');
    chat.ariaPressed = String(name === 'chat');
    if (root.dataset.docentPanel === name) return;
    root.dataset.docentPanel = name;
    dispatchEvent(new Event('resize'));
  };
  const close = () => {
    fullscreenPanel = undefined;
    const focused = surface(root.dataset.docentPanel)?.contains(document.activeElement);
    show('none');
    const target = opener?.isConnected && opener.checkVisibility() ? opener : player;
    if (focused || document.activeElement === document.body) target?.focus({ preventScroll: true });
  };
  const reveal = () => {
    if (watch.hasAttribute('theater') && !watch.hasAttribute('fullscreen') && !document.fullscreenElement) $('.ytp-size-button')?.click();
  };
  const toggle = (name, button) => {
    if (root.dataset.docentPanel === name) return close();
    const content = surface(name);
    if (name === 'chat' ? chat.hidden : !content) return;
    opener = button;
    if (name === 'related' && !$('#docent-related-header', content)) content.prepend(el('div', { id: 'docent-related-header' },
      el('h2', { textContent: 'Recommended', tabIndex: -1 }),
      el('button', { type: 'button', textContent: 'Close', ariaLabel: 'Close recommendations', onclick: close }),
    ));
    show(name);
    reveal();
    if (name === 'chat') expandChat();
    if (content) $('h2, button, iframe', content)?.focus();
  };
  const recommended = Object.assign(iconButton('related', 'Recommended videos', () => toggle('related', recommended)), { id: 'docent-recommended', type: 'button', ariaControls: 'related' });
  const chat = Object.assign(iconButton('chat', 'Live chat', () => toggle('chat', chat)), { id: 'docent-chat', type: 'button', ariaControls: 'chat', hidden: true });
  document.body.append(el('div', { id: 'docent-panels', role: 'group', ariaLabel: 'Video panels' }, chat, recommended));
  const syncChat = () => {
    const data = chatData();
    chat.hidden = !data;
    chat.title = chat.ariaLabel = data?.isReplay ? 'Live chat replay' : 'Live chat';
    watch.querySelectorAll('ytd-watch-metadata yt-carousel-item-view-model').forEach(card =>
      card.toggleAttribute('data-docent-chat-entry', Boolean(data && card.data?.teaserType === 'WATCH_UI_TEASER_TYPE_LIVE_CHAT')));
  };
  const onPanelChange = event => {
    if (event.detail?.actionName !== 'yt-engagement-panel-visible-changed') return;
    const visibility = event.detail.args?.[1];
    const panel = event.target.closest?.('ytd-engagement-panel-section-list-renderer');
    // Promotional panels can expand on load. They must not open an otherwise empty column.
    if (!panel || panel.parentElement !== panels || panel.getAttribute('target-id') === 'engagement-panel-ads') return;
    if (visibility === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
      const focused = document.activeElement;
      if (panel !== activePanel) opener = focused && watch.contains(focused) && !focused.closest('#secondary') ? focused : lastTrigger;
      show('native', panel);
      reveal();
    } else if (['ENGAGEMENT_PANEL_VISIBILITY_HIDDEN', 'ENGAGEMENT_PANEL_VISIBILITY_COLLAPSED'].includes(visibility) && panel === activePanel) {
      if (document.fullscreenElement || watch.hasAttribute('fullscreen')) fullscreenPanel = panel;
      else if (fullscreenPanel !== panel) close();
    }
  };
  const onChatChange = event => {
    if (event.target !== activeChat || event.detail !== true || root.dataset.docentPanel !== 'chat') return;
    if (document.fullscreenElement || watch.hasAttribute('fullscreen')) fullscreenPanel = event.target;
    else if (fullscreenPanel !== event.target) close();
  };
  const resumePanel = () => {
    if (document.fullscreenElement || watch.hasAttribute('fullscreen') || !fullscreenPanel) return;
    const panel = fullscreenPanel;
    requestAnimationFrame(() => {
      if (fullscreenPanel !== panel || !panel.isConnected || document.fullscreenElement || watch.hasAttribute('fullscreen')) return;
      fullscreenPanel = undefined;
      if (panel === activePanel) panel.showPanel?.();
      else if (root.dataset.docentPanel === 'chat' && panel === chatFrame()) expandChat();
    });
  };
  const remember = event => {
    const button = event.target.closest?.('button, a, [role=button]');
    const menu = $('ytd-watch-metadata #actions ytd-menu-renderer', watch);
    menuRequested = Boolean(menu && button?.closest('ytd-menu-renderer') === menu && button.closest('yt-button-shape, yt-icon-button')?.parentElement === menu);
    if (button && watch.contains(button) && !button.closest('#secondary')) lastTrigger = button;
  };
  const onPopup = event => {
    const popup = event.detail?.closest?.('ytd-menu-popup-renderer') || event.target.closest?.('ytd-menu-popup-renderer');
    const items = popup?.querySelector('#items');
    if (!menuRequested || !items) return;
    menuRequested = false;
    // The video menu keeps a way to reopen the playlist.
    // ponytail: desktop popup menus; add a sheet hook if YouTube moves watch actions to sheets.
    if (!surface('playlist') || $('#docent-open-playlist', items)) return;
    items.append(el('button', { id: 'docent-open-playlist', type: 'button', className: 'docent-menu-item', role: 'menuitem', textContent: 'Playlist', onclick: () => {
      popup.closest('tp-yt-iron-dropdown')?.close();
      toggle('playlist', lastTrigger);
    } }));
  };
  // Player: speed and resolution pickers in front of YouTube's captions button, and picture-in-picture
  // in front of settings. YouTube's own picture-in-picture button comes after fullscreen, so this one
  // calls the same player API in the bar's order. YouTube sometimes replaces the whole player, so the
  // observer below puts them back.
  const speed = picker('docent-speed', 'Playback speed', (current, rate) => current.setPlaybackRate(Number(rate)));
  const quality = picker('docent-quality', 'Video resolution', (current, value) => current.setPlaybackQualityRange(value));
  const pip = el('button', { type: 'button', className: 'ytp-button docent-pip', title: 'Picture-in-picture', ariaLabel: 'Picture-in-picture', hidden: !document.pictureInPictureEnabled, onclick: () => $('#movie_player').togglePictureInPicture() },
    svg('svg', { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linejoin': 'round' },
      svg('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }),
      svg('rect', { x: 12, y: 11, width: 7, height: 6, rx: .8, fill: 'currentColor', stroke: 'none' })));
  const updatePlayer = () => {
    const current = $('#movie_player');
    const controls = current && ($('.ytp-right-controls-left', current) || $('.ytp-right-controls', current));
    if (controls && !controls.contains(speed)) {
      controls.insertBefore(speed, controls.querySelector(':scope > .ytp-subtitles-button'));
      speed.after(quality);
      controls.insertBefore(pip, controls.querySelector(':scope > .ytp-settings-button'));
      // The player keeps its listeners across in-app navigation, so add this one once per player.
      if (!listening.has(current)) {
        listening.add(current);
        current.addEventListener('onPlaybackQualityChange', syncPlayer);
      }
    }
    syncPlayer();
  };
  const observer = new MutationObserver(() => {
    syncChat();
    reveal();
    // YouTube can announce expansion before a delayed visibility attribute update.
    if (activePanel && !activePanel.isConnected) close();
    else if (root.dataset.docentPanel === 'chat' ? chat.hidden
      : ['related', 'playlist'].includes(root.dataset.docentPanel) && !surface(root.dataset.docentPanel)) close();
    if (root.dataset.docentPanel === 'chat' && chatFrame() !== activeChat) expandChat();
    resumePanel();
    updatePlayer();
  });
  watch.addEventListener('yt-action', onPanelChange, true);
  watch.addEventListener('yt-chat-collapsed-changed', onChatChange, true);
  document.addEventListener('click', remember, true);
  document.addEventListener('yt-popup-opened', onPopup, true);
  document.addEventListener('fullscreenchange', resumePanel);
  observer.observe(watch, { childList: true, subtree: true, attributes: true, attributeFilter: ['collapsed', 'hidden', 'theater', 'fullscreen'] });
  restoreWatch = () => {
    observer.disconnect();
    watch.removeEventListener('yt-action', onPanelChange, true);
    watch.removeEventListener('yt-chat-collapsed-changed', onChatChange, true);
    document.removeEventListener('click', remember, true);
    document.removeEventListener('yt-popup-opened', onPopup, true);
    document.removeEventListener('fullscreenchange', resumePanel);
    fullscreenPanel = undefined;
    activePanel?.removeAttribute('data-docent-native');
    watch.querySelectorAll('[data-docent-chat-entry]').forEach(card => card.removeAttribute('data-docent-chat-entry'));
  };
  const expanded = [...watch.querySelectorAll('#panels > ytd-engagement-panel-section-list-renderer[visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED]')]
    .filter(panel => panel.getAttribute('target-id') !== 'engagement-panel-ads').at(-1);
  syncChat();
  show(expanded ? 'native' : 'none', expanded);
  reveal();
  updatePlayer();

  // YouTube sizes the player from the window, so make it measure again now that the rail takes 64px.
  dispatchEvent(new Event('resize'));
}

document.addEventListener('yt-navigate-finish', () => setup());
document.addEventListener('DOMContentLoaded', () => setup(), { once: true });
new MutationObserver(() => setup()).observe(document.documentElement, { attributeFilter: ['dark'] });

document.addEventListener('docent-settings', event => {
  let next;
  try { next = JSON.parse(event.detail); } catch { return; }
  if (!next || typeof next.enabled !== 'boolean' || typeof next.autoScroll !== 'boolean') return;
  const changed = settings?.enabled !== next.enabled;
  settings = next;
  // docent.css shows YouTube's Dislike button for this attribute, so nothing needs rebuilding.
  document.documentElement.toggleAttribute('data-docent-dislike', next.showDislike === true);
  if (changed) setup();
});
document.dispatchEvent(new Event('docent-ready'));

// ratechange doesn't bubble, but a capturing listener on document still sees it.
document.addEventListener('ratechange', syncPlayer, true);

// YouTube stops scrolling the transcript along with the video once the reader scrolls it. Docent
// scrolls the active row back into view whenever the pointer is off the transcript. The rows sit
// in nested overflow boxes, so scroll the nearest one that actually scrolls.
document.addEventListener('timeupdate', () => {
  if (!settings?.autoScroll || !document.documentElement.hasAttribute('data-docent') || document.documentElement.dataset.docentPanel !== 'native' || $('ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]') || document.fullscreenElement) return;
  const panel = transcriptPanel();
  const row = panel?.querySelector('.ytwTranscriptSegmentViewModelHostActive, ytd-transcript-segment-renderer.active');
  if (!row?.checkVisibility() || panel.matches(':hover')) return;
  let list = row.parentElement;
  while (list && !(list.scrollHeight > list.clientHeight && /auto|scroll/.test(getComputedStyle(list).overflowY))) list = list.parentElement;
  const rowBox = row.getBoundingClientRect(), listBox = list?.getBoundingClientRect();
  if (listBox && (rowBox.top < listBox.top || rowBox.bottom > listBox.bottom)) {
    list.scrollBy({ top: rowBox.top - listBox.top - (listBox.height - rowBox.height) / 2, behavior: 'smooth' });
  }
}, true);

// When search results load, YouTube moves focus from the search box to its guide button, which closes the
// suggestions. Docent hides that button, so blur the search box itself or the suggestions stay open.
document.addEventListener('yt-navigate-finish', event => {
  if (event.detail?.pageType !== 'search' || !document.documentElement.hasAttribute('data-docent')) return;
  $('yt-searchbox input.ytSearchboxComponentInput')?.blur();
});

addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && document.documentElement.hasAttribute('data-docent')) {
    event.preventDefault();
    const search = $('yt-searchbox input.ytSearchboxComponentInput');
    if (search === document.activeElement) search.blur();
    else search?.focus();
  }
}, true);
