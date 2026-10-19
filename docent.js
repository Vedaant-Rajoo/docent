// Docent adds a minimal shell across YouTube and reworks the watch page around its video.
// docent.css restyles YouTube's own nodes while <html> has data-docent. This file sets that
// attribute while enabled and adds Docent's own nodes. YouTube re-renders and re-measures
// its nodes, so Docent hides and restyles them but never moves them.
//
// This file runs in the page's main world because the player API (getPlayerResponse,
// setPlaybackRate) lives there. YouTube enforces Trusted Types in that world, so innerHTML
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

// A 20px stroke icon drawn from one SVG path.
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
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
};

const iconButton = (name, label, onclick) => el('button', { className: 'docent-icon', title: label, ariaLabel: label, onclick }, icon(ICONS[name]));
const iconLink = (name, label, href) => el('a', { className: 'docent-icon', title: label, ariaLabel: label, href }, icon(ICONS[name]));

const RATES = [1, 1.25, 1.5, 2];

let settings;
let setupTimer;
let restoreWatch = () => {};

// YouTube's guide, fetched once per page load for the subscriptions in the rail.
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

// Fills the quality picklist with the qualities YouTube offers for this video. YouTube lists the
// higher ones only once the video starts, so this runs again on every quality change.
const fillQuality = () => {
  const select = $('#docent-quality'), player = $('#movie_player');
  if (!select) return;
  select.replaceChildren(
    ...player.getAvailableQualityData().filter(quality => quality.isPlayable).map(quality => new Option(quality.qualityLabel, quality.quality)),
    new Option(`Auto (${player.getPlaybackQualityLabel()})`, 'auto'),
  );
  // A preferred quality above what this video offers matches no option; show what plays instead.
  select.value = player.getPreferredQuality();
  if (select.selectedIndex < 0) select.value = player.getPlaybackQuality();
};
const listening = new WeakSet();

