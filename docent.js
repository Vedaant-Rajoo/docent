// Docent reworks YouTube's watch page around the video and its transcript.
// docent.css restyles YouTube's own nodes while <html> has data-docent. This file sets that
// attribute on watch pages and adds Docent's own nodes. YouTube re-renders and re-measures
// its nodes, so Docent hides and restyles them but never moves them.
//
// This file runs in the page's main world because the player API (getPlayerResponse,
// setPlaybackRate) lives there. YouTube enforces Trusted Types in that world, so innerHTML
// throws; build nodes with createElement and textContent.
// ponytail: the main world has no chrome.* APIs. Add an isolated-world script when Docent needs storage.

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
  transcript: 'M5 6h14M5 10h14M5 14h14M5 18h8',
  chat: 'M4 5h16v11h-9l-5 4v-4H4zM8 9h8M8 12h5',
  comments: 'M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.4A8 8 0 1 1 20 11.5z',
  related: 'M3 6h7v5H3zM13 7h8M13 10h5M3 14h7v5H3zM13 15h8M13 18h5',
  theater: 'M3 7h18v10H3z',
};

const iconButton = (name, label, onclick) => el('button', { className: 'docent-icon', title: label, ariaLabel: label, onclick }, icon(ICONS[name]));
const iconLink = (name, label, href) => el('a', { className: 'docent-icon', title: label, ariaLabel: label, href }, icon(ICONS[name]));

const RATES = [1, 1.25, 1.5, 2];

// The panels the right column can show. The header has a button for each one the video offers,
// plus a theater mode button that hides the column.
const PANELS = { transcript: 'Transcript', chat: 'Live chat', comments: 'Comments', related: 'Recommended' };
// The panel picked last. Later videos open it too when they offer it.
let picked;

// YouTube's guide, fetched once per page load for the subscriptions in the rail.
let guide;

// YouTube serves two transcript layouts: transcript-segment-view-model rows and the older
// ytd-transcript-segment-renderer rows. Find the open panel by its rows, because its
// target-id is sometimes missing.
const transcriptPanel = () => [...document.querySelectorAll('#panels ytd-engagement-panel-section-list-renderer[visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED]')]
  .find(panel => panel.querySelector('transcript-segment-view-model, ytd-transcript-segment-renderer'));

