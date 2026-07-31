# AWS Bedrock Observability App

Runtime observability, cost & usage, and access governance for **Amazon Bedrock**, built as a native Dynatrace AppEngine app.

This app reads the telemetry Bedrock actually emits — the **ModelInvocationLog**, **CloudWatch metrics**, and **CloudTrail** — and turns it into cost attribution, performance and quota visibility, and a security/governance audit trail, with no dependency on OpenTelemetry GenAI span instrumentation. It's a standalone spin-off of the AWS Bedrock tab from the [AI Observability 3.0 App](https://github.com/dberanjr/AIObservability3.0), rebuilt from scratch around Bedrock's own three data sources so it works for teams that route through Bedrock without (or in addition to) `gen_ai.*` span instrumentation.

---

## What it does

Amazon Bedrock is a gateway: teams call it, but the useful telemetry lives in three separate AWS-native places — a CloudWatch log group for per-invocation token/cost/session detail, a CloudWatch metric namespace for latency/throughput/quota, and CloudTrail for who called what, from where. Answering *"what is this costing us, is it fast enough, and is access to it under control"* means correlating all three.

This app does that correlation for you across three tabs — **Runtime Observability & Cost & Usage**, **Access & Governance**, and a **Telemetry** coverage audit — sharing one global timeframe, a Segments selector, and a Filters control scoped to Bedrock's actual dimensions (identity, error code, region, source IP, MFA, read-only) rather than generic span attributes. Every tile stays populated even when a tenant's AWS→Dynatrace telemetry isn't fully wired up yet: instead of a blank page, a tab that finds no real data for the current window renders the same layout with clearly-labeled example data, so a first-time viewer can see what it looks like once the data starts flowing.

## Features

### Runtime Observability & Cost & Usage

Reads the Bedrock **ModelInvocationLog** (`fetch logs`, matched on the `dt.da.aws.log_group` / `ModelInvocationLog` marker) and the `cloud.aws.bedrock.*` / `cloud.aws.bedrock_guardrails.*` CloudWatch metric namespaces. Account and Model dropdowns scope the whole tab.

- **Hero** — total estimated spend, a 30-day run-rate projection, a spend sparkline, and up to three computed narrative insights (cost concentration, a latency outlier, prompt-cache savings).
- **KPI row** — invocations, tokens (including cache-read/write tiers), estimated cost, average latency, time-to-first-token, error rate, peak tokens-per-minute, and session count.
- **Cost zone** — a stacked cost-by-model-over-time chart with a cache-savings overlay, a cost-share donut, and cost-by-account.
- **Agent / session table** — the caller identity ARN encodes the session (an agent run, not a human); per-session invocations, tokens, cache-hit rate, cost, P95 latency, and error rate.
- **Performance zone** — latency and TTFT by model (worst first), peak-TPM headroom, and an explicit error-rate caveat.
- **Quota & delivery** — per-model `EstimatedTPMQuotaUsage` headroom (an absolute tokens/minute figure, not a percentage) and CloudWatch log-delivery health over time.
- **Latency trends** — min / avg / max band charts for invocation latency and TTFT.
- **Per-model summary table**, a **guardrails summary** (`cloud.aws.bedrock_guardrails.*` — intervention rate, coverage; meaningful only where Guardrails is configured), and threshold-based **findings**.

### Access & Governance

100% **CloudTrail** (`cloud.provider == "aws"`, `eventSource == bedrock.amazonaws.com`) — no logs or metrics, except the reconciliation card below. Its own Account dropdown, derived independently from CloudTrail rather than the Runtime tab's log-based list, so an account with CloudTrail activity but no ModelInvocationLog logging yet still shows up — exactly the blind spot the Reconciliation card exists to catch.

