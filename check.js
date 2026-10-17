// Self-check for the guide parsing in docent.js, which can't be tried without a signed-in account:
//   node check.js
// It loads docent.js against a stub DOM and feeds subscriptions() a guide shaped like YouTube's.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const node = () => ({ dataset: {}, children: [], append(...children) { this.children.push(...children); } });
const context = vm.createContext({
  document: { createElement: node, createElementNS: node, addEventListener() {} },
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
console.log('ok');
