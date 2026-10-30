# Performance verification

## Implemented and checked

- `npm test`: 25 passing checks, including database commit/abort cleanup, wallpaper races and video teardown, hidden/resumed/pagehide lifecycles, stable rotation, schedule boundaries, focus restoration, weather cache/request races, query-cache eviction, history ranking equivalence, and concurrent background loads/writes.
- `npm run check` and `node --check db.js`: passed.
- Reloaded the installed unpacked extension in Helium from this workspace and checked new-tab rendering: wallpaper, clock/date, weather, and quote appeared.
- History capacity remains 100,000 entries. Every entry is considered for history searches; a bounded worst-first heap selects the requested results using the existing scoring and tie-breaks. Temporary response caches retain 20 queries each.

## Browser measurements still required

No comparison with the pre-optimization build, 60-minute memory plateau, or GPU/decoder measurements has been established. The brief browser smoke check is not a performance benchmark. The browser registers the user’s command-bar shortcut as Command+T; end-to-end shortcut behavior and the complete manual feature matrix remain unverified.

The user removed “Always active Window - Always Visible” before the October 3 retest; it was absent from the browser shortcut inventory.

### Live retest after removal

Helium Task Manager, same new-tab process (PID 25611), existing wallpaper and effects:

| State | CPU displayed | Memory footprint |
| --- | --- | --- |
| Visible, animations running | 18.2%, then 17.6% | 163 MB, then 166 MB |
| Hidden behind the Extensions tab | 0.0% | 160 MB |
| Hidden, additional 30-second sample | 0.0% | 160 MB |

Returning to the new tab restored the wallpaper/widgets and updated the clock immediately. These are brief live samples of the optimized build, not a before/after benchmark or proof that long-term memory growth is eliminated. Task Manager footprint differs from the tab-strip memory estimate. CPU displayed as 0.0% is rounded, not proof of absolutely zero work.

Use identical browser version, viewport, media files, settings, and unrelated tabs for both builds. Preserve the wallpaper library and history. Test images and videos separately, with effects both enabled and disabled.

1. Capture Task Manager CPU and renderer memory, Performance Monitor JS heap/DOM nodes, heap snapshots after collection, and media-player/decoder information. Record the initial warm-up separately.
2. Run a 60-minute visible-idle test and a 60-minute hidden-tab test, sampling at 5, 15, 30, and 60 minutes. Visible animations should continue. Hidden display tasks should stop.
3. Repeat with five new tabs; perform 100 wallpaper replacements, rapid schedule/settings changes, repeated command-bar open/search/close cycles, and hide/show cycles.
4. Compare retained objects after collection. Require no accumulating media elements, object URLs, database connections, or response-cache entries. Browser renderer/GPU memory can retain allocator capacity; investigate a sustained slope rather than expecting immediate return to initial RSS.
5. Target at least 80% lower hidden CPU where the old baseline is measurable. Report absolute CPU as well as relative reduction. Do not claim this target is met until measured.
6. Verify uploads/deletion/backup, sequential and shuffle rotation, day/night and sunrise schedules, playback speed/filters, effects, widget dragging, focus controls, weather/quote, old history destinations, autocomplete, actions, and shortcuts. Do not change persistent user settings just to run the matrix without preserving/restoring them.


## Dark Spotlight refinement — October 11, 2026

- `npm test`: 53 passing checks. Added result-motion coverage for interrupted height/selection transitions, stale completions, reduced motion, animation failures, stalled-animation watchdogs, and pagehide cleanup.
- `npm run check`: passed. Runtime and source copies of command-bar CSS are identical.
- Reloaded the installed unpacked extension in Helium. Checked the command bar on the live-wallpaper new tab and an ordinary dark webpage, including keyboard selection, calculator results, async dictionary/suggestion results, scrolling past a large dictionary card, dismissal, and reopening. Material and highlight alignment remained readable and correctly positioned in these checks.
- Compact density, narrow/short viewports, a bright webpage, native reduced-motion settings, sustained held-key input, and a forced empty-result state were not manually verified. Automated reduced-motion checks passed. The UI smoke checks do not establish frame-time, CPU/GPU, or long-term memory performance.

