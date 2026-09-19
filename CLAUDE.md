# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is the same document for Codex. The two files are byte-identical apart
from the three header lines above — **edit both together, or they drift.**

## What this is

A football **agent** simulation — you manage players' careers, not a club. Text-based,
mobile-first, runs entirely client-side and offline. Turkish and English.

Public MIT repo, still in development. Android/iOS store releases are planned, so
anything committed here is visible to the world.

## Commands

```bash
npm run themes       # css/themes/*.css → css/style.css   (REQUIRED after any CSS edit)
npm run dist         # themes + build.js + check-dist.js → dist/menajer.html (fails on a broken bundle)
npm run www          # themes + build-www.js → www/         (what Capacitor packages)
npm run serve        # local server on :5173

npm run android:apk  # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:aab  # → android/app/build/outputs/bundle/release/app-release.aab (must be signed)
npm run android:sync # refresh www/ into the Android project after code changes

node tools/build-geo.js   # → js/worldgeo.js (map geometry; dev-only, downloads once)
```

**`android/` is checked into the repo** — it is a source artifact, not build output,
and it is where every future native change has to live (signing config, `versionCode`,
manifest meta-data, icons, ProGuard). The flow is one-way:
`npm run www` → `npx cap sync android` → Gradle. `cap sync` only refreshes the web
assets and the four generated paths listed in `android/.gitignore`; it never touches
the Gradle files, the manifest or `res/`.

**Never run `npx cap add android`.** It regenerates the project from the Capacitor
template and silently deletes everything written on the native side. There is no
`android:add` script any more, for that reason. A damaged folder is repaired with
`git checkout -- android`, not by regenerating it.

GitHub Actions (`.github/workflows/android.yml`) builds a debug APK on every push to
`main` and on manual dispatch — use it instead of installing Android Studio. It runs
`cap sync` on the committed project and fails if the sync leaves any diff under
`android/`, so the project in the repo and the project that gets built cannot drift.

There is **no test runner, linter or formatter** in the repo. See *Verifying changes*
below for how work actually gets checked.

## Architecture

### No build system — script order is the dependency graph

Plain HTML/CSS/JS. No framework, no bundler, no runtime dependencies. Everything is a
global, loaded in the order listed in `index.html`. A function defined in `ui.js` can
call one from `core.js` because `core.js` loaded first — nothing enforces this, so
load order is the contract.

**Adding a JS file means updating four places, or things break silently:**

1. `index.html` — `<script>` tag, in the right position
2. `build.js` — the `order` array (single-file build)
3. `sw.js` — the `SHELL` array, **and bump `CACHE`** (otherwise offline users get a
   stale shell missing the new file)
4. `tools/savetest.js` — the `FILES` array. This one fails quietly in the other
   direction: the headless harness still boots, but the new file is simply absent, so
   every test that touches it passes by not running it.

`npm run www` copies `js/` wholesale, so there is no fifth place.

`js/badges.js` was the most recent file to go through this, and it is a worked
example: it sits after `data.js` (badges read a team object) and before `core.js`
(where `tmBadge()` lives), and the same position appears in all three lists.

Load order:
`i18n → store → saves → reward → ads-testcfg → ads → iap → data → worldgeo → atlas → rivals → badges → core → sim → market → events → skills → sfx → actions → ui → main`

Almost every file is nothing but declarations, so most of this order only matters at
call time. The parts that are load-time real:

- `saves.js` reads and writes `L` while the script runs (`if(PREFS.lang)L=PREFS.lang`),
  and `L` is declared in `i18n.js` — so `i18n.js` must come first.
- `sfx.js` installs its capture-phase click listener at script scope.
- `main.js` boots the app (`migrateLegacy()`, `render()`) and must be last.
- `atlas.js` reads `GEO` (worldgeo.js) and `LEAGUES` (data.js), but only inside
  functions and behind `atlasHasGeo()` — the grouping is for readability, not a
  hard requirement.
- `rivals.js` is the same: it reads `NATS`/`LEAGUES`/`CTRYS` and calls into `core.js`,
  `sim.js` and `events.js`, but only at call time. It sits before `core.js` because
  `newGame()` calls `ensureRivals()`, not because of a load-time dependency.

| File | Responsibility |
|---|---|
| `js/i18n.js` | `L`, `STR{tr,en}` (498 keys each, must stay equal), `NEWS` templates, `t()`, link helpers |
| `js/saves.js` | Three save slots, slot summaries for the main menu, device prefs (`PREFS`), legacy migration |
| `js/ads-testcfg.js` | `ADS_TESTCFG` — the consent query's test options. **null in every shipped build**; overridden only by the Android debug source set, see *Test geography* below |
| `js/ads.js` | Age gate (`AD_AGE_MIN`, birth year in `PREFS`) + UMP consent flow + rewarded-ad adapter + season-transition interstitial (`@capacitor-community/admob`). Android only; a prototype, see *Rewarded ads* below |
| `js/iap.js` | Store catalogue: `IAP`, `IAP_PRODUCTS` (four capacity packs + remove-auto-ads), the two purchase ledgers and the entitlement readers. **Sells nothing** — see *The store lists what it cannot sell* below |
| `js/data.js` | Name pools, 22 leagues over 16 territories, 436 clubs, 3 cups, 52 nationalities — all original names |
| `js/worldgeo.js` | **Generated.** `GEO` — world geometry as SVG paths, per territory. Source: `tools/build-geo.js` |
| `js/atlas.js` | Exploration map: league↔territory mapping, derived territory state, SVG render, camera (pan/zoom) |
| `js/rivals.js` | Fourteen named rival agencies: archetypes, who represents whom, signing races, poaching your clients |
| `js/badges.js` | Procedural team badges: 24 emblems, 10 frames, 10 patterns, the semantic name→emblem map and `badgeDescriptor()`. `tmBadge()` draws from here |
| `js/core.js` | Game state `S`, fixtures, cups, scouting network (`buyScout`/`openScout`), economy formulas, the mutation funnels |
| `js/sim.js` | Weekly simulation, match ratings, season rollover, development, retirement, promotion/relegation |
| `js/market.js` | AI transfer market — clubs buy and sell each other's players independently |
| `js/events.js` | Event definitions (32, of which 8 are small), weighted selection, `applyEff` |
| `js/skills.js` | Skill tree data and layout, per-node icons (`SK_ICON`), level curve, point accounting, `skillBonus` |
| `js/actions.js` | Contract negotiation, transfer offers and clauses, the client meeting (pitch), signing/releasing clients, inbox actions |
| `js/ui.js` | `VIEWS` (14), `THEMES` (4), `NAVS` (6), rendering, navigation, modal queue, skill-tree SVG |
| `js/main.js` | `save()` wrapper and boot (legacy migration, first render, service-worker registration) |

### State mutation goes through single funnels

This is the most important convention. Never assign to these fields directly — every
balance lever depends on the funnel being the only writer:

| Instead of | Use | Why |
|---|---|---|
| `S.rep += x` | `repEvent(x)` | applies `repFactor()` soft cap and `skillBonus('repg')`, tracks `S.repMax`, counts level-ups into `S.lvUp`. Floors at 0 and rounds to 1 decimal, but has **no upper bound** |
| `p.trust += x` | `trustEvent(p, x)` | applies `skillBonus('trust')` |
| `p.morale += x` | `moraleEvent(p, x)` | applies `skillBonus('mor')` to your clients' losses, clamps and rounds to 1 decimal |
| any 0–100 status value | `stat(v, min)` | clamps into 0–100 and prevents 14-digit float drift showing in the UI |

`stat()` is for **status values only** — morale, trust, form — where 100 is a real
ceiling. Reputation is not one of them: it is the career progression line, and
`repEvent()` deliberately does its own flooring and rounding instead. Routing
reputation through `stat()` is what used to cap it at 100.

Event outcomes go through `applyEff(r, c)` in `events.js` — the one place that turns a
result object into state changes (cash, rep, morale, trust, form, player flags, `S.ag`).

### Effect keys are a registry, not ad-hoc reads

`skillBonus(key)` sums a key across purchased skills; `agMod(key)` reads permanent
agency modifiers granted by events (`S.ag`). Each key is consumed at exactly one site:

