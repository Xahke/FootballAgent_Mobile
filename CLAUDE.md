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
npm run dist         # themes + build.js → dist/menajer.html (single-file build)
npm run www          # themes + build-www.js → www/         (what Capacitor packages)
npm run serve        # local server on :5173

npm run android:apk  # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:aab  # → android/app/build/outputs/bundle/release/app-release.aab (must be signed)
npm run android:sync # refresh www/ into the Android project after code changes

node tools/build-geo.js   # → js/worldgeo.js (map geometry; dev-only, downloads once)
```

`npm run android:add` creates `android/` once. GitHub Actions
(`.github/workflows/android.yml`) builds a debug APK on every push to `main` and on
manual dispatch — use it instead of installing Android Studio.

There is **no test runner, linter or formatter** in the repo. See *Verifying changes*
below for how work actually gets checked.

## Architecture

### No build system — script order is the dependency graph

Plain HTML/CSS/JS. No framework, no bundler, no runtime dependencies. Everything is a
global, loaded in the order listed in `index.html`. A function defined in `ui.js` can
call one from `core.js` because `core.js` loaded first — nothing enforces this, so
load order is the contract.

**Adding a JS file means updating three places, or things break silently:**

1. `index.html` — `<script>` tag, in the right position
2. `build.js` — the `order` array (single-file build)
3. `sw.js` — the `SHELL` array, **and bump `CACHE`** (otherwise offline users get a
   stale shell missing the new file)

`npm run www` copies `js/` wholesale, so there is no fourth place.

`js/badges.js` was the most recent file to go through this, and it is a worked
example: it sits after `data.js` (badges read a team object) and before `core.js`
(where `tmBadge()` lives), and the same position appears in all three lists.

Load order:
`i18n → store → saves → data → worldgeo → atlas → rivals → badges → core → sim → market → events → skills → sfx → actions → ui → main`

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
| `js/i18n.js` | `L`, `STR{tr,en}` (380 keys each, must stay equal), `NEWS` templates, `t()`, link helpers |
| `js/saves.js` | Three save slots, slot summaries for the main menu, device prefs (`PREFS`), legacy migration |
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
| `S.rep += x` | `repEvent(x)` | applies `repFactor()` soft cap and `skillBonus('repg')`, tracks `S.repMax`, counts level-ups into `S.lvUp` |
| `p.trust += x` | `trustEvent(p, x)` | applies `skillBonus('trust')` |
| `p.morale += x` | `moraleEvent(p, x)` | applies `skillBonus('mor')` to your clients' losses, clamps and rounds to 1 decimal |
| any 0–100 stat | `stat(v, min)` | prevents 14-digit float drift showing in the UI |

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
  `maxClients()` is `2 + floor(rep/18)`, so low reputation means few clients, which
  means few reputation sources.

  Losses are deliberately **not** throttled — `repEvent()` applies `repFactor()` to gains
  only — so past the floor a career settles wherever throttled income meets full-price
  damage. Measured over 25 seasons of a bot that plays only for reputation, that
  equilibrium sits near **rep 100**. **This constant, not the skill point budget, is what
  decides how much of the tree a career can ever reach** — see `LV` below.
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

  Measured: a headless bot playing purely for reputation — fills every client slot, moves
  every client to a stronger club every window, takes the highest-reputation option in
  every event, buys every affordable network — ends **25 seasons at rep 100, level 11,
  12 of 32 points**, having earned 348 nominal reputation (~14/season) and flattened out
  from about season 19. Level 27 needs 2,875 nominal; even granting that the rate roughly
  doubles as client slots grow, that is a hundred-plus seasons. Nobody finishes the tree,
  and nobody comes close to three branches either.

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
| `menajerPrefsV1` | `PREFS` — theme, language, sound. Device-level, outside any career |
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
  counts must match (380 today). Objects returned from events, themes, branches and
  rival archetypes use `{tr:…, en:…}` and are read with `[L]`. Before adding a key,
  check it isn't taken — `archLbl` already meant "Archive" and a second meaning
  silently overwrote it.
- **Sound is synthesised** with Web Audio (`js/sfx.js`) — no audio assets. A single
  capture-phase listener on `SFX_SEL` fires one sound per tap; don't add `SFX` calls in
  individual handlers, they'd double up.
- **The game makes no network requests at all.** There is no `fetch`, `XMLHttpRequest`
  or `WebSocket` anywhere in `js/`. Keep it that way — it's the basis of the privacy
  claim for the store listing. `tools/build-geo.js` does download its source, but it is a
  developer tool that is never loaded by the app; its output is committed instead.

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
7. `npm run themes && npm run dist`, and bump `sw.js` `CACHE` if any cached file changed.
   A new JS file also needs `index.html`, the `order` array in `build.js` and the `SHELL`
   array in `sw.js`.

A caveat learned the hard way on the full-app scan: build the fixture from real game
state, not by hand. A synthetic `S.wkRep` row pointing at a clubless client crashes
`showWeekReport` on `S.teams[-1]` — a state `simWeek()` can never produce, so the failure
is in the test, not the game.

Long simulations get killed by short command timeouts; run them as several short passes
or in parallel processes rather than one long one.

## Release notes

`capacitor.config.json` `appId` is `com.berkin.menajer` — **permanent once published**
to the Play Store. Signing keys (`*.jks`, `key.properties`) are gitignored; losing the
keystore means the app can never be updated again. Ads are planned for the store
release and are not implemented yet, so don't claim the app is ad-free.