## Destination deduplication, site icons, and widget dashboard — October 15, 2026

### Implemented

- Destination identity preserves protocol, host distinctions, path case, query strings, and fragments. Repeated destinations collapse across empty-query tabs, unified search, bookmarks, and grouped history before result limits are applied. Ranking storage keys remain compatible.
- Merged results retain source badges and eligible tab metadata. Execution rechecks tabs in the selected window scope, focuses a deterministic match, and falls back once if tabs close.
- Site icon resolution runs outside the search critical path. Individual icons return independently; stale replies cannot paint another query. Local SVG fallbacks reserve consistent icon space.
- The background resolver uses persistent image caching, tab favicon URLs, the MV2 browser favicon endpoint, and site-declared icons, preferring valid SVGs. The MV2 manifest includes `chrome://favicon/`. Network requests omit credentials and referrers; origin discovery does not fetch a history result's private path or query. There is no third-party favicon service.
- Icon work is limited to four concurrent lookups and 64 queued lookups. Fetches time out after three seconds, tab declarations and browser-cache reads after one second. Individual image bodies are capped at 128 KiB; HTML at 256 KiB. Positive entries expire after seven days; failures after six hours. The persistent cache is limited to 256 entries and 4 MiB and excluded from profile export. Incognito tab requests bypass the persistent resolver.
- Options now use a single grouped settings style with responsive navigation, accessible controls, visible range values, save/error feedback, numeric validation, and functional settings filtering with an explicit empty state. Upload/import actions are keyboard-accessible buttons.
- The new-tab page groups clock/date, weather, focus, and quote in one responsive dashboard. Pointer and keyboard positioning, cancellation, release settling, reset, resize clamping, and lifecycle cleanup are implemented. Storage schema 5 migrates old clock placement while retaining favorites and disabled actions.

### Verified

- `npm test`: 82 passing tests. Added coverage for destination identity and merging; empty/unified/scoped searches; closed-tab fallback; stale icon responses; cache reuse, persistence, negative expiry, size, and concurrency; dashboard movement, cancellation, interruption, reset, resize, hide/resume, and disposal; settings filtering and write feedback; storage migration.
- `npm run check`: passed. Additional `node --check` checks cover the site-icon resolver, dashboard controller, result-merging module, history module, and storage migration.
- Static HTML checks confirm balanced layout containers, unique IDs, and existing script resources. Background resources and the new-tab dependency order were checked. Command-bar CSS source/runtime copies remain identical.
- Reloaded the unpacked extension in Helium from this workspace and visually reviewed the base options redesign and Widgets preview in dark mode. The existing wallpaper library and widget settings remained visible. This review preceded the final accessibility, cache-adapter, and integration refinements.

### Remaining browser checks

Further direct extension-page inspection was rejected by the browser tool's URL policy, which permits HTTP(S) page access but blocks acquiring an extension page. No alternate access method was used after that rejection.

Reload the extension again and refresh existing new-tab/ordinary pages to load all final scripts. Verify:

1. The actual dashboard on bright/busy wallpaper, pointer movement and keyboard save/cancel, Reset Position, and all widget visibility combinations.
2. Focus start/reset, weather loading/cached/error states, hidden-page resume, and reopening the dashboard's Widgets settings link.
3. Repeated URLs across tabs/history/bookmarks in both window scopes; changing fragment routes and query strings; switching to an existing tab and closing it before execution.
4. Browser-cache favicon access in this MV2 browser, live SVG discovery and malformed/failed-icon fallbacks, warm-cache reuse, and scrolling through scoped results.
5. Light mode, narrow/short viewports, 200% zoom, and native reduced-motion/transparency/high-contrast preferences.

