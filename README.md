# Vulnerability Prioritization Tool

A self-hosted web application for triaging and prioritising security vulnerabilities using a configurable composite scoring model.

## What it does

Enter vulnerabilities manually or import them from CSV. Each vulnerability is scored 0–100 using six weighted factors (CVSS score, asset criticality, asset count, internet exposure, exploitability, and days since discovery). Scores are grouped into **Critical / High / Medium / Low** risk tiers. Weights are fully adjustable per organisation and are persisted to the backend.

Data is stored in [PocketBase](https://pocketbase.io/) — a single self-contained binary — so nothing leaves your network.

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
git clone <repo-url> vuln-prioritization-tool
cd vuln-prioritization-tool

# 2. Run the start script
./start.sh          # macOS / Linux
start.bat           # Windows (double-click or run in cmd)

# 3. Open the app
# http://localhost:5173
```

The start script will:
- Download the latest PocketBase binary into `backend/` if it is not already present
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
| Affected Asset Count | 20 % | log₁₀(count + 1) / log₁₀(1001) × 100 |
| CVSS Base Score | 20 % | score × 10 |
| Internet Exposure | 15 % | false = 0, true = 100 |
| Exploitability | 15 % | Theoretical = 25, PoC = 60, Actively Exploited = 100 |
| Days Since Discovery | 5 % | min(days / 365, 1) × 100 |

Weights are adjustable per organisation via the Scoring Configuration panel and are persisted to PocketBase.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for help with stuck processes, database backups, resets, and port conflicts.

## Issues

Please report bugs and feature requests at: https://github.com/your-org/vuln-prioritization-tool/issues
