# Security Policy

fixtical runs in GitHub Actions with credentials its owner keeps in the repository's secrets: a token
that can write a gist, the gist's id, a notification topic and a geocoding API key. Please report
anything that could leak one of them, publish a calendar its owner keeps unlisted, or let someone
else change what a calendar shows, privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/lmipsum/fixtical/security/advisories/new).
Please do not open a public issue for security problems.

Include what you found, how to reproduce it, and the version (commit) you tested. Redact tokens, gist
ids and addresses, notification topics and API keys from logs and configuration.

## Supported versions

Only the latest release receives fixes.