- **KPI band** — total API calls, distinct identities, source IPs, and accounts.
- **Anomalous access** — identities calling from 3+ source IPs, and IPs shared by 2+ identities (a shadow-AI / credential-abuse heuristic).
- **Access denied** — top identities and actions by `AccessDenied` count.
- **Data residency** — cross-region inference routing, flagging calls whose actual inference region differs from the request's.
- **Throttling** — `ThrottlingException` / `TooManyRequestsException` occurrences.
- **Activity & identity detail** — API-action breakdown, calls-over-time by action, top identities, top source IPs, and an identity × MFA table.
- **Security detail** — errors/denials over time by error code, plus a control-plane write-event audit table.
- **Reconciliation** — compares the CloudTrail invoke-event count against the ModelInvocationLog metering count to surface logging blind spots.

### Telemetry (Audit)

A tenant-wide coverage audit — not scoped by Segments, Filters, Account, or Model — of the raw AWS telemetry the other two tabs depend on: is it actually present in this tenant, for the selected timeframe? Modeled on the same pattern the sibling AI Observability 3.0 App uses to audit OpenTelemetry span attributes, applied here to AWS-native telemetry instead.

Four sections, each resolved in a single DQL query: **Model Invocation Logs**, **Runtime & Quota Metrics**, **Guardrails Metrics**, and **Access & Governance**. Every field is tiered **Required** (a core KPI/section breaks without it) or **Optional** (only a secondary card depends on it), with a present / sparse / missing verdict for log- and event-based fields and a simpler detected / not-detected verdict for metrics. This tab always reflects real telemetry — it's the one place in the app the "Show Demo Data" toggle below never touches, since faking full coverage here would defeat the point of it.

### Field Notes & About

**Field Notes** is a concise, Bedrock-specific reference (not a generic AI-observability primer): what the app is, the telemetry behind it, a data dictionary for every tab and card, and the personas and use cases each one serves. **About** carries build metadata (version, git commit, commit date) and the Grail permissions the app requests.

## Cross-cutting capabilities

