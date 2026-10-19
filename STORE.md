# Chrome Web Store submission

These fields describe the `0.1.0` code in this repository. Check them again if a release changes what Docent reads, saves, or sends.

## Single purpose description

Docent gives desktop YouTube a minimal layout for browsing and watching videos. Navigation stays in a compact rail, and YouTube's native panels share one column beside the player.

## Permission justifications

### Storage

Docent uses `chrome.storage.local` to remember whether its layout is enabled, whether transcript auto-scroll is enabled, and whether YouTube's Dislike button is shown. These preferences apply across YouTube tabs in the same Chrome profile and remain after the browser restarts. Page content is not saved in extension storage.

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

The extension saves only its enabled, transcript auto-scroll, and Dislike button preferences in `chrome.storage.local`. They are not synced by Docent. Page data is used in tab memory. Cached guide data can remain until the tab is closed or fully reloaded.

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

## Release automation

The initial release is [published in the Chrome Web Store](https://chromewebstore.google.com/detail/docent-for-youtube/jgacckehokmmgehdilofhbjdknipfcbg). These identifiers belong to this Store item:

- Publisher ID: `a4703a5d-1aa1-41ad-8169-efffa966d661`
- Extension ID: `jgacckehokmmgehdilofhbjdknipfcbg`
- Google Cloud project ID: `docent-publisher`
- Google Cloud project number: `546702080528`
- Service account: `docent-publisher@docent-publisher.iam.gserviceaccount.com`

The project ID and project number were verified in Google Cloud Console.

### Keyless authentication

The [identity pool](https://console.cloud.google.com/iam-admin/workload-identity-pools/pool/docent-github?project=docent-publisher) and service account binding are configured. The provider is `projects/546702080528/locations/global/workloadIdentityPools/docent-github/providers/github`. It accepts GitHub's OIDC issuer for repository ID `1422969692`, owner ID `33187221`, and `.github/workflows/release.yml`. Publishing is limited to the repository owner's manual runs on `main` and release events on protected `v*` tags. PR jobs have read-only permissions and cannot authenticate to Google Cloud. The service account grants `roles/iam.workloadIdentityUser` to that repository in the pool.

The IAM Service Account Credentials, Security Token Service, and Chrome Web Store APIs are enabled. The service account is linked under the Store dashboard's **Publisher > Settings > Service account**. No service account key or GitHub secret is required.

### Run a release

Once `.github/workflows/release.yml` is committed to `main`, contributors open PRs and the **Checks** job runs automatically. The `main` ruleset requires passing checks and one approving review; the repository owner can bypass it. Release tags matching `v*` can only be created, updated, or deleted by the owner. Add other trusted maintainers to the rulesets, workflow guard, and Cloud trust when needed.

To publish a new version:

1. Increase `manifest.json`'s version and merge the reviewed changes to `main`.
2. Create a GitHub Release with a matching tag, such as `v0.1.1` for version `0.1.1`. Target a commit on `main`; GitHub can generate the release notes.
3. Publish the release. The workflow validates the version and commit, checks the extension, builds `docent.zip` from the tagged files, and attaches it to the release.
4. For a stable release, the workflow uploads that same ZIP and submits it to Google. Google publishes it after approval using the existing distribution settings. A GitHub pre-release gets the ZIP only. Use the pre-release checkbox with a numeric tag; Chrome versions do not accept suffixes such as `-beta`.

The ZIP is available even if the Store step fails. Retries compare any existing `docent.zip` with the reproducible package and never replace a different asset. The Store guard still refuses to replace a pending review or staged submission. Publishing a GitHub Release does not cancel Google's review.

Manual controls remain under GitHub **Actions > Chrome Web Store > Run workflow**, on `main`:

- `status` is the default. It verifies authentication and reads the Store item without changing it. Run this first.
- `upload` checks and packages the committed extension, then uploads a draft without submitting it for review.
- `publish` uploads the package and submits it for review. Google publishes it after approval using the item's existing distribution settings.

Review changes visually on YouTube and update the privacy disclosures if data handling changes before publishing. Unpacked installs use the GitHub ZIP and need manual updates; see the README. Release creation and version selection remain manual. A release created by another workflow using `GITHUB_TOKEN` does not trigger this release workflow; keep publishing in that workflow if release creation is automated later.

Run `python3 .github/check-release.py` to check reproducible packaging, version and commit validation, asset retries, and Store behavior with mocked responses. This check needs Git, Bash, and `jq`, which are available on the GitHub runner.

Authentication uses [Workload Identity Federation through the service account](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account). Upload and publishing use the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).

## Policy references

- [Privacy practices fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data handling and privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
