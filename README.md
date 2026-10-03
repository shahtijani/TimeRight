# TimeRight

Accurate time zone and daylight-saving (DST) converter for Windows, macOS and the web. It never guesses DST: offsets come from the IANA time zone database, evaluated for the exact date you ask about.

- Live time, UTC offset, DST on/off and the next DST change for any of 400+ zones
- **Meeting Planner**: type "3:50 PM Sydney tomorrow" or "10am EST friday" and see everyone's local time, with DST status and working-hours strips
- Warns about times that don't exist (clocks spring forward) or happen twice (clocks fall back)
- Search by city, country, nearby city (Mumbai) or abbreviation (EST, IST, AEDT)
- Works offline, no accounts, no ads, no tracking

## Download
Get the latest installers from **Releases**:

| Platform | File |
|---|---|
| Windows | `TimeRight-<version>-win-x64.exe` (installer) or the portable `.exe` |
| macOS (Apple Silicon) | `TimeRight-<version>-mac-arm64.dmg` |
| macOS (Intel) | `TimeRight-<version>-mac-x64.dmg` |

The apps are not code-signed yet, so the first launch shows a warning:
- **Windows:** SmartScreen → *More info* → *Run anyway*.
- **macOS:** drag to Applications, then right-click the app → *Open* → *Open*. If macOS says it's damaged, run `xattr -cr /Applications/TimeRight.app`.

## Run from source
Requires Node.js 20+.
```
npm install
npm start
npm test
```

## Build installers
```
npm run dist:mac     # macOS dmg + zip (run on a Mac)
npm run dist:win     # Windows installer + portable (run on Windows; CI does this for you)
```
Pushing a tag like `v0.1.0` builds both platforms on GitHub Actions and attaches them to a Release:
```
git tag v0.1.0 && git push origin v0.1.0
```

## Website
The `renderer/` folder is a plain static site (no build step). `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main`
(Settings → Pages → Source: *GitHub Actions*).

## Project layout
- `renderer/core.js`: pure time/DST engine (no DOM), shared by desktop and web
- `renderer/locations.js` + `zones.js`: every IANA zone with country, ranked search
- `renderer/planner.js`: meeting planner logic and the natural-language parser
- `renderer/app.js`, `index.html`, `styles.css`: the UI
- `renderer/assets/flags/`: flag SVGs from [flag-icons](https://github.com/lipis/flag-icons) (MIT)
- `test/`: engine, search and planner tests (`npm test`)
- `build/`: app icon (`icon.svg` → `icon.png` via `npx electron build/render-icon.js`)

## DST notes
- DST is derived from the runtime's IANA rules, never hardcoded. Dates are interpreted in the meeting's own zone.
- Times that fall in a spring-forward gap are moved forward by the gap; repeated times let you choose which occurrence.
- `EST`/`PST`/`IST`-style abbreviations in search are shortcuts for the zones that use them; ambiguous ones list several.

## License
MIT. Flag artwork: MIT (flag-icons). Time zone data: IANA (public domain).
