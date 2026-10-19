# Docent for YouTube

Docent is a Chrome extension that gives desktop YouTube a smaller interface, with an icon rail and a shared column beside the video.

This is an alpha. It requires YouTube's dark theme and runs on `https://www.youtube.com/`.

## What it changes

- A compact header and navigation rail on the home and watch pages. The rail includes library links and subscribed channels. Home categories keep YouTube's filters, with simpler styling.
- One watch panel at a time. Open Ask, chapters, transcripts, or comments through YouTube's own controls when available. A Recommended button in the header opens video recommendations.
- Native live chat and playlists use the same space. When available, you can return to them through the video's More actions menu.
- The transcript follows the current line during playback. Hover over the transcript to read without automatic scrolling.
- Player controls include a speed button that cycles through 1×, 1.25×, 1.5×, and 2×, plus a resolution list using the qualities YouTube provides. YouTube's autoplay toggle and settings remain available.
- Theater mode hides the watch column. Fullscreen shows only the player.

The home header keeps YouTube's Create and notifications controls when available to your account. Press `Cmd+K` on macOS or `Ctrl+K` elsewhere to focus search.

## Install

[Install Docent from the Chrome Web Store](https://chromewebstore.google.com/detail/docent-for-youtube/jgacckehokmmgehdilofhbjdknipfcbg) for automatic updates.

### Install without the Store

1. Download `docent.zip` from [GitHub Releases](https://github.com/Vedaant-Rajoo/docent/releases).
2. Extract it to a permanent folder. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Reload YouTube tabs and use YouTube's dark theme.

Updates to unpacked installs are manual. Replace the files in the same folder, reload Docent at `chrome://extensions`, then reload YouTube tabs. Keep that folder in place while Docent is installed. This package targets desktop Chrome; other browsers have not been tested.

### Install from source

There is no build step.

1. Get a source copy of Docent and extract it. If you have access to this repository, you can clone it:

   ```sh
   git clone https://github.com/Vedaant-Rajoo/docent.git
   ```

2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Choose **Load unpacked** and select the `docent` folder containing `manifest.json`.
4. Reload any open YouTube tabs. Set YouTube's Appearance to **Dark theme** if the layout does not appear.

After updating the source files, click Reload on Docent's card at `chrome://extensions`, then reload YouTube.

## Controls and settings

Pin Docent from Chrome's Extensions menu. Click its toolbar icon to turn the layout off or on across your open YouTube tabs. An `OFF` badge appears while disabled.

Open settings from the gear at the bottom of Docent's rail, or right-click its toolbar icon and choose Options. Settings open in a separate tab. You can turn Docent off, disable transcript auto-scroll, or show YouTube's Dislike button there. Changes save locally in your Chrome profile.

## Known limitations

- The alpha focuses on YouTube's desktop home and watch pages. Mobile YouTube, embedded players, and YouTube Music are outside its scope.
- YouTube's light theme leaves Docent inactive. Some controls depend on YouTube's English labels.
- YouTube changes its page structure and tests different layouts. Updates can break parts of Docent.
- Ask, transcripts, chapters, chat, and other native features appear only where YouTube provides them. Docent does not add an AI service.
- New subscriptions appear in the rail after a page reload. Notes are not implemented.

## Report a bug

[Open a GitHub issue](https://github.com/Vedaant-Rajoo/docent/issues) with your Chrome and Docent versions, the steps to reproduce, and what you expected to happen. Include the page type and video link if it is public and useful. Mention your YouTube language, window size, and any other extensions that change YouTube. A cropped screenshot can help with layout bugs.

Treat bug reports as public. Remove account details, private video links, and personal information from reports and screenshots.

## Check a change

With Node.js 26 installed, run this from the repository:

```sh
node check.js
```

The script checks settings, extension toggling, transcript scrolling, and panel switching using simulated browser APIs and page elements. Check layout changes on YouTube too; this script cannot verify how the page looks or whether YouTube has changed its markup.

## Privacy and license

Read the [privacy policy](PRIVACY.md) for details about page access and local settings. Docent is released under the [MIT license](LICENSE).

Docent is an independent project and is not affiliated with YouTube or Google.
