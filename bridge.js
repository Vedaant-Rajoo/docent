// Only this isolated-world script has extension APIs. The page receives a copy of the settings, not API access.
const refresh = () => chrome.storage.local.get({ enabled: true, autoScroll: true, showDislike: false })
  .then(settings => document.dispatchEvent(new CustomEvent('docent-settings', { detail: settings })))
  .catch(console.error);
chrome.storage.local.onChanged.addListener(refresh);
document.addEventListener('docent-open-settings', () => chrome.runtime.sendMessage({ type: 'open-options' }).catch(console.error));
refresh();
