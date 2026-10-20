// The toolbar button is a global switch. Storage changes reach every open YouTube tab.
// Chrome keeps action state across worker restarts but resets it on browser restart, update or re-enable,
// so rebuild it each time the worker starts.
const updateAction = () => chrome.storage.local.get({ enabled: true }).then(({ enabled }) => Promise.all([
  chrome.action.setTitle({ title: enabled ? 'Disable Docent' : 'Enable Docent' }),
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' }),
])).catch(console.error);

// Serialize clicks so two quick clicks still toggle twice.
let toggles = Promise.resolve();
chrome.action.onClicked.addListener(() => {
  toggles = toggles.then(async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    await chrome.storage.local.set({ enabled: !enabled });
  }).catch(console.error);
});
chrome.storage.local.onChanged.addListener(updateAction);
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'open-options') chrome.runtime.openOptionsPage().catch(console.error);
});
chrome.action.setBadgeBackgroundColor({ color: '#55545e' }).catch(console.error);
updateAction();
