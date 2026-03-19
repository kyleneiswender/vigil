# Architecture Flow Diagrams

This directory contains Mermaid flowchart diagrams documenting the key workflows
in Vigil.

## Diagrams

| File | Description |
|------|-------------|
| `01_auth_flow.mmd` | User authentication, session loading, and logout |
| `02_vuln_creation_flow.mmd` | Vulnerability form, NVD + EPSS lookup, and record creation |
| `03_kev_sync_flow.mmd` | CISA KEV catalog sync (auto and manual) |
| `04_status_change_flow.mmd` | Status change workflow including duplicate CVE detection |

SVG exports (for viewing without a renderer) are saved alongside each `.mmd` file.

## Viewing and editing

The `.mmd` files use [Mermaid](https://mermaid.js.org/) `flowchart TD` syntax.

**Quickest way to view or edit:**

1. Go to [https://mermaid.live](https://mermaid.live)
2. Paste the contents of any `.mmd` file into the editor on the left
3. The diagram renders live on the right
4. Use the export button to download as SVG, PNG, or share a link

**Other options:**

- **VS Code** — install the [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
  extension, then open any `.mmd` file and use the preview pane
- **GitHub** — Mermaid diagrams render natively in `.md` files when wrapped in
  a fenced code block tagged ` ```mermaid `
- **Mermaid CLI** — `npx @mermaid-js/mermaid-cli` can batch-render to SVG/PNG

## Updating diagrams

If you change a flow in the codebase, update the corresponding `.mmd` file to
match. The source files are the single source of truth; SVG exports are derived
artifacts and can be regenerated at any time via mermaid.live or the CLI.
