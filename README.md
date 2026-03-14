# Vigil — Vulnerability Intelligence

A self-hosted web application for triaging and prioritising security vulnerabilities using a configurable composite scoring model.

## What it does

Enter vulnerabilities manually or import them from CSV. Each vulnerability is scored 0–100 using seven weighted factors (CVSS score, asset criticality, asset count, internet exposure, exploitability, EPSS score, and days since discovery). Scores are grouped into **Critical / High / Medium / Low** risk tiers. Weights are fully adjustable per organisation and are persisted to the backend.

Data is stored in [PocketBase](https://pocketbase.io/) — a single self-contained binary — so nothing leaves your network.

## Highlights

- **NVD auto-lookup** — enter a CVE ID and click *Look up* to automatically pull the description and CVSS score from the NIST National Vulnerability Database. No manual copy-paste.
- **EPSS integration** — the [Exploit Prediction Scoring System](https://www.first.org/epss/) score and percentile are fetched automatically alongside NVD data, and contribute 10% of the composite score. If EPSS ≥ 70%, the tool suggests upgrading the exploitability rating.
- **CISA KEV feed** — vulnerabilities are automatically cross-referenced against the [CISA Known Exploited Vulnerabilities](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) catalogue on load. KEV entries are flagged in the table and receive a scoring boost.
- **Intelligence tab** — a built-in threat intel reader that aggregates RSS feeds (CISA advisories, Krebs on Security, and any custom feeds you add). Articles are fetched server-side via a PocketBase hook, de-duplicated, filtered to the last 30 days, and read-state is tracked per user. Unread article counts appear as a live badge on the tab. CVE IDs mentioned in articles can be added to the tracker in one click.
- **Bulk actions** — select multiple vulnerabilities with checkboxes (shift-click for range) and apply a status change, group assignment, user assignment, or deletion in one operation. Each bulk action is individually audited with a `bulk_action` flag.
- **Full audit trail** — every create, update, and delete is logged to `vulnerability_audit_log` with before/after values and the acting user.
- **CSV import** — import vulnerabilities from any CSV export (Qualys, Tenable, etc.) with auto-detected column mapping and a validation preview step.
- **Duplicate detection** — adding a CVE ID that is already tracked surfaces the existing record inline. If the existing entry is closed, you can reopen it directly from the form instead of creating a duplicate.

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | For the Vite frontend |
| **curl + unzip** | Used by `start.sh` to auto-download PocketBase (macOS / Linux) |
| **PowerShell 5+** | Used by `start.bat` to auto-download PocketBase (Windows — included by default) |
| **Internet access (first run only)** | To download the PocketBase binary from GitHub releases |

## Setup (3 steps)

```bash
# 1. Clone the repo
git clone <repo-url> vigil
cd vigil

# 2. Run the start script
./start.sh          # macOS / Linux
start.bat           # Windows (double-click or run in cmd)

# 3. Open the app
# http://localhost:5173
```

The start script will:
- Download a pinned PocketBase binary into `backend/` if it is not already present
- Run `npm install` in `frontend/` if `node_modules/` is missing
- Start PocketBase on port **8090** (runs migrations on first launch)
- Start the Vite dev server on port **5173**

## First-time admin setup

On the very first run PocketBase will prompt you to create a **superadmin** account at:

```
http://localhost:8090/_/
```

After creating the superadmin:

1. Create an **organization** record (Collections → organizations → New record)
2. Create one or more **user** accounts (Collections → users → New record), setting their `organization` field to the organization you just created
3. Share the credentials with your team — users log in at `http://localhost:5173`

> There is no self-service registration. All accounts are managed by the admin.

## Scoring methodology

| Factor | Default weight | Normalisation |
|---|---|---|
| Asset Criticality | 25 % | Low = 25, Med = 50, High = 75, Critical = 100 |
| CVSS Base Score | 20 % | score × 10 |
| Affected Asset Count | 15 % | log₁₀(count + 1) / log₁₀(1001) × 100 (ceiling: 1,000 hosts) |
| Internet Exposure | 15 % | false = 0, true = 100 |
| Exploitability | 10 % | Theoretical = 25, PoC = 60, Actively Exploited = 100 |
| EPSS Score | 10 % | score × 100 (0–1 → 0–100); null counts as 0 |
| Days Since Discovery | 5 % | min(days / 365, 1) × 100 |

Weights are adjustable per organisation via the **Risk Lens** panel and are persisted to PocketBase.

## NVD API key (optional)

Without an API key, NVD rate-limits requests to 5 per 30 seconds — enough for normal use. If you need higher throughput, register for a free API key at [nvd.nist.gov](https://nvd.nist.gov/developers/request-an-api-key) and enter it in **Settings → NVD API Key**. This raises the limit to 50 requests per 30 seconds.

> The key to enter is the UUID from the *NVD API Key* email — not the confirmation link UUID. They are different values.

## User roles

| Role | Capabilities |
|---|---|
| **Admin** | Full access: manage users, change settings, data management, all vulnerability operations |
| **Analyst** | Create, edit, and delete vulnerabilities; change status; bulk actions |
| **Viewer** | Read-only access to the vulnerability list |

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for help with stuck processes, database backups, resets, and port conflicts.

## Issues

Please report bugs and feature requests at: https://github.com/your-org/vigil/issues
