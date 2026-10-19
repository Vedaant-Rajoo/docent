const defaults = { enabled: true, autoScroll: true, showDislike: false };
const controls = document.getElementById('controls');
const preferences = document.getElementById('preferences');
const status = document.getElementById('status');
const report = (message, error) => {
  if (error) console.error(error);
  status.textContent = message;
  status.toggleAttribute('data-error', Boolean(error));
};
const load = async () => {
  const settings = await chrome.storage.local.get(defaults);
  for (const key of Object.keys(defaults)) document.getElementById(key).checked = settings[key];
  preferences.disabled = !settings.enabled;
  controls.disabled = false;
};
controls.addEventListener('change', ({ target }) => {
  if (!(target.id in defaults)) return;
  chrome.storage.local.set({ [target.id]: target.checked }).then(() => report('Saved'), error => {
    load().catch(console.error);
    report('Could not save settings. Please try again.', error);
  });
});
// onChanged fires in this page too, so load() also refreshes the form after this page's own saves.
chrome.storage.local.onChanged.addListener(() => load().catch(console.error));
load().then(() => report(''), error => report('Could not load settings. Reopen this page to try again.', error));
