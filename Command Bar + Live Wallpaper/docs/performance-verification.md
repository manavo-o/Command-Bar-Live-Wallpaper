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