function setup(tries = 0) {
  clearTimeout(setupTimer);
  restoreWatch();
  restoreWatch = () => {};
  const root = document.documentElement;
  const onWatchPage = location.pathname === '/watch';
  // Preserve the existing dark-theme requirement: native light text colors do not suit this layout.
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
  guide ??= $('ytd-app')?.guideService?.fetchGuideData?.().catch(() => null);
  guide?.then(data => {
    if (rail.isConnected) channels.replaceChildren(...subscriptions(data));
  });
  if (!onWatchPage) {
    dispatchEvent(new Event('resize'));
    return;
  }

  const watch = $('ytd-watch-flexy');
  if (!watch) return;
  const player = $('#movie_player');
  const panels = $('#panels', watch);
  const videoId = watch.getAttribute('video-id');
  let activePanel, opener, lastTrigger, preferredContext, fullscreenPanel, menuRequested = false;
  const contextPanel = () => {
    const chat = $('#chat-container ytd-live-chat-frame:not(:has(ytd-message-renderer))', watch);
    const playlist = $('#playlist:not([hidden])', watch);
    if (playlist && preferredContext === 'playlist') return 'playlist';
    if (chat && (preferredContext === 'chat' || !chat.hasAttribute('collapsed'))) return 'chat';
    if (playlist) return 'playlist';
    return chat ? 'chat' : 'none';
  };
  // CSS selects one native component. Do not close, move, or rebuild it: drafts and reading
  // positions belong to YouTube. Ordinary videos have no column until an action opens it.
  const show = (name, panel) => {
    if (name === 'chat' || name === 'playlist') preferredContext = name;
    activePanel?.removeAttribute('data-docent-native');
    activePanel = panel;
    panel?.setAttribute('data-docent-native', '');
    recommended.ariaPressed = String(name === 'related');
    if (root.dataset.docentPanel === name) return;
    root.dataset.docentPanel = name;
    dispatchEvent(new Event('resize'));
  };
  const close = () => {
    fullscreenPanel = undefined;
    const focused = activePanel?.contains(document.activeElement) || $('#secondary', watch)?.contains(document.activeElement);
    show(contextPanel());
    const target = opener?.isConnected && opener.checkVisibility() ? opener : player;
    if (focused || document.activeElement === document.body) target?.focus({ preventScroll: true });
  };
  const reveal = () => {
    if (watch.hasAttribute('theater') && !watch.hasAttribute('fullscreen') && !document.fullscreenElement) $('.ytp-size-button')?.click();
  };
  const recommended = Object.assign(iconButton('related', 'Recommended videos', () => {
    if (root.dataset.docentPanel === 'related') return close();
    const surface = $('#related', watch);
    if (!surface) return;
    opener = recommended;
    if (!$('#docent-related-header', surface)) surface.prepend(el('div', { id: 'docent-related-header' },
      el('h2', { textContent: 'Recommended', tabIndex: -1 }),
      el('button', { type: 'button', textContent: 'Close', ariaLabel: 'Close recommendations', onclick: close }),
    ));
    show('related');
    reveal();
    $('h2', surface)?.focus();
  }), { id: 'docent-recommended', type: 'button', ariaControls: 'related' });
  document.body.append(recommended);
  const onPanelChange = event => {
    if (watch.getAttribute('video-id') !== videoId || event.detail?.actionName !== 'yt-engagement-panel-visible-changed' || !Array.isArray(event.detail.args)) return;
    const visibility = event.detail.args[1];
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
  const resumePanel = () => {
    if (document.fullscreenElement || !fullscreenPanel) return;
    const panel = fullscreenPanel;
    requestAnimationFrame(() => {
      if (fullscreenPanel !== panel || !panel.isConnected || watch.getAttribute('video-id') !== videoId || document.fullscreenElement) return;
      fullscreenPanel = undefined;
      panel.showPanel?.();
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
    // Chat and playlist also need a way back when another component occupies the column.
    // ponytail: desktop popup menus; add a sheet hook if YouTube moves watch actions to sheets.
    const choices = [
      ['chat', 'Live chat', $('#chat-container ytd-live-chat-frame:not(:has(ytd-message-renderer))', watch)],
      ['playlist', 'Playlist', $('#playlist:not([hidden])', watch)],
    ];
    for (const [name, label, surface] of choices) {
      if (!surface || $(`#docent-open-${name}`, items)) continue;
      items.append(el('button', { id: `docent-open-${name}`, type: 'button', className: 'docent-menu-item', role: 'menuitem', textContent: label, onclick: () => {
        opener = lastTrigger;
        popup.closest('tp-yt-iron-dropdown')?.close();
        if (name === 'chat' && surface.hasAttribute('collapsed')) $('#show-hide-button button', surface)?.click();
        show(name);
        reveal();
        $('h2, button, iframe', surface)?.focus({ preventScroll: true });
      } }));
    }
  };
  const observer = new MutationObserver(() => {
    if (watch.getAttribute('video-id') !== videoId) return;
    // YouTube can announce expansion before a delayed visibility attribute update.
    if (activePanel && !activePanel.isConnected) close();
    else if (!activePanel) {
      const selector = { related: '#related', chat: '#chat-container ytd-live-chat-frame:not(:has(ytd-message-renderer))', playlist: '#playlist:not([hidden])' }[root.dataset.docentPanel];
      if (!selector || !$(selector, watch)) show(contextPanel());
    }
  });
  watch.addEventListener('yt-action', onPanelChange, true);
  document.addEventListener('click', remember, true);
  document.addEventListener('yt-popup-opened', onPopup, true);
  document.addEventListener('fullscreenchange', resumePanel);
  observer.observe(watch, { childList: true, subtree: true, attributes: true, attributeFilter: ['collapsed', 'hidden'] });
  restoreWatch = () => {
    observer.disconnect();
    watch.removeEventListener('yt-action', onPanelChange, true);
    document.removeEventListener('click', remember, true);
    document.removeEventListener('yt-popup-opened', onPopup, true);
    document.removeEventListener('fullscreenchange', resumePanel);
    fullscreenPanel = undefined;
    activePanel?.removeAttribute('data-docent-native');
  };
  const expanded = [...watch.querySelectorAll('#panels > ytd-engagement-panel-section-list-renderer[visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED]')]
    .filter(panel => panel.getAttribute('target-id') !== 'engagement-panel-ads').at(-1);
  show(expanded ? 'native' : contextPanel(), expanded);

  // Player: a speed button and a quality picklist in front of the captions button
  const controls = $('.ytp-right-controls-left') || $('.ytp-right-controls');
  if (player && controls) {
    const speed = el('button', { id: 'docent-speed', className: 'ytp-button', title: 'Playback speed', ariaLabel: 'Playback speed' }, el('span', { textContent: `${player.getPlaybackRate()}×` }));
    speed.onclick = () => player.setPlaybackRate(RATES[(RATES.indexOf(player.getPlaybackRate()) + 1) % RATES.length]);
    const quality = el('select', { id: 'docent-quality', title: 'Quality', ariaLabel: 'Quality' });
    // Blur after picking so YouTube's keyboard shortcuts reach the player again.
    quality.onchange = () => {
      player.setPlaybackQualityRange(quality.value);
      quality.blur();
    };
    controls.insertBefore(speed, controls.querySelector(':scope > .ytp-subtitles-button'));
    speed.after(quality);
    fillQuality();
    // The player keeps its listeners across in-app navigation, so add this one once.
    if (!listening.has(player)) {
      listening.add(player);
      player.addEventListener('onPlaybackQualityChange', fillQuality);
    }
  }

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
document.addEventListener('ratechange', () => {
  const label = $('#docent-speed span');
  if (label) label.textContent = `${$('#movie_player').getPlaybackRate()}×`;
}, true);

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
