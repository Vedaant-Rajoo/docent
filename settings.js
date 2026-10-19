const defaults = { enabled: true, autoScroll: true, showDislike: false };
const controls = document.getElementById('controls');
const preferences = document.getElementById('preferences');
const status = document.getElementById('status');
const showError = error => {
  console.error(error);
  status.textContent = 'Could not save settings. Please try again.';
  status.toggleAttribute('data-error', true);
};
const load = async () => {
  const settings = await chrome.storage.local.get(defaults);
  for (const key of Object.keys(defaults)) {
    const input = document.getElementById(key);
    input[input.type === 'checkbox' ? 'checked' : 'value'] = settings[key];
  }
  preferences.disabled = !settings.enabled;
  controls.disabled = false;
};
controls.addEventListener('change', async event => {
  const input = event.target;
  if (!(input.id in defaults)) return;
  try {
    await chrome.storage.local.set({ [input.id]: input.type === 'checkbox' ? input.checked : input.value });
    preferences.disabled = !document.getElementById('enabled').checked;
    status.textContent = 'Saved';
    status.removeAttribute('data-error');
  } catch (error) {
    await load().catch(console.error);
    showError(error);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(defaults).some(key => key in changes)) load().catch(showError);
});
load().then(() => { status.textContent = ''; }).catch(error => {
  showError(error);
  status.textContent = 'Could not load settings. Reopen this page to try again.';
});
