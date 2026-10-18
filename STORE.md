# Chrome Web Store submission

These fields describe the `0.1.0` code in this repository. Check them again if a release changes what Docent reads, saves, or sends.

## Single purpose description

Docent gives desktop YouTube a minimal layout for browsing and watching videos. Navigation stays in a compact rail, and YouTube's native panels share one column beside the player.

## Permission justifications

### Storage

Docent uses `chrome.storage.local` to remember whether its layout is enabled and whether transcript auto-scroll is enabled. These preferences apply across YouTube tabs in the same Chrome profile and remain after the browser restarts. Page content is not saved in extension storage.

### YouTube site access

Docent needs access to `https://www.youtube.com/*` to restyle YouTube pages, add navigation and player controls, and manage the shared panel column. It uses the current page address, native page and player state, and YouTube's guide data for these features. It does not run on other websites.

This access comes from `content_scripts.matches` in the manifest. The only entry in `permissions` is `storage`; there is no separate `host_permissions` entry. Docent does not request Chrome's `history`, `tabs`, or `cookies` permissions.

## Remote code

Select **No, I am not using remote code**.

Docent's JavaScript and CSS are included in the extension package. YouTube guide requests and channel image loads return page data or images. Player controls call YouTube's existing page APIs. Docent does not download or execute additional extension code.

## Data disclosures

Google requires disclosure of data handled locally, even when it is never sent to the developer. The selections below describe local access. Docent has no developer-operated server, analytics service, or automatic error reporting.

| Dashboard category | Select | What the code handles |
| --- | --- | --- |
| Personally identifiable information | Yes | Channel display names and identifiers from the subscription guide, including channels belonging to people. These are used for navigation in the rail. Docent does not ask for a name or email address or create a separate Docent account. |
| Health information | No | Docent does not request or extract health information about the user. |
| Financial and payment information | No | Docent does not request or extract payment or financial information. |
| Authentication information | No | Docent does not read passwords, authentication cookies, or sign-in tokens. YouTube's own guide requests can use the existing signed-in session. |
| Personal communications | No | Docent does not extract messages, Ask questions, or comment drafts. YouTube handles input to its native components. |
| Location | No | Docent does not request a location or use a location API. YouTube and its image providers receive ordinary network request information. |
| Web history | Yes | The current YouTube page address and video identifier are used to keep the layout in step with navigation. Docent does not read Chrome's history database or save a list of visited pages. |
| User activity | Yes | Page-control clicks, the search keyboard shortcut, player events, focus, and transcript position are handled in the tab to operate the interface. Docent does not log clicks or keystrokes. |
| Website content | Yes | YouTube guide data, channel image URLs, native panel structure, transcript row state, and player information are used to display the interface. No copy is saved in extension storage. |

The extension saves only its enabled and transcript auto-scroll preferences in `chrome.storage.local`. They are not synced by Docent. Page data is used in tab memory. Cached guide data can remain until the tab is closed or fully reloaded.

Requests to YouTube's guide service and channel image URLs go through the existing browser session. Interactions with native YouTube features continue to use YouTube's services. The extension does not send a separate copy of page data or preferences to its maintainer.

### Data-use certifications

The current code supports each of the dashboard's certifications:

- User data is not sold or transferred to third parties outside the permitted uses.
- User data is not used or transferred for purposes unrelated to Docent's single purpose.
- User data is not used or transferred to determine creditworthiness or for lending purposes.

Data accessed by Docent is used for its layout and controls. It is not used for advertising. A user may separately choose to submit a public GitHub issue; the maintainer uses those details to answer the report.

## Privacy policy and support links

Privacy policy: <https://github.com/Vedaant-Rajoo/docent/blob/main/PRIVACY.md>

Support: <https://github.com/Vedaant-Rajoo/docent/issues>

The policy file must be committed and reachable without signing in before using that URL in the Store. If the repository stays private, host the same policy on a public HTTPS page and use that address instead. Check that Issues is available to testers too.

## Reviewer instructions

1. Open desktop `https://www.youtube.com/` and choose YouTube's dark theme. Docent stays inactive in the light theme.
2. Open a video. Use its native chapter or transcript control when available. The selected component occupies the shared column. The Recommended button opens video recommendations.
3. Open Docent settings from the gear in its rail. Change transcript auto-scroll, then reload YouTube to confirm the setting is saved.
4. Click Docent's Chrome toolbar button to disable or enable its layout across open YouTube tabs.

Basic layout testing does not need a Docent account. Subscriptions need a YouTube account; chat, transcripts, chapters, and Ask depend on what YouTube provides for the account and video. Docent does not provide its own AI service.

## Policy references

- [Privacy practices fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data handling and privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