| Key | Read by |
|---|---|
| `comm` | `commissionRate()` — core.js |
| `cap` | `maxClients()` — core.js |
| `cost` | `weeklyCost()` — core.js |
| `scout` | `scoutCost()` — core.js |
| `net` | `buyScout()` — core.js (weeks until a network comes online) |
| `val` | `valueOf()` — core.js |
| `trust` | `trustEvent()` — core.js |
| `mor` | `moraleEvent()` — core.js (your clients' losses only) |
| `loy` | `poachChance()` — rivals.js (resistance to a rival poaching a client) |
| `repg` | `repEvent()` — core.js (gains only) |
| `fee` | `transferRate()` — core.js |
| `neg` | `negChance()` — actions.js |
| `wage` | `clubMaxWage()` — actions.js |
| `pitch` | `pitchChance()` — actions.js |
| `bid` | offer acceptance in `nextWeek()` — sim.js |
| `dev` | end-of-season development in `endSeason()` — sim.js |

Every key is declared in `SK_KEY` (skills.js) with the label and unit the UI prints.
Adding a skill or an event effect means adding to `SKILLS`/`EVENTS` and, if it's a new
key, adding a `SK_KEY` row and wiring exactly one read site.

### The skill tree is a graph, and it draws itself

`SKILLS` is a node list, not a list of tiers. A node carries its branch (`br`), its ring
out from the centre (`d`), which fork it sits on (`s`, −1/0/+1) and its prerequisites
(`req`) — a node unlocks when **any** id in `req` is already owned, so the capstone can be
reached down either fork. The hub (`SK_HUB`) is owned implicitly and never written to the
save. Four branches × 6 nodes = 24 buyable nodes.

Nothing in the UI knows the shape. `skPos()` turns (branch, ring, fork) into x/y by taking
the branch's `dir` vector and running the fork along its perpendicular; `skEdges()` derives
the paths from `req`; `skViewBox()` sizes the canvas from the nodes it finds. **Adding a
branch means adding one entry to `SK_BRANCH` with a direction vector and its nodes to
`SKILLS`** — plus a `--sk-<id>` colour in each of the four theme stylesheets. `js/ui.js`
needs a glyph in `SKICONS` and nothing else; no coordinate is ever written by hand.

`dir` accepts any vector, but the grid is square: a diagonal branch runs √2 further per
ring and its forks land in cells the axis-aligned branches already use at ring 3–4. Adding
one means checking `SKILLS.map(skPos)` for duplicate coordinates first (currently zero).
The four cardinal directions are collision-free by construction.

Node state is read from one place, `skillState()` → `owned | open | poor | lock`, used by
both the renderer and `skillBuy()`, so what you see is what you can buy. A node is
**binary** — owned or not, bought once at `cost` points. There is no per-node level, no
repeat upgrade and no "next level" value, so any screen that shows one would be lying.

**Saha draws the same data as cards, not as the tree** (`useSahaSkills()`, the same gate
as `useSahaMarket`/`useSahaLeague`/`usePortraits`). `skSahaView()` renders a point summary,
the four real branches as tabs and the six nodes of the selected branch as a two-column
grid; `skSahaSheet()` replaces the node card. The other three themes keep `skTreeSvg()`
untouched — `skills()` and `skOpen()` branch on the gate and nothing else.

The tree could afford one glyph per branch because **position** told the nodes apart. A
card grid has no position, so six cards in a branch would repeat one glyph six times:
`SK_ICON` in `skills.js` carries a drawing per node and is the single source — `js/ui.js`
reads it through `skIcon()` and never keeps a copy. The branch tabs have their own four
drawings, `SK_SAHA_BRANCH_ICON` (read through `skBranchIcon()`), because a tab glyph has to
carry the branch's whole meaning on its own at 19px — a document, a crosshair and a dollar
sign did not. The five `SKICONS` branch/hub glyphs are untouched and now belong entirely to
the old tree, which is what the other three themes still draw. A locked card
prints the required node by **name** instead of drawing a dependency line; the `req`
relation is the only real one and a name reads better on a phone than an edge.

The selected branch (`SKTAB`) is view state only, like `MKQ` and atlas `CAM` — it never
reaches the save, so switching tabs or themes cannot touch points or owned nodes.

Old saves are translated on read: `SK_LEGACY` maps the nine skill ids of the pre-tree
layout onto their equivalents, and `skillsTaken()` drops anything `skById()` no longer
knows. Renaming a node id means adding a `SK_LEGACY` row, not just editing `SKILLS`.

### The exploration map shows progress — it does not gate it

The scouting network has a full-screen map view (`pushV('atlas')`). The map draws the
**16 territories** of `LEAGUES[].ctry`, not the 22 leagues: six countries have two tiers,
so a territory carries one marker while purchases still happen per league.

**There is no adjacency requirement.** `buyScout(i)` checks exactly three things — the
league isn't already known, no network is pending on it, and you can afford
`scoutCost(i)`. Any undiscovered league anywhere in the world is buyable from turn one if
the cash is there. There is no route graph, no reachability function and no
"unreachable" territory state; the map is a pure presentation layer, and if it showed a
gate it would be lying.

Territory state is **derived, never stored.** `S.known` holds league indices — that is the
save format — and `atlas.js` only reads it:

| State | Meaning |
|---|---|
| `full` | every league in the territory is discovered |
| `partial` | some discovered, some still buyable |
| `scouting` | a network is being set up in the territory |
| `open` | nothing discovered yet |
| `fog` | the territory has no leagues at all — unreachable with today's data, kept so an orphan shape stays neutral instead of green |

`createAgent()` seeds `S.known` from the agent's home territory via `NAT2CTRY`, and
`buyScout()` pushes onto `S.scout` with a `done` week (at least 2, shortened by
`skillBonus('net')`).

Cost is what shapes the opening, and it comes from league strength:
`scoutCost(i) = round((30 + max(0, lgAvgStr(i)−40)·12) · (1 − skillBonus('scout')))`. At
season 1 that runs from 93K (WA1) and 162K (NA1) through the second tiers (196–288K) up
to 470K (EN1). Against the 250K starting cash only WA1, NA1, TR2, FR2 and IT2 are
affordable immediately — **that spread is the real balance lever, so re-measure it
whenever club strengths or `scoutCost()` change.**

Geometry lives in `js/worldgeo.js`, a **generated** file: `tools/build-geo.js` projects
Natural Earth 1:110m *map units* (public domain) through Robinson, simplifies, and emits
integer relative SVG paths. Map units rather than countries because the game's `EN`
territory is England, not the UK, and `FR` is metropolitan France without French Guiana.
Each entry is `{d: path, bb: bounds, a: marker point}`; `GEO.ctx` is the single
background layer for land the game doesn't play in. Paths need
`fill-rule="evenodd"` for holes. Don't hand-edit it — change `TERR` in
`tools/build-geo.js` and regenerate.

`atlas.js` silently skips a territory with no `GEO.t` entry, so a mismatch between
`LEAGUES[].ctry` and `TERR` makes a region vanish from the map with no error. Check it.

The purchase UI is still the old `openScout()` list modal — `atlasView()` links to it and
carries a `GEÇİCİ` comment saying the in-map purchase panel is step 6. That TODO is real;
don't treat the list as final.

### Rival agencies are characters, not a difficulty knob

`p.agent` is still the source of truth for representation (`'you' | 'rival' | null`), and
everything that reads it kept working unchanged. What `rivals.js` adds is a *who* behind
the `'rival'` flag: **one named agency per archetype in `RIV_ARCH`** — fourteen today.
`RIV_ARCH.length` *is* the count; there is no separate constant to keep in step.

**Adding an agency is a data edit.** Append an entry to `RIV_ARCH` with its coefficients
and its bilingual `n`/`dsc`, and the rest follows on its own: `newRivals()` gives it a home
territory and a generated surname, `claimWeight()` starts routing players to it, and
`ensureRivals()` grows existing saves onto the new roster. No behaviour code is touched.
The coefficients *are* the character:

| Field | Effect |
|---|---|
| `poach` / `chase` | how often it comes after your clients / races you in the market |
| `youth` / `elite` / `vet` | target profile — wonderkids, stars, or players at the end of a career |
| `home` / `away` | weight inside and outside its home territory (defaults 1.6 / 1) |
| `comm` / `loyal` / `size` | its cut, how well it holds a client, how big a roster it carries |

`vet` and `home`/`away` arrived with the roster expansion. `home`/`away` replaced an
`a.id === 'family'` check inside `claimWeight()` — a regional archetype now declares itself
in data instead of in an `if`. `archFocus(a)` derives the one-word label the roster list
prints straight from these numbers, so it cannot drift away from the coefficients, and it
returns an inline `{tr,en}` object rather than a `STR` key so the archetype stays one
self-contained record.

**More agencies must not mean a busier world.** `RIV.signRate`, `RIV.loseRate` and
`RIV.chaseW` read as per-agency probabilities but were tuned for `RIV.tuneN` (6) agencies,
so `rivScale()` divides them by the actual roster size. Without it, going from six to
fourteen would have multiplied background signings, client losses and signing races by
2.3×. Measured over six seeds with reputation pinned to 5 (a new agent who can see
TR1+TR2 and nothing else):

| | visible races / 2 seasons | poach approaches / 2 seasons |
|---|---|---|
| 6 agencies | 20.7 | 3.8 |
| 14 agencies | 18.0 | 3.7 |
| 14 agencies, `rivScale()` stubbed to 1 | 31.5 | 2.7 |

The third row lands at 1.5× rather than 2.3× only because `chaseMax` starts binding —
the cap hides part of the damage, which is exactly why the rate has to be divided rather
than left to the cap. Against a fixed roster of clients the mean `poachChance` *fell*, 0.404 → 0.385 at
rep 60, because the eight new archetypes are deliberately calmer than the original six
(mean `poach` 0.93 → 0.88). **Adding a character must not add pressure** — if you add an
archetype, re-measure both columns.

**Only notable players get a named agency.** `notable(p)` is `profileOf(p) >= RIV.notable`
(64) or a genuine wonderkid. The rest stay with an unnamed local agent, exactly as before.
The threshold came down from 72 together with the roster expansion, and the two changes
cancel out: at 72 only ~17% of the ~2,550 rival-represented players had a name behind them,
so browsing a squad showed the anonymous "Rakip menajer" five times out of six; 64 names
~43% of them, and splitting that across fourteen agencies instead of six leaves the
per-agency portfolio roughly where it was (~75 on average, boutique ~16 up to corp ~150).

**So the two levers are separate**: `RIV.notable` decides how *often* a name appears on
screen, `RIV_ARCH.length` decides how *many different* names exist. The crowded-market
feeling comes from the first; the variety comes from the second.

**Rosters are derived, never stored.** The save format is one optional field on the
player, `p.ra` (agency id). `rivalCounts()` scans once per week and memoises; nothing
keeps a client list that could drift out of sync — the same reasoning as `S.known` in
atlas.js. `S.rivals` holds only the agency records (`base`, `sfx`, `arch`, `ctry`,
`rep`, `rel`, `won`, `lost`).

Agency names are **generated, not stored**: `{base, sfx}` where `base` is a surname from
the home territory's `NATS[nat].l` pool and `sfx` is a bilingual key in `RIV_SFX`.
`rivalName(r)` renders it, so the name is correct in both languages — the problem
`lgName()` solves for leagues. Never store a rendered agency name.

Three behaviours, all driven from `simRivals()` in `nextWeek()` (before `simTransfers()`):

| Behaviour | Mechanism |
|---|---|
| Background market | Each agency signs and loses unrepresented players weekly. `RIV.signRate` shrinks the market pool, `RIV.loseRate` refills it — **keep them balanced or the market screen empties out over a career** |
| Signing race | `S.chase` holds up to `RIV.chaseMax` open races. Targets are only drawn from leagues you know and profiles you can reach (`repCap()+RIV.reach`) — a race you can't see or enter is noise, not tension. `chasePenalty()` is read at exactly one site, `pitchChance()` |
| Poaching | `S.poach` is a single pending threat that lands as a locked modal a few weeks after the warning. `poachChance()` is the one read site for `skillBonus('loy')` |

Poaching is deliberately **a late-game problem**, and `RIV.worth` (64) makes that
structural rather than statistical: below reputation ~16 the whole reachable band is under
the threshold (`repCap()` is `58 + rep·0.38`, so it only passes 64 at rep 16), which means
a starting agent's clients are *categorically* not worth a phone call — a fixture at rep 12
produces zero eligible targets in 3,000 draws. `RIV.poachGrace` (10 weeks) then protects a
freshly-signed client. Both exist because measurement said so: without `worth`, a two-slot
starting agent lost 60% of contested clients and never left reputation 5; without
`poachGrace`, losses compounded — you replace a lost client with a low-trust new one who
is then easier to take — and twelve seasons took an established agent from reputation 70
to 4. That is not a decision, it is a spiral.

With both guards, measured over 12 seasons at ~3.1 approaches per season:

| Policy | Contested | Lost | Reputation at s12 |
|---|---|---|---|
| always ignore | 37 | 25 (68%) | 59 |
| mixed | 40 | 9 (23%) | 77 |
| always pay | 38 | 2 (5%) | 80 |

That spread is the feature. If you retune `poachChance`, re-measure all three — a
poaching loss goes through `repEvent()`'s **unthrottled** loss path, so it pulls directly
on the `REP_SOFT` equilibrium described above. Those three rows were measured on the
six-agency world and have **not** been re-run since; the formula is unchanged and the
direct `poachChance` sample above came out slightly *lower*, so the spread should hold,
but if you need the exact numbers, measure them rather than quoting this table.

### The ad path has an age gate, and it is not a consent verdict

The rewarded ad sits behind a second, **independent** gate: an age declaration stored on
the device. `AD_AGE_MIN` (ads.js) is **18** and it is the *ad access* threshold — **not the
game's audience, which is 13+**. A player with no declaration, or one below the threshold,
plays the whole game with every career and save intact; only the ad and its daily reward
are closed, and **nothing replaces that reward**.

**Age and consent are never the same term.** `adsAgeOk()` reads our threshold;
`adsEligible()` reads the SDK's `canRequestAds`. They appear side by side in `adsReady()`,
`adsApply()` and `adsWatch()` and are never merged — folding one into the other would let
a consent result carry an age decision.

Only the birth **year** is stored (`PREFS.adBY`), never month or day, and never in the
career save — the declaration belongs to the device, so deleting a career leaves it alone.
Because the birthday is unknown the person is counted as the *younger* possible age:
`(currentYear − birthYear) > AD_AGE_MIN`. So someone born in 2008 becomes eligible on
1 January 2027. That delay is the accepted price of storing less; it is not a bug to
"fix" by asking for a full date. Any stored value that is not a plain integer year in a
sane range — text, fraction, future year — resolves to `null` and **closes** the gate.
It is a self-declaration: not verification, and no compliance claim rests on it.

**The screen never blocks launch.** The declaration is asked at first use of the optional
ad feature, not at startup, so a game that asks for nothing else does not open with a
question. That forces one design consequence: `adsRowState()` reads the age gate **before**
the SDK state, because the SDK is never started while the gate is closed and the entry
point would otherwise be undrawable — the user could never reach the question. The `'age'`
and `'noage'` states deliberately **omit the reward amount**: showing the money and then
asking for a birth year is a direct incentive to overstate it, and the below-threshold
state carries no invitation to correct upwards. Correcting and deleting live together in
Settings, at equal weight in both directions.

**The entry point is a `+` next to the balance, and the window does the talking.** The
old full-width "Watch an ad" row on the home screen is gone. `adsPlusHtml()` draws a 28px
`+` inside `.hmBalRow` (touch target widened to 44x40 by `.hmPlus::after`), and
`adsRewardOpen()` opens a sheet carrying the amount, the daily-allowance state and one
clearly labelled **Watch an ad** button. `adsRowState()` is still the single source of
state for both — the view layer branches on nothing else.

Three properties of that split are load-bearing:

- **Opening the window starts no ad.** It renders and returns; the only path into
  `adsWatch()` is `adsRewardGo()`, behind the button, and every gate still sits at the top
  of `adsWatch()` itself.
- **The `'age'` state skips the window entirely** and goes straight to the neutral
  birth-year screen. A window that showed the reward and *then* asked for a year would be
  the exact incentive the neutral screen exists to avoid.
- **The button carries `data-ad="<state>"`.** Its label is `+` in every state, so without
  that attribute a missing repaint would leave the state right and the screen wrong with
  nothing to observe. `.hmPlus.on` is the same signal in CSS. `tools/savetest.js` block 20
  scenario (24) asserts against it.

**Ownership, because a declaration can change mid-flight.** Entry checks are not enough —
every await in the consent chain is followed by another native call. Two tokens:
`ADS.ageSeq` (bumped on every write/delete, captured at chain start, re-checked through
`adsAgeHolds()` before each next native step) and `ADS.op` (who holds `busy`/`cp`, so a
late chain's cleanup cannot release a newer round's lock, and `adsAdopt()` refuses to write
`ADS.cs`/`ADS.pors` for a chain that no longer owns the lock). Losing ownership **does not
cancel** the in-flight native call — there is no such API — and the lock is never released
early, so no second form can overlap the first.

"Before each next native step" is literal, and the ad-purposed boot chain has **two** such
steps: the form after the boot read, and the one refresh after a *failed* form. Skipping
that refresh is not "the old answer still stands" — the chain marks `ADS.stale` and returns
`'abort'`, so the previous `canRequestAds: true` copy **stops being an authority to start
ads** and the next valid declaration goes through a current consent flow instead of
inheriting a stale one. The user-opened privacy path is untouched by any of this:
`adsPrivacy()` is a separate entry and deliberately does not read the age gate.

`ADS.boot` now means **"the flow completed"**, not "the flow started". Only an age abort
leaves it false, and that is what lets a half-finished flow re-run — but the re-run needs
somewhere to happen, because an aborted chain still holds its lock until the in-flight
native call returns. `adsResume()` is that place: every `adsInit()` that joins a pending
`ADS.cp` runs it once the old promise settles, and it opens exactly one new round when the
gate is still open and `ADS.boot` is still false. Three properties hold it together:

- **No retry loop.** A network or form failure marks the flow *completed* (`boot = true`),
  so `adsResume()` never reopens on it. Only a user changing the declaration produces a new
  round.
- **Singular.** Several `adsInit()` calls can be waiting on the same old promise;
  `adsConsentFlow()`'s own `ADS.cp` gate means the first one opens the round and the rest
  receive that same promise — never a second `requestConsentInfo`, form, `initialize()` or
  duplicated listener.
- **Gate-respecting.** If the user closed the gate again while the old chain was in flight,
  `adsResume()` opens nothing.

Without it, a player who fixes a typo in their birth year while the boot read is still in
the air would see the consent form never appear and the reward row vanish for the rest of
the session. A *completed* flow that goes eligible→ineligible→eligible still does **not**
issue a new `requestConsentInfo`: consent did not change, and
`ADS.sdkP`/`ADS.sdk === 'on'`/`ADS.bnd` keep initialisation and listeners singular. An
initialised SDK is never written as reverted.

**A declaration change repaints before it awaits.** `adsAgeApply()` calls `adsRepaint()` on
both branches and only then kicks the flow. The consent read can take seconds, and leaving
the row saying "your birth year will be asked" during that window would read as "what I just
entered was not saved".

**The gate binds starting, not delivery.** `adsReward()`, `rwEarned()` and `rwSync()` carry
**no** age or age-seq veto: the gate was open when the show began, the reward belongs to
that show, and the accounting rides the nonce. A reward that lands after the declaration is
deleted is still paid and still marks the day used.

**Deleting the declaration is not withdrawing consent.** `adsPrivacyState()` therefore does
not look at the age gate. Since a closed gate means no launch read happens, `ADS.pors` stays
`UNKNOWN` on a cold start and the entry point would vanish — so `PREFS.adPors` persists a
**hint only**: it is not a copy of the consent decision and not an authority on ad
eligibility. It is written when a successful read says `REQUIRED` and removed only when a
successful read says `NOT_REQUIRED`; an error, an offline device or `UNKNOWN` never clears
it, and no decision is ever taken by parsing an error message. On a cold start
`adsPrivacy()` issues one user-initiated `requestConsentInfo()` before the form, because
the form needs current information — that read happens on the user's tap, never at launch,
and it cannot start ads: `adsApply()` still requires both consent and age.

`tools/savetest.js` block **20** holds this contract, including the recovery orderings:
scenarios (18)–(22) hold a real deferred `requestConsentInfo` promise and change the
declaration inside that window — valid→valid and delete→valid — then assert that exactly one
new round runs to completion, that the form is called when it is needed, that several waiting
`adsInit()` calls still produce one round, that a closed gate produces none, and that a
failed read does not become a retry loop. Scenario (23) covers the skipped
form-failure refresh, and (24) asserts against the **rendered** `#view` rather than
`adsRowState()`, because a missing repaint leaves the state right and the screen wrong.

What all of this can prove is one class of evidence only — *the JS made no call to the
bridge*. It is **not** evidence that no native component started or that no network traffic
occurred; `MobileAdsInitProvider` is in the merged manifest and is instantiated at process
start regardless of our code. Those are separate measurements and they have not been made.

### Rewarded ads are a prototype, and the scope is the design

`js/ads.js` gathers UMP consent, then plays a rewarded ad through
`@capacitor-community/admob` (pinned to exactly `8.1.0`, which pulls
`com.google.android.ump:user-messaging-platform:4.0.0`) and hands the result to the
existing entitlement accounting in `js/reward.js`. It is a **technical trial**, not a
shipped feature: no mediation is configured and **no real ad unit is wired** — both the
rewarded and the interstitial requests use Google's *sample* ad units with
`isTesting: true`. `js/ads.js` never touches `S.cash` — the only money path is still
`rwEarned()`.

**The AdMob *application* id is real and the *ad units* are samples. They are different
things and the distinction is load-bearing.** `admob_app_id` in `strings.xml` is
`ca-app-pub-6695238757557885~9045271955`, this app's own AdMob registration, and it has
been since commit `fe390d5` — a UMP consent message can only be published against a real
app registration, so the real form cannot be drawn without it. The ad units stay
`ca-app-pub-3940256099942544/...`, which is what keeps this a test and not ad serving.
There is no debug/release override of either: one `strings.xml` in `main`, no `resValue`,
no `manifestPlaceholders`. If a doc line or a report ever says "sample app id", check
`strings.xml` before repeating it — this file said exactly that for one commit too long.

**Two lifetimes, and conflating them is the easy bug.** `ADS.cur` is the *on-screen*
show — a UI lock, cleared by the first terminal event. `att` is the *delivery record* —
the reward's fate, alive in closures after `ADS.cur` is gone. The reward handler must
never read `ADS.cur`: a correct result arriving after the ad closed would be dropped.

**Correlation comes from the bridge, not from us.** Every `showRewardVideoAd()` call gets
a unique `callbackId` (`native-bridge.js`), a fresh `PluginCall` (`MessageHandler.java`),
and the plugin resolves the reward on *that* call. So the promise is a genuine per-show
identity and it is the single authorised reward entry. The global
`onRewardedVideoAdReward` event is deliberately **not** listened to — it carries no
identity, so an old show's reward could reach a new attempt.

**Terminal events carry no identity at all.** `Dismissed`/`FailedToShow`/`FailedToLoad`
ship an empty object. `ADS.cur` means "whatever is on screen", which is the best
available and not a guarantee. Damage is bounded: because payment rides the promise, a
wrong or double payment is impossible; the worst case is a lost reward.

**The supported order is Google's.** Google documents `onUserEarnedReward` *before*
`onAdDismissedFullScreenContent` for ads it serves itself, and under mediation the ad
source decides. That ordering is what makes the immediate `rwAbandon()` on close safe:
`rwEarned()` promotes the record to `earned` synchronously in the first microtask, and
`rwAbandon()` cannot delete an `earned` record. **So `onReward` must call `rwEarned()`
with no `await` in front of it** — an extra microtask hop and close wins the race.
The reverse order (close first, reward second) is **not supported**: the reward is lost,
the day's entitlement stays open, and `tools/savetest.js` block 18 asserts exactly that
rather than hiding it. No grace timer was added; measuring mediation is a prerequisite
for deserving one.

**Known losses:** a WebView reload or an Activity recreation during a show loses the
reward — derived from source (bridge callbacks and listeners are gone; the plugin does
not retain events), **not reproduced on device**: no reload or recreation occurred in
the prototype runs. Process death kills `AdActivity` too — this one was measured — so a
stale `req` genuinely has no live ad and `rwReap()` is right there. Recovering the first
two needs a native change the plugin does not have today — a caller-supplied id echoed on
the events plus a way for a new JS session to query and settle a pending result. That is
a separate decision and nothing in this branch pretends it is solved.

### Season transitions get one ad each, and the season engine owns the right

There are exactly **two** automatic ad moments in a career-season, and both are read out
of the fixture rather than assumed from a week number: the week the mid-season transfer
window opens (`midWeek()` in core.js, `ceil(totalWeeks()/2)+1`) and the moment the season
ends (`S.week > totalWeeks()`). Change the league length and both move on their own.

**The right and the showing are two different jobs, in two different files.**
`adBreakClaim(kind, season)` lives in `js/sim.js` because *which moment is a transition*
and *whether that transition still has its ad* are season-engine facts; `adsInterShow()`
lives in `js/ads.js` and only answers "can I show one right now". Neither asks the other's
question.

| | |
|---|---|
| `S.adb` | `{m: <season>, e: <season>}` — the transitions already spent. Absent on every old save; built on first use |
| `ADS.iSt` | `off` / `load` / `ready` / `show` — the *preloaded* ad's life. Never reaches the save |

Five properties, each of which a different mistake would break:

- **The claim is written before `save()`, not after the ad.** So a redraw, a reload of the
  same slot, or reopening the app cannot produce the same transition's ad twice — the
  marker is already on disk. It is also claimed *before* `endSeason()` runs, because
  `endSeason()` increments `S.season` and asking afterwards would bill the ending season's
  ad to the new one.
- **No ad is ever waited for.** `adsInterShow()` shows only when `ADS.iSt === 'ready'`;
  otherwise it returns `'none'` and the week advances exactly as it would have. That is the
  reason for preloading at all: loading at the transition would mean either blocking the
  screen or opening an ad later, on some unrelated screen. The claim is spent either way —
  a transition that found no ad loaded does **not** keep its right for later.
- **Nothing about the ad touches game state.** `adsInterShow()` is the last statement of
  `nextWeek()`, after `save()` and `render()`, and the dismissal/failure events only
  release `ADS.iSt`. There is no callback that advances a week or a season, so a close or
  an error cannot run the transition a second time.
- **It cannot collide with the rewarded ad or a consent form.** `adsBusy()` returns
  `'inter'` while `ADS.iSt === 'show'`, which closes `adsReady()` and makes
  `adsConsentFlow()`/`adsPrivacy()` bail; in the other direction `adsInterShow()` returns
  `'none'` whenever `adsBusy()` is set. Background *loading* (`'load'`) is deliberately not
  busy — it takes nothing away from the user.
- **The same two gates as the rewarded path, and they stay separate terms.** Neither
  `adsInterPrep()` nor `adsInterShow()` runs without both `adsAgeOk()` and `adsEligible()`.
  A declaration that changes while a load is in flight is caught by `adsAgeHolds()`, and
  the loaded ad is then simply never shown — 8.1.0 still has no way to discard one.

**Re-arming has three triggers and no timer**: SDK initialisation, `adsApply()` when
eligibility is newly won, and a transition being handled (after a show, or instead of one
when nothing was loaded). At most two of those exist per season, so a failed load is
retried rarely and never in a loop.

`iapNoAds()` (core.js) is the single read site for the purchased removal, checked at the
top of both `adsInterPrep()` and `adsInterShow()` — so the product turns off *loading* as
well as showing. It never touches the rewarded ad: that one the player starts themselves
and gets paid for.

**Measured on the emulator** (Android 17 / API 37, debug APK, Google's sample interstitial
unit `…/1033173712` with `isTesting: true`): a real `AdActivity` opened at the mid-season
week and again at the season end, the week and the season advanced without waiting, closing
the ad moved neither, re-rendering and re-reaching the same transition — including after a
`loadSlot()` round-trip — opened nothing, and the next season's transition opened one again.
`tools/savetest.js` block **22** holds the same contract deterministically, including the
"loaded late, never shown" case and the no-retry-loop case.

### Consent has three states, and the ad gate is none of them

The plugin's `initialize()` calls `MobileAds.initialize()` and never consults UMP
(`AdMob.java`), so the ordering Google's setup guide requires — consent **before** the
Mobile Ads SDK is initialised — has to be built in `js/ads.js`. It is:
`requestConsentInfo()` → `showConsentForm()` → `canRequestAds` → `initialize()` →
prepare/show. **The screen never waits for any of it.** `main.js` draws the menu first
(`render()`), then fires `adsInit()` and moves on without awaiting it — so consent runs
*after* the first paint, and an offline device still opens its menu and its saves at
normal speed.

Three separate things, and merging any two is the bug this design exists to prevent:

| | Meaning |
|---|---|
| `ADS.sdk` | the Mobile Ads SDK's own life. Once `'on'` it **never goes back** — `MobileAds.initialize()` cannot be undone, and writing that it was would be a lie |
| `ADS.cs` | the last **successful read** from the SDK — a *copy*, not "the SDK's current answer". The plugin exposes no standalone `canRequestAds()`; the only way to re-read is another `requestConsentInfo()` |
| `adsReady()` | the **ad gate**: SDK on **and** listeners bound **and** eligibility current and true **and** nothing else running. An initialised SDK does not open it |

**`canRequestAds` is the only decision field.** `status` and `isConsentFormAvailable` are
carried for diagnosis and nothing branches on them. `OBTAINED` is not "every purpose
allowed" and `REQUIRED` is not "ads forbidden" — mapping the user's choice onto a verdict
ourselves is exactly the mistake. `privacyOptionsRequirementStatus` decides one thing
only: whether the Settings entry is drawn.

**A form error is not "nothing happened".** A rejection from `showConsentForm()` or
`showPrivacyOptionsForm()` says the call failed, not at which stage — consent may have
changed — but a re-read is only issued where the form did **not** already hand one back.
A successful `showConsentForm()` resolves with fresh `canRequestAds`, so that value is
adopted directly and **no extra query is made**. A *failed* `showConsentForm()` gets one
`requestConsentInfo()` refresh. `showPrivacyOptionsForm()` returns no payload at all, so
both its success and its failure get one refresh. Where a refresh is issued and it fails,
`ADS.stale = true` and the old `canRequestAds: true` **stops starting ads**. That state
is "could not be verified", never "you refused" — `adEligUnknown` and `adRewardFail` are
separate strings on purpose. There is no retry loop: at most one read per refresh point,
and the recovery path is the Settings row, which is why `ADS.pors` lives *outside*
`ADS.cs` and survives a failed refresh.

**Consent work and ad work never overlap.** `adsBusy()` is the single lock, and its
`'ad'` state derives from `ADS.cur`, which is set *before* `prepareRewardVideoAd()` — so
the load wait counts too. There **is** a loaded, unshown ad in that window: once prepare
resolves the plugin holds a real ad in `preparedAds`, and if eligibility drops we simply
never show it — 8.1.0 has no API to discard it. Every gate sits at the **top of the
function**, not on the button: a hidden or disabled row is presentation, not a gate.

**Measured on the emulator outside the EEA** (Android 17 / API 37, `ADS_TESTCFG` null):
`status` `NOT_REQUIRED`, `canRequestAds` `true`, `isConsentFormAvailable` `false`,
`privacyOptionsRequirementStatus` `NOT_REQUIRED` — so `showConsentForm()` resolves without
drawing anything, which is the correct outcome there and not a failure.
`showPrivacyOptionsForm()` rejects in that geography with message
`"Error when show privacy form"` and the real UMP text in **`code`**
(`"Privacy options form is not required."`) — Capacitor's `reject(msg, code)` puts it
there, so log `err.code`, not `err.message`. The **EEA** measurement, where a form is
actually drawn, is in *Test geography* below.

### Test geography lives in a build variant, not in a flag

The consent query used to be `requestConsentInfo({})` with a literal empty object.
It now passes `adsTestOpts()`, which reads `ADS_TESTCFG` from `js/ads-testcfg.js`.
That file is `null` in the repo, so web, PWA, single-file and the Android **release**
package all send `{}` exactly as before.

The one place it is not null is `android/app/src/debug/assets/public/js/ads-testcfg.js`,
which sets `{debugGeography: 1}` (EEA). **The separation is Android's asset merging, not
a comment and not a preference key**: a build-type source set overrides `main`, so the
debug package ships the EEA file and the release package ships the null one — there is no
file to override it. Verified by running `:app:mergeDebugAssets` and
`:app:mergeReleaseAssets` and reading both outputs; `tools/savetest.js` block **21** (6)
additionally scans the release-bound source paths for a non-null config.

Why it exists: the published European consent message targets the EEA, the UK and
Switzerland, so a device that looks like it is anywhere else never draws the form and that
branch of the flow cannot be exercised. `debugGeography` only tells UMP where to pretend
the device is. **It does not give, refuse or assume consent** — `canRequestAds` still comes
only from the SDK's real answer. No test-device id is carried either: UMP 2.2.0+ already
treats emulators as test devices, so no real device id needs to live in the repo.

`adsTestOpts()` passes **one** field. `tagForUnderAgeOfConsent`, a test-device list and
anything else that could colour the consent decision are not read, and a malformed value
falls back to `{}`.

**A rejected privacy form now says so.** `showPrivacyOptionsForm()` can reject for reasons
that have nothing to do with the network — measured on device: a cold start where the form
had not finished loading yet, which the plugin reports as *"Privacy options form is being
loading"*. The chain already handled it correctly (the mandatory re-read still runs, the
lock is released, the Settings row stays so the user can tap again), but the tap produced
no visible result. It now toasts `adPrivacyRetry`, which is a **separate string** from
`adPrivacyFail`: that one blames the connection and belongs to the failed *pre-read*, while
this one says only "not now, try again shortly". The raw SDK message is never shown — it is
a developer string and untranslated. No automatic retry and no fixed delay were added; the
next attempt is the user's tap.

