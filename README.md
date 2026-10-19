# Docent for YouTube

Docent is a Chrome extension that gives desktop YouTube a smaller interface, with an icon rail and a shared column beside the video.

This is an alpha. It requires Chrome 111 or newer and YouTube's dark theme, and runs on `https://www.youtube.com/`.

## What it changes

- A compact header and navigation rail across YouTube. The rail includes library links and subscribed channels. Home categories keep YouTube's filters, with simpler styling.
- One watch panel at a time. Open Ask, chapters, transcripts, or comments through YouTube's own controls when available. A Recommended button in the header opens video recommendations.
- Live streams and videos with chat replay get a chat button in the header. Press a panel button to show or hide it; choosing another replaces the open panel. Playlists remain available through the video's More actions menu.
- The transcript follows the current line during playback. Hover over the transcript to read without automatic scrolling.
- A quieter player bar shows the current speed and resolution, each a list of the choices YouTube offers, followed by captions, picture-in-picture, YouTube's settings, and fullscreen. YouTube's autoplay toggle remains available.
- Closing the watch column gives the video its full width. The separate theater control is hidden. Fullscreen shows only the player.

The home header keeps YouTube's Create and notifications controls when available to your account. Press `Cmd+K` on macOS or `Ctrl+K` elsewhere to focus search, and press it again to leave search.

## Install

[Install Docent from the Chrome Web Store](https://chromewebstore.google.com/detail/docent-for-youtube/jgacckehokmmgehdilofhbjdknipfcbg) for automatic updates.

### Install without the Store

1. Download `docent.zip` from [GitHub Releases](https://github.com/Vedaant-Rajoo/docent/releases).
2. Extract it to a permanent folder. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Reload YouTube tabs and use YouTube's dark theme.

Updates to unpacked installs are manual. Replace the files in the same folder, reload Docent at `chrome://extensions`, then reload YouTube tabs. Keep that folder in place while Docent is installed. This package targets desktop Chrome; other browsers have not been tested.

### Install from source

There is no build step. Clone the repository, then follow steps 2 to 4 above with the cloned `docent` folder.

```sh
git clone https://github.com/Vedaant-Rajoo/docent.git
```

After updating the source files, click Reload on Docent's card at `chrome://extensions`, then reload YouTube.

## Controls and settings

Pin Docent from Chrome's Extensions menu. Click its toolbar icon to turn the layout off or on across your open YouTube tabs. An `OFF` badge appears while disabled.

Open settings from the gear at the bottom of Docent's rail, or right-click its toolbar icon and choose Options. Settings open in a separate tab. You can turn Docent off, disable transcript auto-scroll, or show YouTube's Dislike button there. Changes save locally in your Chrome profile.

## Known limitations

- The alpha focuses on YouTube's desktop home and watch pages. Mobile YouTube, embedded players, and YouTube Music are outside its scope.
- YouTube's light theme leaves Docent inactive. Some controls depend on YouTube's English labels.
- YouTube changes its page structure and tests different layouts. Updates can break parts of Docent.
- Ask, transcripts, chapters, chat, and other native features appear only where YouTube provides them. Docent does not add an AI service.
- New subscriptions appear in the rail after a page reload.

## Report a bug

[Open a GitHub issue](https://github.com/Vedaant-Rajoo/docent/issues) with your Chrome and Docent versions, the steps to reproduce, and what you expected to happen. Include the page type and video link if it is public and useful. Mention your YouTube language, window size, and any other extensions that change YouTube. A cropped screenshot can help with layout bugs.

Treat bug reports as public. Remove account details, private video links, and personal information from reports and screenshots.

## Check a change

With Node.js 26 installed, run this from the repository:

```sh
node check.js
```

The script checks settings, extension toggling, the player bar, chat and panel switching, transcript scrolling, and navigation using simulated browser APIs and page elements. Check layout changes on YouTube too; this script cannot verify how the page looks or whether YouTube has changed its markup.

## Privacy and license

Read the [privacy policy](PRIVACY.md) for details about page access and local settings. Docent is released under the [MIT license](LICENSE).

Docent is an independent project and is not affiliated with YouTube or Google.
