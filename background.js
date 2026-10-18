// The toolbar button is a global switch. Storage changes reach every open YouTube tab.
const updateAction = async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await Promise.all([
    chrome.action.setTitle({ title: enabled ? 'Disable Docent' : 'Enable Docent' }),
    chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' }),
    chrome.action.setBadgeBackgroundColor({ color: '#55545e' }),
  ]);
};

// Serialize clicks so two quick clicks still toggle twice.
let toggles = Promise.resolve();
chrome.action.onClicked.addListener(() => {
  toggles = toggles.then(async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    await chrome.storage.local.set({ enabled: !enabled });
  }).catch(console.error);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) updateAction().catch(console.error);
});
chrome.runtime.onInstalled.addListener(() => updateAction().catch(console.error));
chrome.runtime.onStartup.addListener(() => updateAction().catch(console.error));
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message?.type === 'open-options') chrome.runtime.openOptionsPage().catch(console.error);
});