`tools/savetest.js` block **19** holds the consent contract — ordering, the lock in both
directions, stale eligibility, single initialisation across a true→false→true flip, and
that no consent path ever moves money, burns the daily right or reaches `S`/`PREFS`. Its
mock returns whatever a scenario hands it and claims nothing about what the real SDK
answers; **that** only gets measured on a device.

**Android configuration that goes with it:** `playServicesAdsVersion` is pinned in
`android/variables.gradle` because the plugin's default is the dynamic `25.4.+`;
`userMessagingPlatformVersion` is left alone because the plugin's default is already the
fixed `4.0.0`;
`admob_app_id` lives in `strings.xml` and is referenced from the manifest, without which
the SDK crashes with "Missing application ID". The merged manifest gains
`ACCESS_NETWORK_STATE`, `AD_ID`, three `ACCESS_ADSERVICES_*`, `WAKE_LOCK` and
`FOREGROUND_SERVICE` — a Play Data Safety concern before any release.

**The real EEA form has now been exercised, end to end.** Measured on the emulator
(Android 17 / API 37, debug APK, `debugGeography: 1`, the real `admob_app_id`):
`requestConsentInfo` answers `status: REQUIRED`, `isConsentFormAvailable: true`,
`canRequestAds: false`; `showConsentForm()` then draws the published message inside the
host activity — branded "Pro Football Agent", with **Consent / Do not consent / Manage
options**. Tapping *Consent* resolves the form with `status: OBTAINED` and
`canRequestAds: true`, and that value is adopted with `src: 'form'` — **no extra
`requestConsentInfo` is issued**, which is the one thing this branch of the flow exists to
avoid. `initialize()` runs only after that, `adsPrivacyState()` becomes `'go'`, and the
reward and season-transition paths open.