- **Global timeframe** — header selector (30m / 1h / 6h / 24h / 7d / 14d / 30d, default 1h), persisted per user and carried across tab navigation and shareable URLs.
- **Segments** — optional, tenant-defined; slices activity by whatever logical dimensions your Dynatrace admin has configured. Empty selection queries everything.
- **Filters** — a closed set of Bedrock/CloudTrail dimensions (identity, error code, API action, region, source IP, MFA, read-only) rather than free-text span attributes, applied directly in each query builder after its own JSON-parse step (Bedrock's log/event payloads don't exist as queryable fields until parsed, so generic pre-parse injection isn't possible here). Account and Model have their own dedicated dropdowns instead of living in this list.
- **Sampling & Scan limit** — the usual Grail cost/fidelity levers (sampling: None / 10 / 100 / 1k / 10k; scan limit: 500 GB / 1 TB / 2 TB / 5 TB), both hideable from the toolbar via a Tweaks toggle without losing their last-set value. Sampling only affects the log- and event-backed numbers — CloudWatch metrics have no sampling concept in DQL — and count/sum aggregates are extrapolated back up while distinct-count security metrics are deliberately left un-extrapolated and flagged "exact only at None."
- **Cache-aware cost model** — decomposes every invocation into uncached-input / cache-read / cache-write / output tiers and prices each from an **org-wide overrideable** rate table covering Bedrock-native models (Amazon Nova, Titan) plus the third-party vendors Bedrock hosts (Anthropic, Meta, Mistral, DeepSeek, Cohere). A model missing from the table costs a blended rate (never $0), flagged "≈". Edited from the header's **Model Rates** panel — Bedrock-only, no platform selector, since this app only ever prices Bedrock invocations.
- **Show Demo Data** — a Tweaks toggle that forces the same realistic canned dataset onto every tab except Telemetry, with a persistent banner and a one-click way to turn it back off. Distinct from the automatic per-tab example-data fallback described above: that one only activates on its own when a tab's real data comes back empty; this one forces it everywhere, on demand, for demos and screenshots.
- **Tweaks panel** — per-user appearance and display controls: theme, 15 accent colors (plus a custom hex picker), chart style / curve / value-labels, a color-vision-deficiency simulator, raw-vs-normalized model names, scanned-data verbosity, and the Sampling/Scan-limit and Show-Demo-Data toggles above.
- **Per-user persisted settings** — timeframe, sampling ratio, scan limit, Filters, and Tweaks all survive reloads via `state:user-app-states`; Model Rates overrides persist org-wide via `state:app-states`, so every viewer sees the same rates.
- **Reload / Reset** — Reload invalidates every active query; Reset clears the timeframe, Filters, and each tab's local Account/Model selection back to defaults (Segments and Tweaks are left alone).
- **Status bar** — scanned bytes vs. budget, query count, a sampling-extrapolation disclosure, a "partial data" chip when a query hits its scan-limit budget (one click raises the limit), and a "last refreshed" / "slowest query" readout.

## Architecture

```
ui/app/
├── pages/
│   ├── Runtime/         Runtime Observability & Cost & Usage — page + every
│   │                    section component (Hero, KPI row, cost zone, session
│   │                    table, perf zone, quota/delivery, latency trends,
│   │                    per-model summary, guardrails summary, findings).
│   ├── Governance/      Access & Governance — page + every card (KPI band,
│   │                    anomalous access, access denied, data residency,
│   │                    throttling, activity/security detail, reconciliation).
│   ├── Telemetry/       The AWS-telemetry coverage audit (catalog, per-section
│   │                    detection queries, coverage verdicts, section/detail UI).
│   ├── FieldNotes/      The Field Notes reference content.
│   └── About/           Attribution + build metadata + Grail permissions.
├── bedrock/             Runtime tab's data layer: ModelInvocationLog + metric
│   └── governance/      query builders, parsers, cost helpers, demo dataset.
│                        governance/ holds the Access & Governance tab's own
│                        CloudTrail query builders, parsers, and demo dataset.
├── guardrails/           Fleet-wide guardrails metrics, reused by the Runtime
│                        tab's guardrails summary card.
├── scope/               Timeframe, sampling, scan-limit, segments-adjacent
│                        scan-report, and Filters contexts, plus the
│                        useScopedDql wrapper every query hook is built on.
├── layout/              The toolbar strip (Segments, Filters, Sampling, Scan
│                        limit, Reload, Reset) and the Filters popover UI.
├── pricing/             The Model Rates panel + org-wide pricing context.
├── tweaks/              The Tweaks panel, the Demo Data banner, and the
│                        colorblind-simulation SVG filters.
├── data/                The cache-aware cost model + rate table, and shared
│                        number-formatting helpers.
├── state/               usePersistedState / usePersistedAppState — useState-
│                        shaped hooks backed by Dynatrace user/app state.
├── components/          Shared UI: StatTile, charts, DataTable, EmptyState /
│                        ErrorState, the generic Account/Model ScopeSelectors,
│                        and the ExampleDataNotice banner.
├── lib/                 Small route helpers (search-preserving redirects).
└── theme/               Strato token bridges + the accent/chart-style CSS.
```

Each tab's DQL query builders live next to the hooks and components that use them. Pure logic (cost math, coverage classification, CloudTrail parsing) is unit-tested with Vitest.

## Requirements

- A Dynatrace tenant on AppEngine with **Grail** enabled.
- **Amazon Bedrock model-invocation logging** forwarded to CloudWatch (and from there to Dynatrace) for the Runtime tab; **CloudWatch metrics** (`cloud.aws.bedrock.*`) for the same tab's performance/quota sections; **CloudTrail** management events for the Governance tab. The Telemetry tab tells you exactly which of these your tenant currently has.
- Node 16.13+ for local development.
- The following OAuth scopes (already declared in `app.config.json`):

  | Scope | Purpose |
  |---|---|
  | `storage:logs:read` | Read the Bedrock ModelInvocationLog |
  | `storage:metrics:read` | Read `cloud.aws.bedrock.*` / `cloud.aws.bedrock_guardrails.*` metrics |
  | `storage:events:read` | Read CloudTrail events for Access & Governance |
  | `storage:buckets:read` | Grail bucket-level access (required for any of the above) |
  | `storage:filter-segments:read` | Read tenant-defined filter segments |
  | `state:user-app-states:read` / `write` | Per-user state: timeframe, sampling, scan limit, Filters, Tweaks |
  | `state:app-states:read` / `write` | Org-wide state: shared Model Rates overrides |

## Installation

```bash
git clone https://github.com/dberanjr/AWSBedrockApp.git
cd AWSBedrockApp
npm install
```

The repo ships with a **placeholder** tenant (`https://your-tenant.apps.dynatrace.com/`) — point the app at your own tenant before deploying by editing `environmentUrl` in `app.config.json`:

```json
{
  "environmentUrl": "https://<your-tenant>.apps.dynatrace.com/"
}
```

`dt-app deploy` will fail against the placeholder, so a real tenant is required. Keep your tenant URL local — don't commit it back, so the repo's `environmentUrl` stays a placeholder.

> **Note:** `@dynatrace/strato-components`, `-preview`, `-design-tokens`, and `-icons` are pinned to exact versions in `package.json` rather than caret ranges — a newer patch of `strato-components` introduced a regression in its `Select` component that broke the Sampling/Scan-limit dropdowns on load. Don't loosen those pins without testing against a real tenant first.

## Available scripts

| Command | What it does |
|---|---|
| `npm run start` | Launches the dt-app dev server and opens the app in a browser |
| `npm run build` | Builds the production bundle to `dist/` |
| `npm run deploy` | Builds and deploys to the tenant in `app.config.json` (bump `version` first) |
| `npm run uninstall` | Removes the app from the configured tenant |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` over the `ui/` tree |
| `npm run lint` | ESLint over the whole repo |
| `npm run info` | Prints dt-app CLI and environment info |

> **Note:** Dynatrace rejects deploys when the version on disk matches an already-installed version with a different checksum — bump `app.version` in `app.config.json` for every deploy. Always deploy via `npm run deploy` (not a direct `dt-app deploy` call): the `predeploy` hook regenerates the build-metadata module the About page reads, and a direct CLI call skips it silently.

## Configuration

Everything user-configurable lives in the app UI itself — there's nothing to set up in environment files:

- **Timeframe** — header selector, preserved across navigation and shareable via URL.
- **Segments** — optional; slices activity by whatever your tenant's Dynatrace admin has configured.
- **Filters** — identity, error code, API action, region, source IP, MFA, read-only.
- **Account / Model** — dedicated dropdowns on the Runtime tab (Account only on Governance — CloudTrail has no per-model dimension).
- **Sampling & Scan limit** — toolbar dropdowns, hideable via Tweaks.
- **Model Rates** — override the built-in per-model $/1M-token rates from the header panel; saved org-wide.
- **Show Demo Data** — a Tweaks toggle to force canned data everywhere except Telemetry.

## Testing

Pure functions — the cache-aware cost model, CloudTrail event parsing, cross-region exfiltration/residency classification, coverage verdicts, and the shared status-color/palette helpers — are covered by Vitest. Run `npm test` for a single pass or `npm run test:watch` while developing.

## Tech stack

- **React 18** + **TypeScript 5** + **React Router 6**
- **Dynatrace Strato Design System** (`@dynatrace/strato-components`, `-preview`, `-icons`, `-design-tokens`)
- **Dynatrace SDK** — `@dynatrace-sdk/react-hooks` (DQL + user/app state), `@dynatrace-sdk/app-environment`
- **dt-app CLI** 1.9 for build / dev server / deploy
- **Vitest 4** for unit tests

## Contributing

Issues and PRs welcome. Before opening a PR:

1. `npm test` — green
2. `npm run typecheck` — green
3. `npm run lint` — green
4. For any new DQL, confirm field names against the [Dynatrace Semantic Dictionary](https://docs.dynatrace.com/docs/semantic-dictionary) and functions against the [DQL reference](https://docs.dynatrace.com/docs/shortlink/dql-dynatrace-query-language-hub).

## License

MIT — see [LICENSE](./LICENSE).
