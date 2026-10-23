# MoE School Registration Portal – Proof of Concept

Locally deployed working prototype for the Ministry of Education School Registration Portal PoC
(requirements: the Ministry's `MoE_Registration_Portal_POC.docx`, kept out of this repository). Synthetic data only.

## Start (one click)

Double-click **`start.command`** in Finder (or run `./start.command` in a terminal). It checks Node.js,
installs dependencies, creates the test data and builds the web app only when needed, starts the portal
and opens http://localhost:3000 in your browser. Close the window or press `Ctrl+C` to stop.

- `./start.command --reset` – reset the data to the starting synthetic data first
- `PORT=3001 ./start.command` – use another port

## Run (manual)

Requires Node.js 22.13 or later (uses the built-in `node:sqlite` driver).

```bash
npm run setup     # install dependencies, generate synthetic data, build the web app
npm start         # http://localhost:3000
```

Development (hot reload): `npm run dev` → UI on http://localhost:5173, API on :3000.
Reset the data at any time with `npm run seed`.

Acceptance scenarios A1–A16 can be run against the API:

```bash
npm run seed && npm start                    # terminal 1
BASE=http://localhost:3000 node tests/scenarios.mjs   # terminal 2
```

## Where things are

| Path | Contents |
| --- | --- |
| `server/db/schema.sql` | Data model (D2) |
| `server/services/` | Application workflow, SLA clock, capacity & alerts, reports, notifications |
| `server/mocks/` | Simulated UAE PASS, ICP, SIS, maps, transport, email, SMS (D4) |
| `server/routes/` | REST API with role-based access |
| `server/seed/` | Synthetic test data generator (Section 7) |
| `server/i18n/{en,ar}/` | English / Arabic resource files |
| `client/src/` | React web app (parent portal, back office, admin, insights) |
| `tests/scenarios.mjs` | Automated run of acceptance scenarios A1–A16 |

The in-portal documentation page (`/docs`) maps every requirement and acceptance scenario to its
implementation and flags what is simulated, partial or not yet implemented.
