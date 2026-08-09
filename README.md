# Menajer

**A football agent simulation.** You don't manage a club — you manage careers.
Find undervalued players, move them to the right clubs, negotiate their contracts,
and take your cut.

Text-based, mobile-first, runs entirely in the browser and works offline.
Turkish and English.

> **Status: in development.** Playable end to end, but systems and balance are
> still changing. Store releases for Android and iOS are planned.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![No dependencies](https://img.shields.io/badge/dependencies-none-blue)
![Offline](https://img.shields.io/badge/offline-yes-blue)
![TR / EN](https://img.shields.io/badge/language-TR%20%2F%20EN-blue)

---

## Play it

Download **[`dist/menajer.html`](dist/menajer.html)** and open it. That's the whole
game in one file — no install, no server, no internet.

Or clone the repo and open `index.html`.

---

## What you actually do

You start in a small office with nobody's idea of a reputation. Players at big
clubs won't take your call — but there are gems in lower divisions and in Africa
that nobody is watching. That's your opening.

- **Scout.** You only see leagues you've built a network in. Networks cost money
  and take weeks to establish. Where you invest decides which talent you can reach.
- **Pitch.** Signing a client is a conversation, not a button. The young prospect,
  the unhappy veteran and the underpaid starter each want to hear something else.
- **Negotiate.** Clubs won't reopen a contract without a reason — it's expiring,
  he's on a run of form, or he's paid well under market. Push too hard and talks
  collapse, and your reputation takes the hit.
- **Move him.** Offer to several clubs at once and structure the deal: instalments
  and goal bonuses make clubs say yes, a sell-on clause makes them hesitate but
  pays later.
- **Keep him.** Morale comes from his club and the pitch. **Trust** comes from you.
  Events force you to choose between the money and the relationship.
- **Specialise.** Reputation levels you up, and every level buys a node on a skill
  tree that runs out from your agency in four directions — the table, the field,
  the agency, the network. A node only opens next to one you already hold, and the
  four branches cost more than any career can earn. You will not finish them all.

Your commission scales with reputation — 5% when nobody knows you, up to 15% once
your name opens doors.

---

## The world runs without you

The part most small football sims skip. All of this happens whether you're watching
or not:

- **22 leagues, 436 clubs, ~7,000 players** across 6 continents and 52 nationalities.
- **Clubs trade with each other** every transfer window — around two signings and
  two departures per club per season, inside budgets tied to their standing.
- **Contracts genuinely expire.** Clubs decide who to renew; the rest become free
  agents. A fresh crop of quality players hits the market every season, and some
  run their contracts down deliberately.
- **Careers end.** Players age, decline and retire; youth come through. The age
  pyramid holds its shape over decades instead of the world quietly growing old.
- **Promotion and relegation** across six countries, three continental cups, and a
  national-team tournament every fourth season.

---

## Match engine

A player's rating isn't a dice roll. It comes from three parts:

1. **Expectation** — his ability, form and morale, judged both in absolute terms
   and against the opposition he's facing.
2. **Consistency** — morale sets how wide his range is. A settled player performs
   in a narrow band; an unhappy one swings.
3. **Contribution** — goals, assists, clean sheets.

Over a full season, ability correlates **0.82** with average match rating, and the
ratings land where football ratings should: median 6.4, top decile 7.5.

---

## Four looks

Same game, four complete visual designs — switch any time from Settings without
touching your progress.

**Dossier** (default) · **Newsprint** · **Terminal** · **Pitch**

Each is a standalone stylesheet under `css/themes/`. A build step scopes them under
`html[data-theme]` and merges them into one file, so switching costs nothing at
runtime.

---

## Tech

No framework, no bundler, no dependencies. Plain HTML, CSS and JavaScript —
~3,400 lines across nine files, each with one job.

- **Offline first.** A service worker caches the app shell; the single-file build
  needs nothing at all.
- **Saves are local**, in `localStorage`. The game currently makes no network
  requests of any kind.
- **Sound is synthesised** with Web Audio — no audio files shipped.
- **Fully bilingual**: 240 translation keys, Turkish and English both complete.

---

## Names

Every league, club and cup name in the game is original. Clubs follow a
"city + neutral epithet" pattern — *İstanbul Sentinels*, *Manchester Ironworks*,
*Madrid Pioneers* — where the city matches the real club's city so you can tell
who's who, without using anyone's trademark. Leagues aren't stored as names at all;
they're generated from country and tier.

---

## Extending it

| Want to add | Where |
|---|---|
| An event with player choices | `js/events.js` — one array entry |
| A visual theme | `css/themes/` + one entry in `THEMES` |
| A league or country | `js/data.js` |
| A nationality | `js/data.js` — name pool, continent, home league |

Build commands, architecture and the full naming policy are in
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

```bash
npm run dist      # → dist/menajer.html (single file)
npm run serve     # local server for development
```

---

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with any football club, league or governing body. All names in the
game are fictional.
