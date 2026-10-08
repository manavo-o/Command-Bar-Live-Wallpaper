# Agent instructions

## Project

Command Bar + Live Wallpaper is a Manifest V2 browser extension written in plain JavaScript, HTML, and CSS. It provides a command bar overlay and a customizable new-tab page.

## Layout

- `manifest.json`: extension configuration and background script load order.
- `background/`: background events, messaging, suggestions, and tab actions.
- `command-bar/`: command bar UI, search, keyboard shortcuts, and calculator logic.
- `newtab/`: new-tab widgets, wallpaper, effects, and lifecycle management.
- `options/`, `options.html`, and `options.css`: settings UI.
- `shared/`: storage, migrations, URL utilities, rotation, and shared styles.
- `docs/`: performance verification and diagnostics.

## Working conventions

- Follow the existing plain JavaScript patterns and keep changes focused on the requested behavior.
- Preserve script load order and shared runtime dependencies when changing bootstraps or the manifest.
- Keep storage keys, defaults, and migrations consistent when changing persisted settings.
- Consider cleanup of event listeners, timers, and media resources when changing UI lifecycle behavior.
- Avoid introducing dependencies or a build system unless the task requires them.

## Verification

- Run `npm test` for relevant JavaScript behavior changes.
- Run `npm run check` after editing the scripts covered by that command.
- For UI or browser API changes, reload the extension and manually verify the affected flow when a compatible browser is available. Report any manual checks that could not be performed.
- Consult `docs/performance-verification.md` when investigating performance or lifecycle issues.
