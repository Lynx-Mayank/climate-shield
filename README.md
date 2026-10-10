# ClimateShield MSME
## Live Website Demo Link - https://climate-shield123.vercel.app/

ClimateShield MSME is a FUSION 2026 FIN-05 prototype that connects public weather information, an explainable climate-risk model, editable business scenarios, and resilience planning for Indian MSMEs and lenders.

## Core flows

- Four role portals: MSME owner, lender, climate analyst, and government / policy.
- Approved analysts receive assigned-state access to saved assessment analysis and exports.
- Approved government users receive privacy-thresholded regional indicators, coarse aggregate map cells, policy-program CRUD, progress, and report exports.
- Policy initiatives are user-entered records, not automatically verified schemes.
- Business profile saved in browser-local demo storage.
- Open-Meteo location search, current conditions, seven-day forecast, and recent historical archive retrieval.
- Unified flood-related rainfall, heat, heavy-rainfall, and short-window dryness indicators with source and limitation metadata.
- Shared deterministic 0–100 risk engine used by business and lender views.
- Financial scenario simulator with downtime, gross revenue loss, additional operating costs, cash-flow pressure, and optional debt-service-coverage repayment pressure when monthly debt repayments are provided.
- **Climate-to-Credit Resilience Engine** with editable intervention costs/effectiveness, before-and-after scenarios, budget-guided ranking, saved action plans, supply-chain ripple inputs, and a print-ready lender summary.
- Lender workspace with server-authorized borrower assessments, industry/risk/hazard filters, and scoped CSV reporting; separate sample charts and scenarios remain explicitly illustrative.

## Architecture

```text
src/
  app/                         React Router configuration
  dashboard/
    BusinessDashboard.tsx      Business workspace and local persistence
    LenderDashboard.tsx        Authorized lender assessments and labeled sample tools
    ClimateIntelligence.tsx    Climate retrieval states and provenance UI
    ClimateToCreditEngine.tsx  Signature resilience workflow
    DashboardLayout.tsx        Shared product shell
    AnalystPortal.tsx          Scoped assessment analysis, map, and exports
    GovernmentPortal.tsx       Aggregated regional portal and program management
    PortalProfile.tsx          Authenticated analyst/government profile
    data.ts                    Synthetic borrower and intervention assumptions
  services/
    climateService.ts          Open-Meteo geocoding/forecast/archive client
    hazardService.ts           Derived indicators and dataset metadata
    riskScoringService.ts      Shared deterministic risk calculation
    scenarioService.ts         Shared financial/scenario/intervention logic
    api.ts                     Cookie-authenticated FastAPI client
    auth.ts                    Registration, login, and session client
backend/
  app/main.py                  FastAPI API, SQLite models, and role checks
  app/admin.py                 Approval, state-scope, and lender-access provisioning
  app/scoring.py               Explainable backend scoring model
  tests/                       API security and scoring tests
```

External API calls and calculations are kept outside presentation components. No API secrets are required or committed.

## Setup

Requirements are defined in `.mise.toml` (Node.js and pnpm).

```bash
pnpm install
pnpm dev
```

For registration, login, and server-side persistence, start the API in a second PowerShell terminal:

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API creates `backend\climateshield.db` on startup. The frontend defaults to `http://localhost:8000/api`; standard Vite runs at `http://localhost:5173`, and this Figma Make workspace preview uses `http://localhost:8443`. Interactive API docs are at `http://127.0.0.1:8000/docs`. Inside Figma Make the frontend development server is supervised automatically, so do not start a second Vite server. Register at `/signup`; there are no seeded accounts.

### Approving analyst / government accounts

Analyst and government registrations are created as pending and cannot log in until an administrator approves them and assigns at least one state scope. From the repository root, run in PowerShell after starting the API once (to initialize the database):

```powershell
Set-Location backend
python -m app.admin approve analyst@example.org --scope Gujarat --scope Maharashtra
python -m app.admin approve official@example.org --scope Gujarat
```

The CLI writes an audit record. State labels must match the explicit state field on a saved business profile; unknown/ambiguous district boundaries are not inferred. This local CLI is an administrator operation; do not expose it to a public web process. To authorize a lender to access a specific owner account:

```powershell
python -m app.admin link-lender lender@example.org owner@example.org
```

There is no self-service access granting, default analyst account, default government account, or public admin API.

## Role-specific data and portal routes

| Role | Workspace | Server-side access |
| --- | --- | --- |
| MSME owner | `/business/dashboard` | Own profile and own saved assessment records |
| Lender | `/lender/dashboard` | Authorized assessments for explicitly linked owners, with server-filtered CSV export; separate named charts, alerts, and scenarios remain synthetic and labeled |
| Climate analyst | `/analyst/dashboard` | Saved assessments for explicitly assigned states; analyst detail and CSV endpoints apply the same scope |
| Government / policy official | `/government/dashboard` | State-scoped aggregates, coarse map cells, and programs within explicitly assigned state scopes; borrower financial and account fields are not returned |