The automated checks and initial options review do not establish live favicon endpoint compatibility, complete visual acceptance, frame-time/CPU/GPU performance, or long-term memory behavior. Use the measurement procedure above for those claims.

### Dashboard density refinement — October 15, 2026

- Reduced maximum dashboard width from 560px to 360px, lightened the outer material, removed nested card boxes, and tightened widget spacing. The clock is smaller with a secondary AM/PM label; weather cache status is in a tooltip, and unknown quote attribution is hidden.
- Move/settings controls reveal on hover or keyboard focus and remain visible on touch/coarse-pointer devices. Widgets without a clock/date header reserve clearance for those controls.
- `npm test`: 82 passing; `npm run check` passed. Live visual review of this refinement remains unverified under the browser URL restriction described above; reload the extension and refresh the new-tab page to review.

### Word lookups: synonyms and spelling (October 15)

- Added prefix/suffix `syn`, `synonym`, and `synonyms` commands, alongside definition prefix/suffix commands. Common explicit command typo aliases are normalized locally before messaging; ordinary searches are not fuzzy-matched against short commands.
- Explicit word lookups first consult Datamuse spelling matches, preserve exact matches, and conservatively correct nearby misspellings before requesting definitions or synonyms. Corrections are visible in the answer card. Short words, phrases, distant suggestions, and failed spelling checks preserve the input.
- Synonyms use Datamuse `rel_syn` (documented at https://www.datamuse.com/api/); definitions continue using FreeDictionaryAPI. Enter copies synonym results. API strings render as text, with separate empty and unavailable states.
- Requests have four-second abort timeouts, omit credentials/referrers, share pending lookups, and cache at most 128 results in memory (one hour success / thirty seconds failure). Late replies remain guarded by the current query token.
- `npm test`: 89 passing; `npm run check` plus syntax checks of the new dictionary module, query intent, and card renderer passed. Added coverage for routing/aliases, exact-word preservation, correction ordering, request sharing/cache, service failures, invalid input, stale replies, and safe card rendering.
- Live extension validation remains unperformed under the previously recorded extension-page browser policy restriction. Reload the extension and refresh the page, then check `calm syn`, `calm synonym`, `beutiful def`, `beutiful syn`, and Enter-to-copy in the command bar.

### Background preload warning fix (October 15)

The icon resolver no longer fetches or parses website home-page HTML. This supersedes the earlier home-page fallback described above: cached icons, declared icons read from open tabs, and direct favicon.svg/favicon.ico requests remain. Icon requests reject redirects and discard HTML responses before reading/parsing them, avoiding document/login fallbacks. Settings network disclosure now reflects this behavior. The pasted background preload warnings are consistent with resource discovery during HTML parsing; their disappearance has not been verified in a live extension session due to the previously recorded browser restriction.

Verification: 91 tests pass; npm run check and the site-icon module syntax check pass. Regression tests assert no home-page requests, no HTML parsing/body reads, redirect rejection, and continued open-tab SVG discovery. After reloading the extension, clear historical entries from chrome://extensions and inspect newly generated warnings while searching.

## Obsolete-code cleanup and local math formatting — October 16, 2026

- Removed 30 flag-only placeholder modules, the unused URL utility, duplicate command-bar CSS, obsolete message handlers and exports, unused tokens and shared loads, and filesystem metadata files. The real widget, background, options, and command-bar implementations remain in their bootstraps and active helpers.
- Removed Desmos and all remote math loading. Removed Perplexity and the explicit provider/API-adapter system. Questions/tasks still use browser-default search; ordinary searches use Google; Shift+Enter forces Google. Custom URL engines retain Ctrl/Alt/Meta shortcuts.
- Storage schema 6 removes obsolete settings and API-only engine entries, retains URL engines without obsolete provider metadata, and preserves old dashboard placement without resurrecting a schema-5 reset. Import/export filters obsolete settings and provider metadata. Migration marks completion only after successful writes and key removal.
- Local math parsing produces a syntax tree shared by evaluation and safe DOM rendering. Cards display powers, fractions, roots, symbols, equations, lists, grouped numbers, and scientific notation. Unsupported symbolic equations show a preview; numeric errors cannot be copied. Plain Enter copies math/dictionary cards without requiring arrow selection; copying math uses ungrouped plain text.
- Suggestion promotion is now connected through the runtime search facade.

Verification: 100 automated tests pass; `npm run check` and syntax checks of every remaining JavaScript file pass. Entry-point tests verify existing resources and renderer/migration load order. HTML checks verify balanced tags and unique IDs. Added tests cover arithmetic precedence and negative exponents, symbolic previews, equations, numeric formatting/copying, malformed input, safe accessible math rendering, actual Enter routing, schema migration/retry, profile filtering, and synchronous search integration.

Live Helium verification: reloaded the installed unpacked extension from this workspace. Reviewed nested powers/fractions/roots on the new-tab page and quadratic solutions in an ordinary-page overlay. Verified grouped `1,000,000` displays and copies as `1000000` with plain Enter, without opening a search. Verified a question displays browser-default routing and opens a ChatGPT search URL. Reviewed the working Widgets and Command Bar settings pages, including retained routing radios, URL-engine controls, and action list. Existing wallpaper/dashboard/weather remained present.

Custom-engine execution, profile import/export, invalid-result copying, and keyboard-routing combinations are covered automatically; their complete live matrix, narrow/zoom layouts, long-expression scrolling, and performance benchmarks were not manually verified in this pass. No new performance claim is made.

## React command bar and liquid glass — October 28, 2026

### Implementation

- React owns the command-bar shell and keyed result rows, with an uncontrolled input and a controller/view adapter. Search, ranking, URL routing, execution, storage, and asynchronous query guards remain in the controller. Existing math/dictionary renderers use isolated React card containers.
- Two decorative surfaces in the outer closed shadow root blur the actual webpage. Interactive controls remain inside the protected iframe. Geometry follows painted surface bounds during opening, closing, resizing, and result transitions; the sampler stops when transitions finish and disconnects when closed.
- Math and explicit dictionary answers share an enclosure with the input. Dictionary previews retain attribution, spelling correction, and full details through a disclosure. Other matches remain available through Show Results or keyboard navigation. Math includes an accessible copy button using the existing execution path.
- The caret uses a faint halo without a duplicate solid stroke. On browsers supporting `caret-animation: manual`, the real caret color and halo opacity share a Web Animations timeline/start time. Selection, composition, blur, page hiding, reduced motion, and increased contrast cancel the effects and restore the native caret. Unsupported browsers keep the native caret.
- Glass falls back to opaque material when backdrop filtering is unavailable or reduced transparency/increased contrast is requested. No new permissions, remote scripts, storage keys, or migrations were introduced.

### Build and automated verification

Install development dependencies with `npm ci`, then run `npm run build`, `npm test`, and `npm run check`. Use `npm run watch` while editing the React presentation. Reload the unpacked extension and refresh affected pages after rebuilding. The bundled file is included so loading the extension does not require a build. Exclude `node_modules` from any release archive; retain the bundle and its license notices.

- 123 tests pass, including React/controller integration in a real DOM environment, persistent input/focus/selection, safe result rendering, keyed rows, asynchronous icons, isolated card updates, answer expansion, glass geometry, interruptible motion, caret synchronization/fallback, and resource cleanup.
- An iframe integration test confirms input/keyboard events do not reach host-document capture listeners and IME intermediate text/Enter cannot execute a command.
- `npm run build` and `npm run check` pass. The bundle contains production React/React DOM and is loaded before the bootstrap in both new-tab and injected-page entry points.

### Live review

Reloaded the installed unpacked extension in Helium from this workspace. Reviewed ordinary dark-page rendering and the live-wallpaper new-tab page, including calculator rendering, dictionary loading/success, the compact unified answer enclosure, Show Results expansion, dismissal/reopening, and the revised subtle caret. Background wallpaper colors remained visible through the material.

A temporary bright gradient page with host-document capture listeners was used to check readability, cursor movement, deletion, and typing isolation. The host counter stayed at 2 (the opening shortcut events) while typing `test input`, moving Left, and deleting inside the command bar. This is a focused live privacy check, not a complete adversarial test.

Native IME, compact density, narrow/short viewports, browser zoom, operating-system reduced motion/transparency/high contrast, sustained held-key navigation, all clipboard paths, and frame-time/CPU/GPU/memory benchmarks were not fully manually verified. Automated fallback and lifecycle checks do not establish those browser or performance results. The earlier performance measurement procedure still applies.

## Inline AI, caret glow, and URL navigation — October 28, 2026

- AI intent now exposes a ChatGPT SVG submit button inside the input. The browser-default AI action remains the internal default for Enter, without a visible AI result row or browser-default label. Suggestions retain their indices, keyboard selection, and execution. Empty result panels and their glass plates are hidden.
- AI mode adds two soft border ripples, disabled during dismissal/page hiding and replaced by static illumination under reduced motion. The caret has a stronger white/blue halo in every mode and blinks normally; editing restarts its blink without restarting on idle renders. Reduced motion uses a steady caret. Selection, composition, blur, high contrast, measurement failures, and teardown restore the native caret.
- Plain Enter recognizes HTTP(S) URLs, bare domains, IPv4 addresses, and localhost addresses before search routing. Bare addresses use HTTPS. Complete URL queries display an Open action and are not replaced by website autocomplete or promoted suggestions. Shift+Enter still forces Google; configured custom-engine shortcuts retain search behavior. URL intent remains navigation in prefer-AI mode. Unsupported schemes, credentials, whitespace, and invalid addresses do not become navigation targets.
- Build, full automated suite, and syntax checks pass. Coverage includes inline AI submission, suggestion indices, stale replies, direct URL Enter routing, modifier precedence, caret editing/fallback/cleanup, and hidden result-glass lifecycle.
- Live Helium review: reloaded the unpacked extension; verified inline AI button, missing AI row, suggestions and keyboard selection on the extension new-tab page. Clicking Ask AI opened a browser-default ChatGPT query. On an ordinary page, verified `gmail.com` displays Open and Enter navigates to Gmail rather than Google search. The stronger blinking-caret revision was loaded for this ordinary-page check.
- Narrow/zoom layouts, native IME, OS accessibility settings, long-input scrolling, and performance benchmarks were not manually verified; automated lifecycle/fallback checks do not establish those results.

## Independent widgets, settings consolidation, and motion — October 29, 2026

### Implementation

- Settings now have five sections: Wallpaper, Widgets, Command Bar, Backup, and About. Wallpaper uses Library, Playback & Effects, and Rotation & Schedule disclosures. Old library/effects/rotation links open their corresponding disclosure. Search opens matching disclosures and reveals dependent controls, then restores disclosure state when cleared.
- The options preview and new-tab widgets share static markup and styles. Preview weather is explicitly sample data and makes no network requests. Visibility, time format, weather units, and focus duration update the preview. Secondary widget configuration is shown when relevant.
- Clock/date, weather, focus, and quote are independent calm glass cards. Edit Layout exposes pointer/keyboard handles, alignment guides, Done, Cancel, and draft Reset. Placement uses an 8px grid and nearby edge/center alignment. Narrow viewports stack cards in a scrollable column without changing desktop positions. Saving failures keep the draft available for retry.
- Storage schema 7 adds normalized per-card widgetLayout positions. Legacy dashboard placement is converted after measurement; card minimum heights reserve room while data loads. Existing normalized layouts are retained, explicit resets cannot resurrect legacy positions, and layouts participate in allowlisted profile import/export. Partial profiles without layout fields do not reset placement.
- Timer mutations use one serialized background queue. Pause preserves remaining time and focus/break mode; Resume establishes a fresh deadline. Existing timestamp states remain readable. Duplicate expiration requests cannot advance the next session. The timer has a quiet progress ring, and weather retains a matching cached reading when refreshing fails.
- Command-bar layout, typography, icons, controls, ordering, caret glow, and glass material are retained. Motion changes refine the bounded 320ms opening spring, use 160ms dismissal and 120ms selection movement, animate answer disclosures, and add brief existing-button press feedback. Repeated selection paints do not restart a glide. Enabling reduced motion cancels transient effects and settles surfaces.
- New widget/settings animations are finite, respect reduced motion, and cancel on hiding or teardown. Glass has opaque accessibility/unsupported-browser fallbacks. No dependencies or extension permissions were added.

### Automated verification

- npm run build: passed.
- npm test: 140 passing tests. Coverage includes independent layout draft/save/cancel/reset, snapping, keyboard/pointer cancellation, viewport changes, disabled widgets, late initial reads, measured migration, failed saving, lifecycle cleanup, schema migration/retry, profile round trips, preview behavior, dependent settings/search, timer pause/resume and competing background requests, cached-weather failure, disclosure expansion, repeated selection paints, and reduced-motion changes.
- npm run check: passed; the command now includes the new layout, shared cards, timer, and background timer scripts.
- Both HTML entry points were checked after shared-card rendering for unique IDs, required widget elements, and existing script/style resources. Entry-point dependency-order regression tests pass.

### Live review and remaining checks

Reloaded the installed unpacked extension in Helium and reviewed the five-section settings UI, shared sample preview, and independent widgets over the existing live wallpaper. Verified that Edit Layout on New Tab opens the editor, keyboard arrows move the focused card, and Escape exits while cancelling the draft.

This live review found first-measurement crowding between weather and quote. The final source reserves card heights and delays legacy normalization until a render frame; automated coverage verifies delayed measurement. Those final sizing changes have not been rechecked in the live extension.

Further direct extension-page access was rejected by the browser tool's URL policy. No attempt was made to bypass that restriction. Final live timer pause/reload/resume, pointer save/reset, narrow/zoom layouts, bright wallpaper, OS accessibility preferences, and ordinary-page command-bar checks remain outstanding. Reload the extension and refresh affected pages to load the final source. The live review and automated tests do not establish frame-time, CPU/GPU, or long-term memory results; use the measurement procedure above for those benchmarks.


## Command-bar liquid motion — October 29, 2026

- Added a finite neutral reflection sweep and pointer-following highlights to the host glass surfaces without changing their base colors or blur. Pointer updates coalesce into one frame; no new idle loop is used. Closing, pointer exit, blur, hidden pages, accessibility preference changes, and teardown reset reflections.
- Refined the opening spring to 360ms with a 28ms results stagger, added temporary stretch to the 240ms selection glide, and added a 160ms fade-and-rise for inserted rows. Dismissal remains 160ms, and result height changes remain independent of entrance transforms.
- `npm run build`, `npm test` (156 passing tests), and `npm run check` passed. Automated coverage includes reflection coalescing, hidden-page suspension, preference changes, exit suppression, cleanup, rapid selection retargeting, and interrupted opening/closing.
- Reloaded the installed extension in Helium and checked command-bar opening on an ordinary page, typing, rapid arrow-key selection, calculator mode and return to search, and Escape dismissal. Settled surfaces retained their layout and dark palette.
- Narrow viewports, dictionary disclosure/scrolling, OS accessibility settings, and visual timing of rapid opening reversals remain unverified manually. This smoke check does not establish frame-time, CPU/GPU, or long-term memory performance.
