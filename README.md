# fixtical

[![CI](https://img.shields.io/github/actions/workflow/status/lmipsum/fixtical/ci.yml?branch=main&label=ci&style=plastic)](https://github.com/lmipsum/fixtical/actions/workflows/ci.yml)
[![Secrets scan](https://img.shields.io/github/actions/workflow/status/lmipsum/fixtical/secrets-scan.yml?branch=main&label=secrets%20scan&style=plastic)](https://github.com/lmipsum/fixtical/actions/workflows/secrets-scan.yml)
[![Release](https://img.shields.io/github/v/release/lmipsum/fixtical?style=plastic)](https://github.com/lmipsum/fixtical/releases/latest)
[![License](https://img.shields.io/github/package-json/license/lmipsum/fixtical?style=plastic)](LICENSE)
[![Node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Flmipsum%2Ffixtical%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&color=339933&logo=nodedotjs&logoColor=white&style=plastic)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/lmipsum/fixtical/dev/typescript?style=plastic&logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/github/package-json/dependency-version/lmipsum/fixtical/dev/%40biomejs%2Fbiome?style=plastic&label=biome&logo=biome&logoColor=white&color=60A5FA)](https://biomejs.dev/)

Match calendars (iCalendar feeds) for Hungarian football, water polo and volleyball teams: league and cup
matches with kick-off times, venues and results, built by GitHub Actions and published on GitHub Pages.

## Ready-made calendars

Újpest FC (football and futsal), UVSE (water polo) and UTE (volleyball): <https://lmipsum.github.io/fixtical/>.

## Not covered

- **Ice hockey:** subscribe to the Erste Liga's own feed, e.g. UTE:
  `https://i.cal.to/ical/8946/erste-liga/ute/hu/2d6a463e.9bef1308-39be8b42.ics`.

## Quick start

1. **Fork** this repository, and enable workflows in its **Actions** tab.
2. Set your team in [`fixtical.yml`](fixtical.yml) (see [Configuration](#configuration)), e.g. the address of
   its page in the MLSZ data bank as `team_url`.
3. **Settings → Pages**: _Source_ to _GitHub Actions_. **Settings → Secrets and variables → Actions →
   Variables**: `FIXTICAL_PAGES` = `true`.
4. Run the **calendars** workflow once by hand.

The calendars are at `https://<your-user>.github.io/fixtical/<slug>.ics`, listed with subscribe buttons on
`https://<your-user>.github.io/fixtical/`.

## Configuration

`fixtical.yml` lists the calendars, each a feed of its own:

```yaml
calendars:
  - source: mlsz
    slug: ujpest
    color: "#623A96"
    club: 14374
    category: men
  - source: mlsz
    slug: ujpest-ii
    club: 14374
    competition: "NB III"
    include: [league]
  - source: mvlsz
    slug: uvse
    club: 197
  - source: mrsz
    slug: ute-roplabda
    team: UTE
    category: women
```

| Setting                   | Default         | Meaning                                                                                           |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `calendars[].source`      | `mlsz`          | `mlsz` football, `mvlsz` water polo (needs the `FIXTICAL_MVLSZ_KEY` secret), `mrsz` volleyball.   |
| `calendars[].slug`        | from the team   | File name of the calendar: `<slug>.ics`. Lowercase letters, digits and dashes.                    |
| `calendars[].color`       | none            | Calendar colour, `#rrggbb`.                                                                       |
| `calendars[].team_url`    |                 | Address of the team's page (football).                                                            |
| `calendars[].club`        |                 | The club's number in the data bank (football, water polo).                                        |
| `calendars[].team`        |                 | The team's name as the source writes it (volleyball).                                             |
| `calendars[].federation`  | `0`             | `0` for national competitions, `1`–`20` for a county's own (football).                            |
| `calendars[].category`    | `men`           | `men`, `women`, `futsal`, `women-futsal` or `youth`; water polo and volleyball: `men` or `women`. |
| `calendars[].competition` |                 | A regular expression narrowing the competitions, e.g. `U19`.                                      |
| `calendars[].include`     | `[league, cup]` | Leave out the cups, or the league.                                                                |

Times are in `Europe/Budapest`, the event texts in Hungarian.

## Annotations

Another tool can add lines and a link to the event of a match day with a
[repository dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) of type
`annotations`:

```json
{
  "event_type": "annotations",
  "client_payload": {
    "producer": "<name>",
    "annotations": {
      "updated_at": "2026-11-03T08:00:00Z",
      "calendars": {
        "ujpest": {
          "2026-11-08": { "label": { "hu": "Vendégjegy", "en": "Away tickets" }, "url": "https://example.com/tickets" }
        }
      }
    }
  }
}
```

- `producer`: lowercase letters, digits and dashes; several producers are merged in name order.
- `lines`: plain text, at most five, 200 characters each; they go into the event's description.
- `url`: `https`; the event's link until kick-off (to the end of the day while the time is not set), then the
  match's page.
- `label`: names `url` in the description as `<label>: <url>`; one text, or one per language tag. The calendar
  shows the Hungarian one, else the first one.
- Annotations whose `updated_at` is more than 24 hours old are skipped, and a day without a match is ignored;
  `annotations` is at most 64 KB.

## JSON

Next to every `<slug>.ics` there is a `<slug>.json`: `schema` (currently `1`), `slug`, `name`, `timezone`,
`generated_at` and `fixtures`, each with `source`, `id`, `date`, `time`, `start` (UTC), `home`, `away`,
`at_home`, `venue`, `location` (address and coordinates), `competition`, `result` and `url`.

## Command line

```sh
npm ci
node dist/cli.js build --config fixtical.yml --out public [--state DIR]
```

Writes the calendars, their JSON, an index page and `state.json` to `--out`; the next build reads the state
back from there, or from `--state`.

## Adding a source

Implement the `Source` interface of [`src/sources/types.ts`](src/sources/types.ts) in `src/sources/<name>.ts`,
register it in [`src/sources/index.ts`](src/sources/index.ts), and test it against recorded pages in
`test/fixtures/<name>/`.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run bundle   # rebuilds dist/, which the action runs from: commit it with the change
```

See [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) for reporting a security problem.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE). The Apple and Google icons of the subscribe page are from
[Font Awesome Free](https://fontawesome.com) (CC BY 4.0).