Additional analyst views are `/analyst/climate-analytics`, `/analyst/risk-maps`, `/analyst/assessments`, `/analyst/data-quality`, `/analyst/reports`, and `/analyst/profile`. Government views include `/government/regional-risk-map`, `/government/regional-analytics`, `/government/policy-programs`, `/government/program-progress`, `/government/reports`, and `/government/profile`.

The sign-in page also offers a clearly labeled Government / Policy preview when that role is selected. It uses synthetic sample aggregates and program records without calling the government API; demo program edits and status changes are kept in session storage and discarded when the browser session ends. It does not grant or simulate access to authenticated regional data.

API resources include `/api/auth/{register,login,logout,me}`, `/api/business/profile`, `/api/business/assessments`, `/api/lender/{portfolio,export.csv}`, `/api/analyst/{overview,assessments,export.csv}`, and `/api/government/{overview,map,programs,reports.csv}`. Lender portfolio filters for industry, risk category, and available hazard are applied identically to the authorized assessment list and CSV export. Program impact details are exposed under `/api/government/programs/{id}/impact`. Browser print dialogs can save the analyst and government report views as PDF; downloadable tabular exports are CSV.

Production build:

```bash
pnpm build
```

Backend tests and frontend checks:

```powershell
Set-Location backend
python -m unittest discover -s tests -v
Set-Location ..
npx tsc --noEmit
pnpm build
```

## Environment variables

Copy `.env.example` only when endpoint overrides are needed:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | FastAPI public base URL; defaults to `http://localhost:8000/api` |
| `VITE_OPEN_METEO_GEOCODING_URL` | Open-Meteo geocoding base URL |
| `VITE_OPEN_METEO_FORECAST_URL` | Open-Meteo forecast base URL |
| `VITE_OPEN_METEO_ARCHIVE_URL` | Open-Meteo archive base URL |

Open-Meteo requires no frontend API key for this prototype. `VITE_*` values are public in browser bundles and must never contain private credentials.

Backend process environment variables:

| Variable | Purpose |
| --- | --- |
| `CLIMATESHIELD_DATABASE_URL` | SQLAlchemy URL; defaults to SQLite at `backend\climateshield.db` |
| `CLIMATESHIELD_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS |
| `CLIMATESHIELD_COOKIE_SECURE` | Set to `true` when served over HTTPS |

## Climate sources and data quality

### Connected

- **[Open-Meteo](https://open-meteo.com/) Geocoding API:** searchable place names and coordinates.
- **Open-Meteo Forecast API:** current conditions and seven-day model forecast.
- **Open-Meteo Historical Weather API:** recent 30-day archive window ending seven days before retrieval.
- Variables include 2 m temperature, precipitation, wind speed, and FAO reference evapotranspiration where returned.

Responses are schema-checked, use a 10-second timeout, handle HTTP/rate-limit failures, and support partial forecast/history success. Panels identify source, retrieval time, units, period, coverage, and whether data is current, forecast, historical, derived, or simulated.

### Not connected

- [World Bank Global Flood Exposure gridded population dataset](https://datacatalog.worldbank.org/search/dataset/0062763/global-flood-exposure-gridded-exposure-headcounts-by-country).
- [World Bank Climate Change Knowledge Portal downloads](https://climateknowledgeportal.worldbank.org/download-data).
- Parcel-level flood depth, drainage, groundwater, verified drought index, or business-damage datasets.
- Interactive map provider.

The World Bank population-exposure dataset is documented as an integration point only. Population exposure is never converted into shop damage. Open-Meteo precipitation is shown as a rainfall/flood-related proxy, not verified flooding.

## Risk model

This is a transparent prototype methodology, not a scientifically validated or calibrated universal model.

1. Correlated flood/rainfall indicators are combined by taking the larger value once.
2. Hazard exposure weights:
   - combined rainfall/flood proxy: 45%
   - extreme heat: 25%
   - drought/water shortage: 30%
3. Climate vulnerability uses weighted industry, assets, weather, power, water, supply-chain, and interruption-sensitivity inputs.
4. When monthly revenue and operating costs are both available, business vulnerability combines climate vulnerability (80%) and the operating cost ratio (20%). The ratio is capped to 0–100; stronger margins therefore reduce the financial component. If either input is missing, the score uses climate vulnerability alone.
5. `base risk = √(hazard exposure × business vulnerability)`
6. Documented resilience applies a bounded adjustment:
   - `final risk = base risk − base risk × resilience × 20%`
7. Final scores are capped to 0–100 and the same scoring weights and thresholds are used by the frontend and API.

The India disaster-history dataset is filtered to drought records before it can affect the drought indicator; unrelated events such as earthquakes and epidemics do not raise drought risk. Its location descriptions are imperfect, so this is only a weak historical index. The CSV-trained flood output is also an unvalidated index, not a calibrated probability. Climate-to-Credit drivers show one-at-a-time score changes against a neutral factor value of 50; those effects are not additive.

Categories are configurable constants:

- 0–24 Low
- 25–49 Moderate
- 50–74 High
- 75–100 Critical

Missing values are omitted and remaining weights are normalized; a wholly missing dimension uses a neutral value of 50. Missing values reduce assessment completeness and do not prove safety. Confidence is separate from risk. Completing an action does not change risk unless a relevant model mitigation input is explicitly changed. Financial inputs remain session-only and assessment records retain only the derived financial-risk factor, not the raw revenue or cost values.

## Scenario and financial assumptions

The shared scenario engine estimates:

- disrupted days,
- gross revenue loss,
- additional operating expense,
- cash-flow pressure, and
- qualitative repayment pressure.

Key demo formulas:

```text
gross revenue loss =
  (monthly gross revenue / 30) × disrupted days × 85% assumed loss fraction

