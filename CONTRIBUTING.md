# Contributing to fixtical

Thanks for considering a contribution! These are guidelines, not hard rules; use your best judgment and
feel free to propose changes to this document.

## What belongs here

Changes are welcome when they:

- follow a change of a data source fixtical reads;
- add a source (another federation or sport), an output format or a calendar feature;
- fix a bug, improve tests or documentation.

Keep the load on the sources small: one build every few hours, a polite gap between requests and
nothing fetched that a calendar does not need.

## Getting started

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run bundle   # rebuilds dist/, which the action runs from
```

Node 24 runs the TypeScript sources directly (`npm run fixtical -- --help`); there is no build step
besides the bundle.

## Style

- Follow the existing code: TypeScript in strict mode, formatted and linted by Biome (`npm run format`).
- Add or update tests for every behaviour change; coverage must stay above the thresholds in
  [`vitest.config.ts`](vitest.config.ts). Sources are tested against recorded pages, never the live site.
- Commit the rebuilt `dist/` with every change to `src/`: CI fails when it is out of date.
- Explain _why_ in comments where a source forces something unusual.
- Write code, comments, commit messages and issues in English.

## No secrets, no personal setups

Never commit tokens, gist ids or addresses, notification topics, API keys or logs that contain them,
not even as examples. Use placeholders such as `<gist-id>`. CI refuses anything shaped like a
credential. Your own calendars belong in your fork's `fixtical.yml`, not in a pull request.

## Pull requests

Open pull requests against the `dev` branch. CI must be green before review.

## Releases

Raise the version in `package.json` on `dev`, merge `dev` into `main`, then tag the merge commit
`vX.Y.Z`, move the major tag (`v1`) to it and publish a GitHub release from the tag.