Two things this measurement settles, because both had been claimed wrongly before:

- **The form is drawn inside `MainActivity`'s own window**, not a separate one. Checking
  `mCurrentFocus` for a UMP activity will say "no form" while the form is on screen; look
  at the view tree instead.
- **While the form is up, `ADS.boot` is `false` and `adsBusy()` is `'consent'` for as long
  as the user takes to answer.** That is the designed state, not a hang. An earlier run
  read a long wait here as the flow being stuck and blamed the app id; the app id was
  never the sample one, and that run happened in the minute after Android replaced the
  system WebView package (`ActivityManager: Killing … stop com.google.android.webview due
  to installPackageLI`, `lastUpdateTime` on the WebView package matching to the second) —
  which had just killed the app. What actually caused that one non-returning form call was
  never established, and nothing here should be read as an explanation of it. Do not add a
  timeout on the strength of it: a timer that released the lock would let a second form
  open behind the first.

### The store lists what it cannot sell, and says so

`js/iap.js` is a **catalogue and two ledgers**. It contains no purchase call, no receipt
check and no path that grants anything. `VIEWS.shop` draws the five products and leaves
every Buy button disabled.

**The screen says one thing about purchasing: "not available right now."** It does not
explain *why* — no "billing is not connected", no "nothing is granted", no price. Those
sentences described the build to a developer, not the product to a player, and a player
who cannot buy anything does not need the reason enumerated six times. The status line
appears **once**, above the products; only genuinely product-specific states (`full`,
`owned`, `nocareer`) print under a button. What stays visible is what changes a decision:
what each product does, which scope it lands in, the +10 per-career ceiling, and that
career-scoped capacity goes when that career is deleted.
There is no "unlocked for now" flag and no fake success — that was the explicit
requirement, and blocks **23** (1)–(3) and (6) of `tools/savetest.js` keep it true,
including a source scan proving no file in `js/` ever writes either ledger.

