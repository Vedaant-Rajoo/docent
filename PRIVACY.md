# Privacy policy

Docent for YouTube is maintained by Vedaant Rajoo.

Last updated: October 18, 2026

Docent changes the layout of desktop YouTube. It uses information in your YouTube tab to display navigation, manage native panels, and provide playback controls. The extension has no developer-operated server or analytics service.

## Information used in your YouTube tab

Docent reads the current YouTube page address and video identifier to apply the right layout as you navigate. It uses YouTube's guide data to show subscribed channels in the rail, including channel names, identifiers, image URLs, and indicators for new videos.

The extension also uses player state, available video qualities, panel visibility, and transcript row positions. It handles clicks on page controls and the search keyboard shortcut to open panels and restore focus. Your browser's platform name determines whether the shortcut hint says Cmd or Ctrl. Docent does not keep a record of clicks, keystrokes, or videos watched.

This information stays in the tab's memory. Docent does not save a copy of YouTube page content in extension storage. Cached guide data can remain until the tab is closed or fully reloaded.

Comments, live chat, and Ask are YouTube's own components. Messages and questions you submit through those components go through YouTube. Docent does not extract their text or send a separate copy to its maintainer.

## Saved settings

Docent saves three preferences in `chrome.storage.local`:

- Whether Docent is enabled.
- Whether transcript auto-scroll is enabled.
- Whether YouTube's Dislike button is shown.

These preferences apply across YouTube tabs in the same Chrome profile. They remain after a browser restart. Docent does not use Chrome's sync storage or send these preferences to its maintainer.

## Requests to YouTube

While enabled, Docent can ask YouTube's existing guide service to load your subscriptions. It also displays channel images from the URLs YouTube supplies. These requests use your browser's existing YouTube session and can expose ordinary request information, such as your IP address, to YouTube and its image providers.

YouTube continues to handle video playback and interactions with its own features under [Google's privacy policy](https://policies.google.com/privacy). Docent does not read your passwords, authentication cookies, or sign-in tokens.

## How information is used and shared

Docent uses the information it accesses to provide its YouTube layout and controls. The extension does not transmit that information to its maintainer, sell it, or use it for advertising. It has no telemetry or automatic error-reporting service. It does not use information to assess creditworthiness or make lending decisions.

Docent's use of information follows the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/privacy), including its [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## Your choices and deletion

You can turn Docent off with its toolbar button or in its settings. Saved preferences remain while it is disabled.

Uninstall Docent to remove its local extension settings. Fully reload any open YouTube tabs to clear Docent's page scripts and cached page data. Removing Docent does not delete information held by YouTube, such as subscriptions, comments, or watch history.

## Questions and bug reports

You can ask questions or report problems through [GitHub Issues](https://github.com/Vedaant-Rajoo/docent/issues). Treat anything you post there as public. Do not include passwords, account details, private video links, or other personal information. The maintainer uses the details you choose to provide to answer questions and investigate problems. GitHub hosts those reports under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

If Docent's data handling changes, this policy will be updated with a new revision date.
