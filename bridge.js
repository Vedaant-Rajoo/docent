// Only this isolated-world script has extension APIs. The page receives settings, not API access.
let settings;
let revision = 0;
const publish = () => {
  if (settings) document.dispatchEvent(new CustomEvent('docent-settings', { detail: JSON.stringify(settings) }));
};
const refresh = async () => {
  const current = ++revision;
  const saved = await chrome.storage.local.get({ enabled: true, autoScroll: true });
  if (current === revision) {
    settings = saved;
    publish();
  }
};
document.addEventListener('docent-ready', publish);
document.addEventListener('docent-open-settings', () => chrome.runtime.sendMessage({ type: 'open-options' }).catch(console.error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['enabled', 'autoScroll'].some(key => key in changes)) refresh().catch(console.error);
});
refresh().catch(console.error);