**The screen is drawn once and themed four times.** There is no `useSahaShop()` gate —
unlike `market`/`league`/`skills`/`inbox`/`transfer`, the store emits one `.shp*` markup
for every theme and each of the four stylesheets carries its own block for it, written in
that theme's own variables (`--acc`, `--gold`, `--sur`, `--line`, `--txt3`). No colour
literal appears in any of them, which is what lets saha answer in emerald with a measured
gold accent on the +10 card while gazete answers in ink on paper. Product icons live in
`ICONS` (`shopCap1/3/5/10`, `shopNoAds`) in the same 24-box / 1.8-stroke / `currentColor`
language as the rest, and the four capacity icons differ in **composition**, not colour —
one card, a fan, a stack, an archive box — because at 34px on a 360px screen colour alone
does not tell four products apart.

**The signature element is the ten-segment allowance meter**, and its length is derived:
`Array.from({length: IAP.capMax})`, filled to `iapCapOwned()`. Raising the ceiling moves
the meter with it and touches no CSS. It is a row of segments rather than a progress bar
precisely because it has to read correctly at zero, which is where every career starts.

**The layout rules that are decisions, not styling:** no `<h2>` page title (the header bar
already says Mağaza, and 360px has no line to spare); the closed-purchase line is a small
status row, never a card; the shared scope and ceiling rules sit **once** above the grid
rather than repeated under four cards; and the ad-removal product is full width in its own
section because its scope (device) and what it leaves running (the rewarded ad) are not
the capacity packs' contract. Measured at 360px and at 320px, where the grid drops to one
column and the card turns horizontal: no horizontal overflow, and 80px clear between the
last button and the floating nav at the bottom of the scroll.

**Entitlement is derived from delivered purchase tokens, never from a counter.** That was
already the intent of the `iapCap()` comment in core.js: a number cannot reconstruct which
tokens it has already counted, so a restore would have no way to avoid double-counting.

| Ledger | Lives in | Shape | Read by |
|---|---|---|---|
| career | `S.iap.t` | `{<purchase token>: <product id>}` | `iapCapOwned()` → `iapCap()` → `maxClients()` |
| device | `PREFS.iap.t` | same | `iapNoAdsOwned()` → `iapNoAds()` → `adsInterPrep`/`adsInterShow` |

Both are absent today and absent on every old save; both reads fall to empty. Each has
exactly **one** read site in the game, which is what keeps the scopes honest: a capacity
token in `PREFS` grants nothing and a no-ads token in `S` grants nothing.

**Scope is a field on the product (`sc`), not a decision in the view.** `'career'` products
apply to the open career and go with it when that career is deleted; `'device'` products
cover every career on the device. The screen prints both the chip and the sentence, in both
languages, from that one field.

**The capacity ceiling is `IAP.capMax` (+10) per career and it binds in one place** — the
clamp at the end of `iapCapOwned()`. The store also *prints* the remaining allowance, but
that is presentation; a ledger that somehow carried more could still not push more than +10
into `maxClients()`.

**Capacity means player clients. It is not the three career save slots** (`SLOTS`,
js/saves.js) and must never be conflated with them; the store says so on screen and block
23 (7) asserts that buying capacity leaves `SLOTS` at 3.