additional expense =
  (monthly operating costs / 30) × disrupted days × severity factor
```

Intervention effects apply only to matching hazards, combine multiplicatively, and are capped at 70%. Budget suggestions use deterministic greedy ranking by compatible estimated avoided loss per rupee and lower cost. This is not mathematical optimization or guaranteed payback.

These outputs are not actual damages, profit loss, probability of default, expected credit loss, a conventional credit score, or a loan approval/decline.

## Persistence, authentication, and security

The local FastAPI API supports all four role registrations, password verification using Python's scrypt implementation, opaque server-side sessions in HttpOnly cookies, role-protected API routes, owner-scoped business profiles and assessments, and lender portfolio queries restricted to explicit lender-owner access links. Local development uses SameSite=Lax cookies; when `CLIMATESHIELD_COOKIE_SECURE=true`, cookies use SameSite=None and Secure for cross-site frontend/API deployments over HTTPS. The owner dashboard hydrates its saved business profile from the authenticated API; new accounts see a setup prompt rather than the synthetic demo business. Session tokens are stored as SHA-256 hashes and expire after seven days. The browser does not store authentication tokens. SQLite tables are initialized on startup with an additive compatibility migration for existing accounts; this prototype has no formal migration framework, email verification, password-reset delivery, or rate limiting.

The four account roles are `owner`, `lender`, `analyst`, and `government`. Analyst and government accounts require administrator approval plus state scopes. Analyst endpoints and CSV exports filter saved assessments by those scopes and omit account contact and financial fields. Government routes only return aggregates for explicitly assigned states; map points are coarsened into 0.25-degree cells and cells/category/industry/hazard counts below five are suppressed. Regional reporting does not infer district boundaries. Authorized officials can create/edit programs, change explicit statuses, and enter budgets, participation, outcomes, and progress notes; audit rows record program create/update events. Before/after program indicators are descriptive, not causal evidence.

Admin provisioning commands:

```powershell
Set-Location backend
python -m app.admin approve analyst@example.org --scope Gujarat
python -m app.admin approve official@example.org --scope Gujarat
python -m app.admin link-lender lender@example.org owner@example.org
```

Non-financial profile fields, scenario hazard controls, suppliers, progress, and proposed action selections use `localStorage` and are labelled browser-local. Revenue, operating-cost inputs, passwords, and calculated financial outputs are session-only and are not written to local storage. Browser-local records are not shared between devices or users.

Do not enter real confidential financial or borrower information into synthetic demo workflows. The lender overview now displays saved assessment summaries for owners explicitly linked to that lender, with only business name, industry, city, state, risk result, and completeness returned for that authorized list. The separate named sample charts and deep-dive lender tools remain synthetic and labeled; climate feeds are not connected to those summaries. A lender account sees no live portfolio assessments unless explicit borrower access links are provisioned. Google OAuth and password recovery remain unconnected; those screens do not send messages.

## Verification

The Python API tests cover pending approval, role authorization, owner profile storage, assessment persistence, analyst overview/filters/exports, government suppression below the five-business privacy threshold and aggregation/map output at the threshold, program create/status update/impact, lender authorization and field minimization, input validation, and missing-data risk behavior. Run:

```powershell
Set-Location backend
python -m unittest discover -s tests -v
Set-Location ..
npx tsc --noEmit
pnpm build
```

Manual/browser checks should cover:

1. Landing role selection and validation.
2. Direct access and refresh for both dashboard routes.
3. Open-Meteo success, empty, partial, and failed states.
4. Deterministic score and category behavior.
5. Scenario severity/duration recalculation.
6. Related versus unrelated intervention effects.
7. Budget ranking and browser-local plan persistence.
8. Borrower filters and shared Aarav Textiles score.
9. Print-ready business, lender, and resilience reports.
10. Desktop and mobile navigation.

## Deployment

The project is a Vite single-page application plus a separate FastAPI backend. `.figma/make/deploy` builds `dist` and deploys only the frontend through Figma Make; deploy the API and database separately. Other static hosts must rewrite unknown paths such as `/business/dashboard` and `/lender/dashboard` to `/index.html`.

Only public Open-Meteo endpoint URLs and the API base URL belong in frontend environment variables. Production deployment still requires HTTPS, secure cookie configuration, environment/secret management, migrations and backups, rate limiting, audit logging, and model governance. The prototype score must not be used for underwriting or credit decisions.

This repository is build-ready but no deployment is claimed until the deployment command is explicitly run and the resulting URL is verified.
