# fixtical

[![CI](https://img.shields.io/github/actions/workflow/status/lmipsum/fixtical/ci.yml?branch=main&label=ci&style=plastic)](https://github.com/lmipsum/fixtical/actions/workflows/ci.yml)
[![Secrets scan](https://img.shields.io/github/actions/workflow/status/lmipsum/fixtical/secrets-scan.yml?branch=main&label=secrets%20scan&style=plastic)](https://github.com/lmipsum/fixtical/actions/workflows/secrets-scan.yml)
[![Release](https://img.shields.io/github/v/release/lmipsum/fixtical?style=plastic)](https://github.com/lmipsum/fixtical/releases/latest)
[![License](https://img.shields.io/github/package-json/license/lmipsum/fixtical?style=plastic)](LICENSE)
[![Node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Flmipsum%2Ffixtical%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&color=339933&logo=nodedotjs&logoColor=white&style=plastic)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/lmipsum/fixtical/dev/typescript?style=plastic&logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/github/package-json/dependency-version/lmipsum/fixtical/dev/%40biomejs%2Fbiome?style=plastic&label=biome&logo=biome&logoColor=white&color=60A5FA)](https://biomejs.dev/)

Match calendars (iCalendar feeds) for Hungarian football, water polo and volleyball teams.

A GitHub Actions workflow builds them every six hours: league and cup matches with kick-off times,
venues and results. Any team can be followed, from the top flight to county leagues, men's and women's,
futsal and youth teams.

## Ready-made calendars

The teams of Újpest FC (football and futsal), UVSE (water polo) and UTE (volleyball), built by this
repository: subscribe on <https://lmipsum.github.io/fixtical/>, no fork needed.

For another team, see the quick start below.

## Not covered

- **Ice hockey:** the Erste Liga publishes calendars for its teams, so fixtical has no source for it. Subscribe
  to the league's own feed, e.g. UTE: `https://i.cal.to/ical/8946/erste-liga/ute/hu/2d6a463e.9bef1308-39be8b42.ics`.

## Quick start

Your own calendars, built by GitHub Actions and published on GitHub Pages:

1. **Fork** this repository.
2. In your fork, open the **Actions** tab and enable workflows.
3. Choose your team in [`fixtical.yml`](fixtical.yml) (see [Configuration](#configuration)). The simplest way:
   open your team's page in the MLSZ data bank, copy its address, and put it in as `team_url`.
4. **Settings → Pages**: set _Source_ to _GitHub Actions_. Then **Settings → Secrets and variables →
   Actions → Variables**: add `FIXTICAL_PAGES` with the value `true`.
5. In **Actions**, run the **calendars** workflow once by hand. From then on it runs every six hours.

Your calendar is at `https://<your-user>.github.io/fixtical/<slug>.ics`. The page
`https://<your-user>.github.io/fixtical/` lists every calendar of your fork.

To subscribe, add the address as a calendar _from URL_ (Google Calendar: _Other calendars → From URL_;
Apple Calendar: _File → New Calendar Subscription_; Outlook: _Add calendar → Subscribe from web_).
Calendar apps refresh subscriptions on their own schedule, from every few hours to once a day.

The workflow keeps its schedule enabled itself, so GitHub does not pause it after 60 days without
commits. A calendar whose matches could not be read for two days shows a _not updated since_ event on the
current day.

## Configuration

`fixtical.yml` lists the calendars to build, each a feed of its own:

```yaml
calendars:
  # Football: the club's number in the football data bank.
  - source: mlsz
    slug: ujpest
    color: "#623A96"
    club: 14374
    category: men
  # The reserve team: one competition only (a regular expression), and its league without the cups.
  - source: mlsz
    slug: ujpest-ii
    color: "#623A96"
    club: 14374
    category: men
    competition: "NB III"
    include: [league]
  # Water polo: the club's number in the water polo data bank.
  - source: mvlsz
    slug: uvse
    color: "#4A287F"
    club: 197
    category: men
  # Volleyball: the team's name as the federation's results write it.
  - source: mrsz
    slug: ute-roplabda
    color: "#42216F"
    team: UTE
    category: women
```

A calendar is named after the team, as the source names it (e.g. _Újpest FC_). Kick-off times are in
Hungarian time (`Europe/Budapest`), and the event texts are in Hungarian.

| Setting                   | Default         | Meaning                                                                        |
| ------------------------- | --------------- | ------------------------------------------------------------------------------ |
| `calendars[].source`      | `mlsz`          | `mlsz` football, `mvlsz` water polo, `mrsz` volleyball.                        |
| `calendars[].slug`        | from the team   | File name of the calendar: `<slug>.ics`. Lowercase letters, digits and dashes. |
| `calendars[].color`       | none            | Suggested colour (`#rrggbb`) for Apple Calendar.                               |
| `calendars[].team_url`    |                 | Address of the team's page. It stays valid across seasons.                     |
| `calendars[].club`        |                 | The club's number, instead of `team_url`.                                      |
| `calendars[].team`        |                 | The team's name as the source writes it (volleyball).                          |
| `calendars[].federation`  | `0`             | `0` for national competitions, `1`–`20` for a county's own.                    |
| `calendars[].category`    | `men`           | `men`, `women`, `futsal`, `women-futsal` or `youth`.                           |
| `calendars[].competition` |                 | A regular expression narrowing the competitions, e.g. `U19`.                   |
| `calendars[].include`     | `[league, cup]` | Leave out the cups, or the league.                                             |

Water polo calendars (`source: mvlsz`) need the repository secret `FIXTICAL_MVLSZ_KEY`; their `category` is
`men` or `women`, and every competition of that team in the current season is followed.

Volleyball calendars (`source: mrsz`) follow a team by its name, e.g. `team: UTE` with `category: women`, in
every competition of the current season.

With `club` and `category`, the club's first team of that category is followed: its league and its cups.
New seasons need no change.

## Venue addresses

The events carry the venue's street address and map location, so calendar apps can open it on a map.
Each venue is looked up once and remembered. By default the addresses come from OpenStreetMap; they
sometimes lack the house number, which Apple Calendar needs to read a location as an address.

For addresses with house numbers, add your own Google Maps Platform API key as the repository secret
`FIXTICAL_GOOGLE_MAPS_KEY`: create it in the Google Cloud console with the _Places API (New)_ enabled and the
key restricted to that API. A few lookups a season stay within the free tier. The key is never written to
the repository or the run log.

## Notifications

With the repository secret `FIXTICAL_NTFY_TOPIC` set to the name of an [ntfy](https://ntfy.sh/) topic
(the name only, not the address), a message goes to that topic when a calendar stops updating and when it
recovers. Anyone who knows a topic's name can post to it: keep it as a secret. To check it, run the
**calendars** workflow by hand with _Send a test notification_ ticked.

These secrets can also be added to an environment named `production` (Settings → Environments)
whose deployment branches are limited to the default branch: then no workflow on another branch can read them.

## Annotations

Another tool can add a few lines to the event of a match day, for example ticket availability, with a
[repository dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) of type
`annotations` whose `client_payload` is `{"producer": "<name>", "annotations": { ... }}`. The calendars are
rebuilt at once. The `annotations` object looks like this:

```json
{
  "updated_at": "2026-11-03T08:00:00Z",
  "calendars": {
    "ujpest": {
      "2026-11-08": { "lines": ["Away tickets on sale"], "url": "https://example.com/tickets" }
    }
  }
}
```

The lines and the link go into the description of that day's match. Lines are plain text (at most five,
200 characters each), the link must be `https`, a day without a match is ignored, and annotations whose
`updated_at` is more than 24 hours old are skipped. The calendars keep the latest annotations of each
producer, unpublished, until they are 24 hours old; newer ones replace them. Several
producers are merged in name order.

## JSON

Next to every `<slug>.ics` there is a `<slug>.json` with the same matches, for websites, bots or other
tools: `schema` (currently `1`), `slug`, `name`, `timezone`, `generated_at` and `fixtures`, each with
`date`, `time`, `start` (UTC), `home`, `away`, `at_home`, `venue`, `location` (address and coordinates),
`competition`, `result`, `url` and `annotation` (always empty here: annotations appear in the calendars only).

## Command line

```sh
npm ci
node dist/cli.js build --config fixtical.yml --out public
```

The calendars, their JSON and an index page are written to `--out`, together with `state.json`, which the
next build reads back (`--state` to keep it elsewhere).

## Adding a source

A source turns one data bank into matches. It is a module in [`src/sources/`](src/sources/) implementing
the `Source` interface of [`src/sources/types.ts`](src/sources/types.ts): `validate` checks a calendar's
settings, `resolve` finds the teams for the current season (its result is kept for the season), and
`fixtures` returns their matches. Register it in [`src/sources/index.ts`](src/sources/index.ts) and test it
against recorded pages in `test/fixtures/<source>/`. Calendars choose it with `source: <name>`.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run bundle   # rebuilds dist/, which the action runs from: commit it with the change
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and [SECURITY.md](SECURITY.md) for
reporting a security problem.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE). The Apple and Google icons of the subscribe page are from
[Font Awesome Free](https://fontawesome.com) (CC BY 4.0).