**No price is printed anywhere.** Google Play returns the localised price once billing is
connected; writing a number now would be a guess. `shopPrice` says exactly that.

**What is still missing for a real purchase** — none of it exists yet, and the order of
the steps is not a preference:

1. **A Play Billing bridge.** `IAP.plugin` names the Capacitor plugin and `IAP.wired` is
   the switch; `iapAvailable()` requires **both**, so flipping the flag alone still sells
   nothing.
2. **The five product ids in Play Console**, matching `IAP.sku` byte for byte — four
   **consumable** capacity packs and one **non-consumable** ad removal. Permanent once
   published.
3. **Verify → grant → acknowledge/consume, in that order.** Play's flow is
   `launchBillingFlow` → `onPurchasesUpdated` → check `purchaseState == PURCHASED` →
   verify → **deliver the entitlement** → *then* `acknowledgePurchase` (non-consumable) or
   `consumeAsync` (consumable; consuming acknowledges implicitly). Acknowledging before
   delivering is the wrong way round: a crash in between would leave Play believing the
   purchase was honoured while the ledger is empty. There is a hard deadline on the other
   side — a purchase not acknowledged or consumed **within three days is automatically
   refunded and revoked** — so delivery must not be able to stall behind a user action.
   The ledger key is the purchase token precisely so verify-and-deliver is idempotent, and
   the writer must be the verifying code, never the UI.
4. **Pending transactions, and the career they belong to.** Play can hold a purchase in
   `PENDING` (cash, family approval) and deliver it hours later, on a launch that may not
   even have a career open. Nothing is written to a ledger until the state is `PURCHASED`;
   a purchase that expires in `PENDING` was never granted and needs no refund of ours.
   **Unresolved design question:** a capacity pack is career-scoped, so the target career
   has to be pinned at purchase time (the same move `rwRequest()` makes with `S.cid`) —
   and nothing decides yet what happens when a pending purchase lands after that career
   was deleted. Pay it to another career, hold it until one is chosen, convert it to
   device scope, or refund it: all four are defensible and none is chosen. Whoever wires
   billing has to answer this before the first consumable ships.
5. **Restore, and what restore cannot reach.** `queryPurchasesAsync` returns only
   purchases that are still *owned* — non-consumables, and consumables that have not been
   consumed yet. **Once a capacity pack is consumed it stops being returned**, so a
   reinstall cannot recover already-consumed capacity by querying the account: that needs
   a server-side record of delivered tokens (Play Developer API), which this project does
   not have and is not planned. Ad removal, being non-consumable, *is* fully restorable.
   Replaying a restored token through the delivery path is safe by construction — a token
   already in the ledger is a no-op.
6. **The device cache is not the restore source.** `PREFS.iap` is a local copy so the game
   behaves correctly offline and before the first Play query returns; the authority is
   Play, on the signed-in Google account. That means the cache has to be refreshed from a
   query (a refunded or revoked purchase should eventually clear it), it does not follow
   the user to a different Google account on the same device, and it is not what makes the
   entitlement survive a reinstall — Play is. Treating the cache as the source of truth
   would turn "I paid on my other phone" into "you did not".

Until all of it lands, `iapBuy()` stays a function whose only job is to explain itself.

### The world runs without the player

`sim.js` and `market.js` simulate all 22 leagues every week regardless of what the
player does: clubs trade with each other, contracts expire and produce free agents,
players age, decline and retire, youth come through, teams promote and relegate. A new
game is ~6,980 players across 436 clubs over a 38-week season. Any change to
player-facing economy has to be checked against this background economy — it's easy to
break the free-agent pool or the age pyramid without noticing.

### Balance constants live in named blocks

Tuning happens at these, not scattered magic numbers:

- `VAL` (core.js) — market value drift from performance: update interval, gain, bounds, season revert
- `REP_SOFT` / `repFactor()` (core.js) — reputation soft cap, and the single strongest
  brake in the game. `repFactor()` is `clamp(1 − rep/125, 0.15, 1)`, so above rep ≈106
  every gain is throttled to 15% forever. Climbing to rep 502 therefore costs about
  2,875 *nominal* reputation (≈2,500 with `ag5`'s +15%). It also feeds back on itself:
  `maxClients()` is `2 + floor(rep/18)` (plus `iapCap()`, which is 0 until a purchase is
  ever delivered), so low reputation means few clients, which
  means few reputation sources.

  Losses are deliberately **not** throttled — `repEvent()` applies `repFactor()` to gains
  only — so past the floor a career settles wherever throttled income meets full-price
  damage. Because the 0.15 floor binds at rep ≈106, that balance turns on one ratio:
  season losses over season gains. Below 0.15 a career keeps climbing, slowly and
  linearly; above it, reputation cannot pass ≈106 at all. **This constant, not the skill
  point budget, is what decides how much of the tree a career can ever reach** — see `LV`
  below.

  Reputation used to be clamped at 100, because `repEvent()` wrote `S.rep` through
  `stat()`. Everything in this bullet was authored for the uncapped line — `REP_SOFT` is
  125 and the floor binds at 106 — so **none of the region above 100 ever ran.** The clamp
  is gone; where the equilibrium actually lands has not been re-measured over a real
  multi-season career, so don't quote a number for it until someone does.
- `scoutCost()` (core.js) — what the world costs to open up; see the map section above
- `SQTARGET` / `FAMAX` / `POSMIN` / `POSMAX` (market.js) — squad sizes and the free-agent ceiling that keeps the background market in equilibrium
- `PERF` (sim.js) — how ability, form and morale produce a match rating; morale drives *consistency* (the spread), not the mean
- `EV_CHANCE` / `EV_GAP` / `EV_BIGGAP` (events.js) — event frequency; `sz:'s'` marks a small event, and big events are rate-limited separately so raising frequency adds texture rather than crises
- `LV` (skills.js) — the level curve: `repForLevel(l) = round(a·(l−1) + b·(l−1)²)`, capped
  at `LV.max`, with `levelPoints(l) = (l−1) + floor(l/LV.bonus)`. Today
  `{a:3.2, b:0.62, max:30, bonus:4}`. One branch is 6 nodes for 8 points, four branches
  for 32, which puts the milestones at:

  | Branches bought | Points | Level | Reputation |
  |---|---|---|---|
  | 1 | 8 | 8 | 53 |
  | 2 | 16 | 14 | 145 |
  | 3 | 24 | 20 | 285 |
  | 4 (whole tree) | 32 | 27 | 502 |

  Two things follow, and the comment at the top of `skills.js` gets one of them wrong.
  The whole tree is affordable at **level 27, not at the cap** — level 30 pays 36 points,
  four more than the tree costs. So the point budget is *not* what stops a career
  finishing all four branches, which is what that comment claims. What actually stops it
  is `REP_SOFT`.

  Measured **before the clamp was removed**: a headless bot playing purely for reputation
  — fills every client slot, moves every client to a stronger club every window, takes the
  highest-reputation option in every event, buys every affordable network — ended
  **25 seasons at rep 100, level 11, 12 of 32 points**, having earned 348 nominal
  reputation (~14/season) and flattened out from about season 19. That run measured the
  clamp, not an equilibrium: rep 100 *was* the ceiling and the flattening was the bot
  arriving at it. Feeding the same 348 nominal gains through today's `repEvent()` lands at
  **rep 130, level 13, 15 of 32 points** — a formula measurement, not a re-run of the bot.

  The size of the gap is unchanged. Level 27 needs about 2,680 nominal from rep 100 at the
  0.15 floor; even granting that the rate roughly doubles as client slots grow, that is a
  hundred-plus seasons. Nobody finishes the tree, and nobody comes close to three branches
  either — removing the clamp moved the reachable band by a couple of levels, not by a
  couple of branches.

  So the comment's conclusion holds and its reasoning doesn't. Raising `LV.a`/`LV.b`
  changes *when* branches open; only `REP_SOFT` changes whether the tree can be finished.
  Don't "fix" `LV` to restore a 32-point ceiling — that would slow down the early game,
  which is not where the limit lives. If the intent is that a long career *should* reach
  three or four branches, the levers are `REP_SOFT`, the 0.15 floor in `repFactor()`, or
  the size of the unthrottled losses — measure again after touching any of them.
- `RIV` (rivals.js) — everything about rival agencies except how many there are (that is
  `RIV_ARCH.length`): what counts as a notable player, weekly signing/losing rates, race
  frequency and reach, poaching gap, grace period, chance terms and the reputation cost of
  losing a client. The three that decide whether the game stays playable are
  `signRate`/`loseRate` (the market pool), `worth`/`poachGrace` (whether poaching is a
  decision or a spiral) and `tuneN` (the roster size those weekly rates were tuned at —
  `rivScale()` divides by it, so changing the roster does not change the world's pace)
- `IAP.capMax` (iap.js) — the most purchased client capacity a single career can ever
  carry (+10). It is not a balance dial you can raise alone: it sits on top of the whole
  `maxClients()` curve, so raising it moves the late game the skill tree cannot reach
- `SK_GEO` (skills.js) — tree geometry: grid unit, node radii, touch radius, viewBox padding
- `CAM_K` / `CAM_SPAN` / `CAM_KEEP` (atlas.js) — map zoom limits, the minimum width the
  home framing shows so you see your neighbours, and how much of the map must stay on
  screen when panning. Presentation only — none of these touch what you can buy.

### Files that are generated, not authored

Two committed files are build output. Editing them by hand is silently undone on the
next build:

| File | Generated by | Trigger |
|---|---|---|
| `css/style.css` | `tools/build-themes.js` (`npm run themes`) | any edit under `css/themes/` |
| `js/worldgeo.js` | `tools/build-geo.js` | changing `TERR` or the projection |

`dist/menajer.html` and `www/` are also build output, but nobody edits those by accident.

The four themes live in `css/themes/*.css`, each a complete standalone stylesheet.
`tools/build-themes.js` strips comments, scopes every selector under
`html[data-theme="name"]` and merges them. Adding a theme: drop the file in
`css/themes/`, add an entry to `THEMES` in `js/ui.js`, run `npm run themes`.

`tools/build-geo.js` downloads its source once into `tools/.geocache/` (gitignored).
It is a dev tool and never ships — see the network rule under *Conventions*.

### Saves must degrade gracefully

There are three slots plus device preferences, all in `localStorage`:

| Key | Holds |
|---|---|
| `menajerSaveV9s1..3` | the full career, `{S, PID}` |
| `menajerMetaV1` | a small per-slot summary so the main menu never parses a full save |
| `menajerPrefsV1` | `PREFS` — theme, language, sound, the ad birth year, the device purchase ledger. Device-level, outside any career |
| `menajerSaveV9` | the old single-save key; `migrateLegacy()` moves it into slot 1 on boot |

The rival layer is a worked example of degrading gracefully: `S.rivals`, `S.chase`,
`S.poach` and every `p.ra`/`p.sa` can be absent. `ensureRivals()` — called from
`newGame()`, `openSlot()` and `simRivals()` — builds the roster on first sight, and
`rivalOf(p)` returns `null` for a player with no `p.ra`, which drops the UI back to the
old unnamed "Rakip menajer" string.

A save written against a *shorter* `RIV_ARCH` is grown rather than rebuilt: `growRivals()`
**appends** the missing archetypes, so every existing index stays put and every `p.ra` in
the save still points at the same agency. The new arrivals don't start empty either —
lowering `RIV.notable` in the same release left a band of players with no `p.ra`, and the
`claimNotable()` that follows the growth hands them out across the whole roster (measured
on a six-agency save: 425 named players → 1,066, every new agency non-empty). If you ever
add an archetype *without* moving the threshold, expect the newcomers to fill up slowly
from weekly signings instead.

The three fields this branch added follow the same rule and are all absent by default:
`S.adb` (which season transitions have spent their ad), `S.iap` (the career purchase
ledger) and `PREFS.iap` (the device one). Every reader falls to a default —
`adBreakClaim()` builds `S.adb` on first use, `iapTokens()` returns `null`.

`validSave()` accepts any save whose `S.fx` length matches `LEAGUES.length`; a slot whose
summary exists but whose payload is broken is dropped from the meta so the menu doesn't
lie. There is no migration step beyond that, so **every new state field must work when
absent from an old save.** Read through a helper with a default (`agMod`, `pref`,
`skillsTaken`, `valueMult`, `trustOf`) rather than touching `S.newThing` directly.
Bumping the save keys wipes everyone's progress — treat it as a last resort.

Anything device-scoped belongs in `PREFS`, not `S`: the main menu runs with `S === null`
and still has to render Settings. `themeOf()` shows the pattern — `PREFS` first, then
`S.theme` for saves written before the split, then the default.

`localStorage` access is wrapped (`lsGet`/`lsSet`/`lsDel`) because storage can be
disabled or full; a failed write must never crash the game.

### Modals are queued

`pushModal`/`runNextModal`/`closeModal` serialise week-end popups (week report,
events, season summary) so they can't stack or race. Events specifically must **not**
be dismissible by clicking outside — `openModal(html, true)` locks them.

A queued function that decides it has nothing to show must call `runNextModal()` rather
than returning silently: the queue only advances on `closeModal()`, so a silent return
strands everything behind it (see `showLevelUp`).

### The inbox has one category dictionary, and Saha reads it differently

`pushNews(key, params, type, action)` is still the only writer of `S.inbox`, and the
record is unchanged: `{w, se, key, params, type, action, read}`. Text is never stored —
`NEWS[L][key](params)` renders it at draw time, which is why an old save reads correctly
after a language switch.

**`IB_CAT` in `js/ui.js` is the single mapping source.** Each of the eleven categories
carries its badge, its bilingual `{tr,en}` name, its filter group and the list of NEWS
keys it owns; `IB_OF` is derived from it once, so there is no second list to keep in
step. Adding a `pushNews` key means adding it to one `keys` array — no behaviour code is
touched. A key with no category falls to `system`, which is also where `tut` lives and
the only category drawing the envelope SVG instead of a webp (`ic:null`). `NEWS.goal` and
`NEWS.perf` are defined but never pushed, so they are deliberately unmapped.

**Saha replaces the view, not the model** — the same gate as `useSahaMarket`/
`useSahaLeague`/`useSahaSkills`. `VIEWS.inbox` branches on `useSahaInbox()`; the other
three themes keep `msgHtml()` and the old bulk-read-on-open untouched. What differs on
Saha is the read model: **opening the inbox marks nothing read.** `ibRead(i)` fires from
a card tap, `ibReadAll()` from the header button, and both skip messages that still carry
an `action` — a decision message stays unread until Accept/Decline runs through
`inboxAction()`. That is why an action card renders with no `onclick` at all rather than
with a handler that checks and returns.

The selected filter (`IBF`) is view state like `MKQ`, `SKTAB` and atlas `CAM`: it never
reaches `S`, so filtering or switching themes cannot touch what has been read. The
`action` filter reads `m.action` directly rather than a category, because a message
waiting on a decision belongs in one place whatever it is about.

### The transfer offer screen keeps its five fields, and Saha changes only the input

`openTransfer()` branches on `useSahaTransfer()` — the same gate pattern as
`useSahaMarket`/`useSahaLeague`/`useSahaSkills`/`useSahaInbox`/`useSahaPlayerProfile`.
The other three themes keep the old modal (range slider, `<select>`s, `.pitem` rows)
byte for byte.

**The offer is still five DOM fields with the same ids and the same units:** `#feeR`
(the fee, in tenths of a million), `#trPay`, `#trGb`, `#trSo`, `#trFix`. On Saha they
are `<input type="hidden">` instead of a range input and four selects, so
`submitOffers()` reads exactly what it always read and its body did not change. That is
what makes the redesign provably mechanics-neutral: the money is computed in
`transferCutFor()` and `transferFixCost()`, both untouched, and the screen only writes
those five values.

`trFin()` is still the one live-update funnel, and it still must never call `render()`
or `openTransfer()` — the buyer list is drawn with `RF()` and reopening would reshuffle
it and drop `trSel`. It patches nodes: the shared `#trBtn` for both paths, and on Saha
`trSahaFin()` for the summary strip. `trToggle()` gained one line, `trSahaToggle()`,
which mirrors the selection onto `aria-pressed` — the single source for both the screen
reader and the CSS that fills the checkbox.

**The fee wheel is a picker, not a new mechanic.** `min`/`max`/step are the old slider's:
`round(v·7)` to `round(v·18)` in whole tenths, opening at `round(v·10)`. `TFW` holds the
wheel's own state (position, window, drag) and never reaches the save, like `CAM` and
`MKQ`. Three things about it are load-bearing:

- **The list is virtual.** A 400M player spans ~7,000 steps, so only ±60 rows around the
  selection exist; the window is rebuilt when the position nears its edge. Position is
  always the *global* index (`TFW.pos`) — the window is a drawing detail.
- **`touch-action: none` on `.tfwGroup`** is what separates the wheel from the sheet's own
  scrolling. A vertical drag that starts on the wheel is the wheel's; everywhere else the
  sheet scrolls normally, and a drag under the 4px threshold changes nothing.
- **`TFW_H` (js/ui.js) and `--tfwh` (css/themes/saha.css) are the same number.** They move
  together or the band stops lining up with the selected row.

Keyboard is `role="spinbutton"` with arrows/PageUp/PageDown/Home/End, `aria-valuetext`
carrying the human form (`12.4M €`) because `aria-valuenow` is in tenths. The ± buttons
repeat while held — with a hundred-plus steps, reaching an end by dragging alone is not a
real option. Reduced motion drops the settle animation and the fling projection.

### Views that own their own DOM

`render()` replaces `#view.innerHTML` wholesale, which destroys any listener attached to
view content. The exploration map therefore re-binds its pointer handlers from
`mapMount()` on every render, and keeps the camera in a module variable (`CAM`) rather
than in `S` — pan/zoom survives a redraw, and nothing transient reaches the save file.
`render()` frames the map with `mapHome()` only when `lastSig` says you actually entered
the view, so a redraw doesn't yank the camera back. Panning writes the `transform`
attribute directly instead of re-rendering; a full redraw per pointer move is visibly
janky on a phone. Any future view with live listeners needs the same moves.

## Conventions

- **Code comments are in Turkish and explain *why*, not *what*.** Keep writing them
  that way. `docs/DEVELOPMENT.md` is Turkish; `README.md` is English and public-facing.
- **Every user-visible string is bilingual.** Add to both `STR.tr` and `STR.en`; the
  counts must match — 498 today, but count them rather than trusting this line; it has
  been stale before. Objects returned from events, themes, branches and
  rival archetypes use `{tr:…, en:…}` and are read with `[L]`. Before adding a key,
  check it isn't taken — `archLbl` already meant "Archive" and a second meaning
  silently overwrote it.
- **Sound is synthesised** with Web Audio (`js/sfx.js`) — no audio assets. A single
  capture-phase listener on `SFX_SEL` fires one sound per tap; don't add `SFX` calls in
  individual handlers, they'd double up.
- **The game makes no network requests at all** — but **the Android app now does.** There
  is still no `fetch`, `XMLHttpRequest` or `WebSocket` anywhere in `js/`, and that has to
  stay true. What changed is underneath it: `adsInit()` runs at every launch — *after* the
  first paint, never blocking it — and `requestConsentInfo()` reaches Google's UMP servers,
  then `MobileAds.initialize()` reaches AdMob's. **The store listing's
  privacy claim can no longer be "the app never goes online" for the Android build**, and
  `xahke.github.io/privacy/pro-football-agent/*.html` still says the opposite — it states
  no ad SDK and no UMP are integrated. That page has to be rewritten before any release,
  and it is also the URL a UMP message would point at. The web/PWA/single-file builds are
  unaffected: no Capacitor, no plugin, no requests. `tools/build-geo.js` does download its
  source, but it is a developer tool that is never loaded by the app; its output is
  committed instead.
  The one exception is an address, not a request: the **Privacy Policy** row in Settings
  (`PRIVACY_URL` in `js/i18n.js`, rendered by `VIEWS.settings`) points at
  `xahke.github.io`. It is a plain `<a target="_blank" rel="noopener noreferrer">` and
  nothing follows it until the user taps it; on Android the tap hands the URL to the
  **external browser** and the WebView stays where it is, and viewing the page needs an
  internet connection. The game itself still fetches nothing, online or off.
  *(Measured on an Android 17 / API 37 emulator with the debug APK: tapping the row logs
  `START ... act=android.intent.action.VIEW ... cmp=com.android.chrome` from uid
  `com.xahke.profootballagent`, with `capturedLink` equal to the `tr.html` or `en.html`
  address for the language selected in Settings. Chrome opens in its own task and the game's
  task keeps `MainActivity`. What the player sees on the way back depends on the route:
  going straight from Chrome to the game through recents came back to the same Settings
  screen at the same scroll position, while backing out of Chrome to the launcher first and
  returning after that reloaded the WebView and opened on the career menu. Don't promise
  either one — the WebView may be reloaded on resume like any Android WebView. What did hold
  in both runs is the save: the career, its season and week and its cash were unchanged
  afterwards, and the game was playable. The mechanism is Capacitor's `Bridge.launchIntent`,
  which fires `ACTION_VIEW` for any host that isn't the app's own; `setSupportMultipleWindows`
  is never enabled, so `target="_blank"` takes that same path.)*

## Naming and trademark policy (hard constraint)

No league, club, cup or tournament name may belong to a real trademark. The full
policy is in `docs/DEVELOPMENT.md`; the rules that matter when touching `js/data.js`:

- **Leagues aren't stored as names.** `lgName()` generates them from country + tier.
  A new league needs only `ctry` and `tier` — and, if the territory is new, geometry in
  `tools/build-geo.js`.
- **Clubs are "city + neutral epithet"** — *İstanbul Sentinels*, *Manchester Ironworks*.
  The **city must match the real club's city** so players can tell who's who. Multiple
  clubs share a city (six in İstanbul, seven in London); the epithet distinguishes them,
  and each club carries a three-letter `ab` used on badges.
- Epithets must avoid: translations of the real name (Royals, United, City, Athletic,
  Inter), club nicknames (Lions, Eagles, Canaries, Gunners, Magpies), and words that
  are themselves club names (Rangers, Rovers, Wanderers, Albion, Forest, Hotspur).
- Club colours are for visual variety and don't represent anyone.

## Verifying changes

There's no test suite, so changes are checked by running the game headlessly in a Node
`vm` sandbox with a minimal DOM shim, then measuring rather than assuming. The standard
close-out for a gameplay change:

1. **Full-app scan** — walk every view, tab, league, cup and modal in **both languages**
   and assert no `undefined`, `NaN` or `[object Object]` reaches the DOM. This catches
   more real bugs than anything else here. Strip `on*="…"` attributes before the test:
   handler bodies are code, and `buyScout(3)` is not a leaked value.
2. **Multi-season regression** — run 6–8 seasons and check the background world holds:
   population stable (~7,000), age pyramid intact (16–36, mean ~25), free-agent pool in
   equilibrium (`FAMAX` is 60), no crash. Also track the **unrepresented pool**
   (`p.agent === null`, ~4,500): rival agencies sign out of it every week, so a change to
   `RIV.signRate`/`loseRate`/`chaseW` — or the roster size, if `rivScale()` ever stops
   compensating — can drain the market screen over a career without touching any of the
   numbers above. Today it is flat (4,566 → 4,529 over 8 seasons; on the same seed the
   six-agency world ran 4,575 → 4,554).
3. **Measure the thing you changed.** Balance claims need numbers — event expected
   value, reputation progression across seasons, acceptance probability distributions,
   ability↔rating correlation. Bots that play a strategy to its extreme (always take the
   cash, always chase relationships) expose exploits that per-item tables can't, because
   tables can't see future costs.
4. **Map**, if `js/atlas.js`, `js/worldgeo.js` or `LEAGUES[].ctry` changed — assert that
   every territory in `terrList()` has a `GEO.t` entry and that `GEO.t` has no orphan
   (atlas.js filters both silently, so a mismatch is invisible at runtime); that each
   marker `a` falls inside its own `bb`; that `GEO.ctx` is present. Marker crowding is a
   visual check at zoom, not a fixed threshold — markers rescale with `mapMarkScale()`,
   and the closest pair today is DE–NL at 44 units in a 3753-wide viewBox.
   Then re-check `scoutCost()` across all 22 leagues against the 250K opening cash.
5. **Themes** — 4 themes × every screen. Also assert that every class the new markup emits
   and every `--*` variable it references resolves inside all four scoped blocks of the
   compiled `css/style.css`; that catches a theme silently missing a rule.
6. **Old-save compatibility** — load a save with the new fields deleted, and check the
   legacy path: a `menajerSaveV9` payload must land in slot 1 with its theme/language
   carried into `PREFS`.
7. **Ads and purchases**, if `js/ads.js`, `js/iap.js`, `js/sim.js`'s transition points or
   the store screen changed — `node tools/savetest.js` blocks **18–23** cover the rewarded
   adapter, the consent flow, the age gate, the privacy feedback, the season-transition
   contract and the store's scope/ceiling rules. They prove what the JS asked the bridge to
   do and nothing more; whether an ad really appeared is only measurable on a device, and
   the EEA debug variant is not the build to measure it on (see *Test geography*).
8. `npm run themes && npm run dist`, and bump `sw.js` `CACHE` if any cached file changed.
   A new JS file also needs `index.html`, the `order` array in `build.js` and the `SHELL`
   array in `sw.js`.

A caveat learned the hard way on the full-app scan: build the fixture from real game
state, not by hand. A synthetic `S.wkRep` row pointing at a clubless client crashes
`showWeekReport` on `S.teams[-1]` — a state `simWeek()` can never produce, so the failure
is in the test, not the game.

Long simulations get killed by short command timeouts; run them as several short passes
or in parallel processes rather than one long one.

## Release notes

`capacitor.config.json` is the **single source of the app's identity**: `appId` is
`com.xahke.profootballagent` and `appName` is `Pro Football Agent`. The Gradle
`applicationId`/`namespace`, the `MainActivity` package and `strings.xml` all repeat
those two values, and CI reads them back out of the built APK and compares against the
config — so a change made in one place and forgotten in another fails the build rather
than shipping. The id is **permanent once published** to the Play Store.

The web app is deliberately *not* renamed: `manifest.json` and `index.html` still say
**Menajer**, and every in-game Turkish string still says *menajer*, because that is the
word the game is written in. `Pro Football Agent` is the Android launcher label and the
store name, nothing else. Don't "fix" the difference with a global replace.

**Release signing is local only.** `android/keystore.properties` holds the four values
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) and is gitignored along with
`*.jks`/`*.keystore`; only `android/keystore.properties.example` is committed. CI does
not sign — GitHub Actions builds a debug APK and nothing else.

The key is an **upload key**, not the distribution key: Play App Signing re-signs the
bundle with Google's key, so losing this one is recoverable through a Play upload-key
reset rather than fatal. Back it up anyway; the reset takes days.

`android/app/build.gradle` reads that file at configuration time and, if any of the four
values or the keystore file itself is missing, **fails the release task** instead of
producing an unsigned bundle — a silent unsigned AAB looks like success and only breaks
at the Play Console. The failure names the missing *field* and never prints a value:
Gradle output reaches logs, CI records and screenshots. Debug builds and CI keep working
with no keystore at all, so don't "fix" that path by making the config mandatory.

`versionCode` must increase on every Play upload; the same number cannot be uploaded
twice. Ads are planned for the store release and are not implemented yet, so don't claim
the app is ad-free.

### Every icon and the splash come from one source file

`store-assets/source/pro-football-agent-icon-master.png` (2048x2048) is the master.
Every launcher density, the Android 12+ splash icon, the legacy splash rasters and the
Play Store icon are square-to-square rescales of it — no crop, no stretch, no frame, no
text. Changing the artwork means replacing that one file and regenerating; editing a
density by hand puts the tree out of step with its own source.

**The Play Store icon is uploaded separately from the launcher icon.** Play Console does
not read it out of the AAB. `store-assets/google-play/icon-512.png` is that upload:
512x512, 32-bit PNG (alpha present but the composition fully opaque), sRGB, at most
1024 KB, full square with **no** rounded corners — Play rounds it in its own UI and a
baked-in radius shows up on top of that.

The adaptive foreground fills **100% of the 72dp viewport**, so square, circle and
squircle masks all show artwork edge to edge and `@color/ic_launcher_background`
(`#0B111E`) is only visible during launcher parallax. Shrink the foreground and you open
a gap under the mask.

The splash is `#0B111E` everywhere, read from `values/splash_background.xml` because it
is painted along two different paths. `AppTheme.NoActionBarLaunch` derives from
`Theme.SplashScreen.IconBackground`, which is what makes the Android 12+ system splash
expect a **240dp** asset masked to a **160dp** circle — `drawable-*/ic_splash_icon.png`
is generated at exactly that. Switching the parent back to plain `Theme.SplashScreen`
changes the contract to 288dp/192dp and the asset would have to be regenerated with it.
Pre-12 keeps the Capacitor `drawable-{port,land}-*/splash.png` rasters at their original
dimensions, with the same disc at 160dp so both eras carry the same visual weight.

**Monochrome / themed icons are deliberately not offered** — the user decided against
them. There is no `<monochrome>` layer and no `mipmap-anydpi-v33`; Android 13+ uses the
normal colour adaptive icon. Don't add one back as a "fix".
