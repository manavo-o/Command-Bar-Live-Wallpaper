# Command Bar + Live Wallpaper

Manifest V2 browser extension with a command bar and customizable live-wallpaper new-tab page.

## Download and install

Download `command-bar-live-wallpaper-v1.6.0.zip` from [Releases](https://github.com/manavo-o/Command-Bar-Live-Wallpaper/releases/latest), then extract it. In a browser that supports Manifest V2, open the extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.

For an existing unpacked installation, replace its files and reload the extension. Refresh open pages to load the updated command bar. Wallpaper media and settings remain in the browser profile; they are not bundled in the download.

## Development

Source lives in `Command Bar + Live Wallpaper/`. From that directory, run `npm ci`, `npm run build`, `npm test`, and `npm run check`. The checked-in production bundle allows the extension download to run without Node.js or an install step.

See `docs/performance-verification.md` in the source directory for verification details and manual-testing limits.
