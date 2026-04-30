# GraphQL Profile Project

A complete profile page app using the school GraphQL API:

- Login with `username:password` or `email:password`
- JWT auth flow (signin + Bearer token for GraphQL)
- Profile data cards (basic info, XP, results/grades)
- Two SVG statistics graphs:
  - XP progression over time
  - Pass / Fail ratio
- Logout support

## Hosted on Github

[https://ethical-hacker-05.github.io/graphql/](https://ethical-hacker-05.github.io/graphql/)

## Run locally

This project is static HTML/CSS/JS with no build step.

```bash
python -m http.server 8080
```

Then open:

[http://localhost:8080](http://localhost:8080)

## Project structure

- `index.html` - app shell and UI sections
- `src/styles/main.css` - styling and responsive layout
- `src/js/api.js` - auth + GraphQL client logic
- `src/js/main.js` - app behavior and rendering
- `src/js/charts.js` - SVG chart generation

## API usage

Set your campus/platform domain in the login form (for example `learn.reboot01.com`).

The app calls:

- `https://<domain>/api/auth/signin` (Basic auth) -> JWT
- `https://<domain>/api/graphql-engine/v1/graphql` (Bearer auth)

## GraphQL query requirements covered

The app includes all required query styles:

- **Normal query**: `user { ... }`
- **Nested query**: `result { object { ... } }`
- **Argument/variable query**: `transaction(where: { userId: { _eq: $userId } ... })`

## Hosting

You can deploy this directly on:

- GitHub Pages
- Netlify
- Vercel (static mode)

No server runtime is required.
