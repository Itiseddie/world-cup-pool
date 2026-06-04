# World Cup Office Pool Dashboard

This is a static dashboard prototype for GitHub Pages.

## What it uses

- `index.html` for the app shell
- `styles.css` for the responsive dashboard styling
- `app.js` for live Google Sheet loading
- `manifest.webmanifest` so participants can add it to their phone home screen

The app reads these public Google Sheet tabs through Google's Visualization endpoint:

- `ASSIGNMENTS_VIEW`
- `TEAMS_MASTER`
- `TOURNAMENT_RESULTS`

## Views

- Full dashboard: `index.html`
- Compact widget: `index.html?view=widget`

## GitHub Pages setup

1. Create a public GitHub repository.
2. Upload these files to the repository root.
3. In GitHub, go to Settings > Pages.
4. Set the source to the main branch and root folder.
5. Share the published `github.io` URL with participants.

No participant needs a GitHub account to view the public dashboard.

## Sheet privacy note

Anyone who can open the dashboard can effectively read the public Sheet data used by the dashboard. Keep emails, payment details, and private notes out of the public tabs.
# world-cup-pool
The pool with a world cup