// Presses the header button for what the right column shows. Theater mode hides the column.
const press = () => {
  const shown = $('ytd-watch-flexy[theater]') ? 'theater' : document.documentElement.dataset.docentPanel;
  document.querySelectorAll('#docent-panels button').forEach(button => button.ariaPressed = button.name === shown);
};
const theater = new MutationObserver(press);

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
  const onWatchPage = location.pathname === '/watch';
  // yt-navigate-finish fires before the watch page shows the new video. On first load the
  // description isn't rendered yet, and after in-app navigation the previous video's transcript
  // button is still there. ytd-watch-flexy's video-id switches once the new metadata is in.
  if (onWatchPage && tries < 100 && $('ytd-watch-flexy')?.getAttribute('video-id') !== new URLSearchParams(location.search).get('v')) {
    setTimeout(setup, 50, tries + 1);
    return;
  }
  // Docent's colors assume YouTube's dark theme. In the light theme YouTube's dark text would
  // land on Docent's dark backgrounds, so Docent stays off there.
  const on = onWatchPage && document.documentElement.hasAttribute('dark');
  document.querySelectorAll('[data-docent-node]').forEach(node => node.remove());
  document.documentElement.toggleAttribute('data-docent', on);
  if (!on) return;

  // Header
  document.body.append(
    el('div', { id: 'docent-nav' }, iconButton('back', 'Back', () => history.back()), iconButton('forward', 'Forward', () => history.forward())),
    el('div', { id: 'docent-reload' }, iconButton('reload', 'Reload', () => location.reload())),
  );
  $('yt-searchbox')?.append(el('kbd', { id: 'docent-kbd', textContent: '⌘K' }));

  // Icon rail: YouTube's logo on top, then the library, then the subscriptions once the guide loads
  const rail = el('nav', { id: 'docent-rail', ariaLabel: 'Library' },
    iconLink('home', 'Home', '/'),
    iconLink('watchLater', 'Watch later', '/playlist?list=WL'),
    iconLink('playlists', 'Playlists', '/feed/playlists'),
    iconLink('history', 'History', '/feed/history'),
    iconLink('liked', 'Liked videos', '/playlist?list=LL'),
  );
  document.body.append(el('a', { id: 'docent-logo', title: 'YouTube', ariaLabel: 'YouTube', href: '/' }, logo()), rail);
  // ponytail: one fetch per page load, so channels subscribed to since then show after a reload.
  guide ??= $('ytd-app')?.guideService?.fetchGuideData?.().catch(() => null);
  guide?.then(data => {
    const channels = subscriptions(data);
    if (channels.length) rail.append(el('div', { id: 'docent-subscriptions', role: 'group', ariaLabel: 'Subscriptions' }, ...channels));
  });

  // Right column: a search box and the caption language above YouTube's transcript panel, for
  // videos that offer a transcript.
  const transcriptButton = $('ytd-watch-metadata ytd-video-description-transcript-section-renderer button');
  const player = $('#movie_player');
  if (transcriptButton) {
    const filter = el('input', { type: 'search', placeholder: 'Search transcript', ariaLabel: 'Search transcript' });
    filter.oninput = () => {
      const term = filter.value.trim().toLowerCase();
      transcriptPanel()?.querySelectorAll('macro-markers-panel-item-view-model, ytd-transcript-segment-renderer').forEach(row => {
        const text = row.querySelector('transcript-segment-view-model .ytAttributedStringHost, .segment-text')?.textContent.toLowerCase();
        row.toggleAttribute('data-docent-miss', Boolean(term) && !text?.includes(term));
      });
    };
    // Label the caption track YouTube picks by default for this video.
    const captions = player?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer;
    const track = captions?.captionTracks?.[captions.audioTracks?.[captions.defaultAudioTrackIndex ?? 0]?.defaultCaptionTrackIndex ?? 0];
    $('ytd-watch-flexy #secondary-inner')?.prepend(
      el('div', { id: 'docent-search' }, filter),
      el('div', { id: 'docent-captions', textContent: `Captions · ${track?.languageCode ?? 'none'}${track?.kind === 'asr' ? ' (auto)' : ''}` }),
    );
  }

  // The header switches the right column between panels. docent.css shows the one named in
  // <html data-docent-panel> and hides the column in theater mode. Each panel the video offers
  // maps to what opens it: the transcript button, the "Show chat replay" button of a stream's
  // recording, or the comments engagement panel that YouTube leaves hidden in this layout.
  // A chat frame holding a message renderer only says that chat or its replay is turned off.
  const comments = $('#panels ytd-engagement-panel-section-list-renderer[target-id=engagement-panel-comments-section]');
  const open = {
    transcript: transcriptButton && (() => transcriptPanel() || transcriptButton.click()),
    chat: $('#chat-container ytd-live-chat-frame:not(:has(ytd-message-renderer))') && (() => $('#chat-container ytd-live-chat-frame[collapsed] #show-hide-button button')?.click()),
    comments: comments && (() => comments.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED')),
    related: () => {},
  };
  const show = name => {
    document.documentElement.dataset.docentPanel = name;
    open[name]();
    press();
  };
  // Theater mode is YouTube's own, so the size button (hidden by docent.css) toggles it and the
  // t key keeps working.
  const toggleTheater = () => $('.ytp-size-button')?.click();
  document.body.append(el('div', { id: 'docent-panels', role: 'group', ariaLabel: 'Right column' },
    ...Object.keys(PANELS).filter(name => open[name]).map(name => Object.assign(iconButton(name, PANELS[name], () => {
      picked = name;
      show(name);
      if ($('ytd-watch-flexy[theater]')) toggleTheater();
    }), { name })),
    Object.assign(iconButton('theater', 'Theater mode', toggleTheater), { name: 'theater' }),
  ));
  show([picked, 'transcript', 'chat', 'related'].find(name => open[name]));
  theater.observe($('ytd-watch-flexy'), { attributeFilter: ['theater'] });

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

// ratechange doesn't bubble, but a capturing listener on document still sees it.
document.addEventListener('ratechange', () => {
  const label = $('#docent-speed span');
  if (label) label.textContent = `${$('#movie_player').getPlaybackRate()}×`;
}, true);

// YouTube stops scrolling the transcript along with the video once the reader scrolls it. Docent
// scrolls the active row back into view whenever the pointer is off the transcript. The rows sit
// in nested overflow boxes, so scroll the nearest one that actually scrolls.
document.addEventListener('timeupdate', () => {
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

addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && document.documentElement.hasAttribute('data-docent')) {
    event.preventDefault();
    $('yt-searchbox input.ytSearchboxComponentInput')?.focus();
  }
}, true);
