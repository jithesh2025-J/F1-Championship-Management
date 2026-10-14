# Data attribution and licence notes

## Primary dataset

Historical schedules, drivers, constructors, qualifying, race results, sprint results and pit stops for 2023–2025 are downloaded from the **Jolpica-F1** HTTP API:

https://api.jolpi.ca/ergast/f1/

Jolpica is an Ergast-compatible implementation. See https://github.com/jolpica/jolpica-f1 for project licence and usage notes. This coursework uses the API for **local educational analysis** with:

- conservative pacing and retry limits
- on-disk caching (`data/raw/`, gitignored)
- no API calls when the Flask app starts

Do not republish the cached JSON as an independent “F1 results dump” without reading Jolpica’s licence and any upstream restrictions.

## Cross-check (human)

Official Formula 1 result pages may be opened in a browser to sanity-check a weekend. They are **not** scraped by this repository.

## Application-generated rows

Sponsors, team-sponsor deals and penalties created in the UI are flagged `IS_ILLUSTRATIVE = 'Y'`. They must not be presented as historical F1 commercial or stewarding records. Standings views ignore `SOURCE_SYSTEM = 'ILLUSTRATIVE'`.
