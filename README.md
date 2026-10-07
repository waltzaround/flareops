# FlareOps

A desktop workspace for the official Cloudflare `cf` CLI. Built with Tauri 2, Rust, React, TypeScript, Vite, Tailwind CSS, shadcn-style Radix components, Lucide, TanStack Query, Zustand, and Zod.

FlareOps retains the original `dev.boxflare.desktop` application identifier and `boxflare-ui-v1` preferences key so existing accounts, settings, and command history remain available after the rename.

## Run

```sh
npm install
npm run dev                 # Browser preview, with labeled sample data
npm run tauri dev           # Native desktop app, with live CLI integration
npm run build              # Type-check and build the frontend
npm test                   # Frontend adapter and context tests
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:prepare    # Stage pinned Node + cf for native development
npm run desktop:build      # Self-contained native release, including Node + cf
npm run tauri build        # Development/system-CLI bundle without staged assets
```

Quit an existing `npm run dev` server before starting `npm run tauri dev`; both use port 1420. Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/) are required for native builds. Browser mode has no process access.

## Bundled Cloudflare CLI

Distributable builds include **cf 1.0.0-beta.8** and **Node 22.23.3**. End users do not need Node, npm, or cf installed. Open **Settings → Profiles** to sign in with the official CLI and select an account. Credentials remain in cf's standard profile storage.

```sh
npm run desktop:build
# Local debug .app on macOS:
npm run desktop:build -- --debug --bundles app
```

The packaging script downloads the official Node archive for the build machine, checks a pinned SHA-256 digest, installs cf from `desktop-runtime/package-lock.json` with lifecycle scripts disabled, and validates version/schema commands without a Cloudflare account. Node is a Tauri `externalBin` sidecar; cf and its dependencies are application resources. Licenses and a version/hash manifest are included. The Rust service launches the absolute bundled Node path with cf's entrypoint as an argv argument; React still has no process access.

Bundled assets are build outputs, excluded from version control. The app prefers its bundle; incomplete bundles fail closed instead of silently choosing another CLI. A source checkout without staged assets falls back to system cf. To use the bundle in development, run `npm run desktop:prepare` before `npm run tauri dev`. System fallback still requires Node 22.18+ and a separately installed official cf.

Six native build targets are mapped: macOS, Windows, and glibc Linux on x64/arm64. Build on each target OS/architecture because cf contains native optional dependencies; cross-compilation and universal macOS builds are rejected. Only macOS arm64 has been built and tested here. Developer machines still need Node/npm, Rust, and Tauri prerequisites. Distribution signing/notarization and testing on other platforms remain release work.

The full upstream CLI dependency tree is preserved. On this machine, staged cf dependencies take about 229 MB and Node about 112 MB before installer compression. Bundled versions update with FlareOps releases; changing cf requires updating its manifest/lockfile, while changing Node requires updating the pinned version and checksums in `scripts/runtime-config.mjs`.

The desktop app opens live setup; the browser opens a clearly labeled demo workspace. Settings can switch either experience to demo mode. FlareOps never installs global software or changes the user's shell configuration.

## Implemented in this first version

- Desktop shell with native window chrome, collapsible navigation, system/light/dark themes, explicit workspace/profile/account switcher, and activity drawer.
- Contextual Home, Workers, Zones, DNS, D1, R2, KV, and Queues lists, resource inspection, favorites, recent resources, and local search.
- DNS creation, editing, proxy state, type filtering, and deletion with account-name confirmation.
- Global command palette (`Cmd/Ctrl+K`), settings shortcut (`Cmd/Ctrl+,`), refresh (`Cmd/Ctrl+R`), Escape dismissal, and arrow/Enter palette navigation.
- CLI discovery with `cf cli search`, dynamic forms from `cf schema`, help fallback, raw schema inspection, and version-keyed schema caching.
- Backend-owned prepared commands, explicit profile/account/zone arguments, command review, CLI-advertised dry-runs, fresh account and zone ownership verification, timeout/cancel, streamed output, and redacted execution history.
- Named profile login/create/list/delete/whoami; account discovery; app-local workspace labels. The app chooses explicit `--profile` instead of changing cf's directory activation bindings.
- Stale-while-revalidate resource summaries scoped by mode, profile, account, resource kind, and zone. Mutations invalidate resource queries.
- Internal `cloudapp://account/:accountId/:kind/:resourceId` link model and copyable resource links.

## Architecture

```text
src/app/                 Application shell and visual system
src/components/ui/       Accessible Radix dialog/sheet and shadcn-style button
src/features/            Native resource screens, DNS, explorer, palette, settings, activity
src/lib/cf.ts            Typed IPC and isolated demo adapter
src/lib/query.ts         Account-scoped query/cache lifecycle
src/lib/store.ts         Local UI preferences and safe account metadata
src-tauri/src/cf/         CfClient, process runner, parser/redaction, schema/command planning
src-tauri/src/storage/    Atomic app-data JSON persistence for history and schema cache
src-tauri/src/lib.rs      Thin, typed Tauri commands and output events
```

React cannot execute shell commands. The Tauri capability grants no shell or filesystem plugin access. `SystemRunner` executes the bundled Node + cf entrypoint, or the resolved system cf binary, for Cloudflare operations, with argv arrays, closed stdin, an app-data working directory, and inherited Cloudflare credential/context overrides removed. Node version detection inspects the selected bundled or system runtime. No Cloudflare REST client is included.

`prepare` fetches the installed CLI schema and issues an expiring backend-owned plan. `run_plan` accepts its ID, not arbitrary executable text. Parameters must occur in the schema. Context and `--force` overrides are rejected. Mutations require confirmation, verify account identity with `cf accounts get`, and verify the selected zone's account. If help advertises `--dry-run`, its successful result must precede execution. Duplicate concurrent runs of the same plan are rejected.

History and schemas are stored in the OS application-data directory under the app identifier. Preferences and non-secret resource summaries use the Tauri webview's local storage. OAuth state remains entirely owned by cf. Output and structured sensitive fields are redacted before history, events, or IPC. Credential-returning command groups are blocked. History is capped at 200 records; captured output at 2 MB per stream. Commands time out after two minutes. Cancellation kills the direct CLI child; detached descendants are not currently supervised.

## Beta compatibility and current boundaries

CLI argument/schema contracts were inspected against **cf 1.0.0-beta.8** from the official npm package and [Cloudflare's documentation](https://developers.cloudflare.com/cf/). Installed schemas are used at runtime rather than a bundled operation catalog. Unsupported/malformed schemas stop execution and show help or raw output. A successful exit with invalid JSON is reported as an output compatibility error.

This is the Phase 1 foundation plus initial resource management screens, not the full long-term product roadmap:

- Live OAuth and resource changes need testing with your own Cloudflare account; development validation uses injected process fixtures and demo data. No real account was accessed or changed.
- Lists load the CLI's default result page. Counts describe loaded resources, not guaranteed account totals. Automatic pagination is not implemented.
- Worker deployment from local projects, perpetual Worker tail sessions, a dedicated SQL console, R2 object browsing, and native security/product screens are not implemented. Detail tabs route these needs to discovery. Commands without generated API schemas (including local project commands) show help and cannot execute from Explorer.
- Complex request-body unions use an editable JSON form; simple path and query parameters have typed fields. The CLI dry-run remains the body validator.
- Account metadata/workspace grouping is local; workspace management currently supports a label and discovered account assignments rather than a full grouping editor.
- Internal links have a parser and serializer; OS protocol registration and cross-process link opening are not yet included.
- Settings display bundled/system runtime provenance. Source-only development builds provide manual CLI installation instructions. Runtime updates ship with app releases; configurable retention and OS-keychain API-token authentication are not included.
- Direct process cancellation and output streaming are implemented. Retry means preparing a fresh command, so stale mutations cannot be blindly replayed.
- macOS compilation is verified locally. Windows/Linux builds require their respective toolchains and CI validation.

## Tests

Rust fixtures cover valid JSON, valid stdout with progress on stderr, authentication/permission/unknown-command errors, malformed JSON, redaction, timeouts, cancellation, explicit context, invalid/changed schemas, flag injection, fresh account verification, and schema cache invalidation across CLI versions. Process-runner tests exercise streaming, cancellation, and real timeouts without a Cloudflare account.

TypeScript tests cover normalized CLI envelopes, D1 UUIDs, R2 bucket shapes, invalid resource output, DNS proxy state/TTL, explicit command context, and internal link round trips.

## Investigation tools

The analytics sidebar includes **Investigate → Log Explorer, Rule simulator, and Logpush**.

- Log Explorer runs SELECT queries against enabled account or zone datasets and displays the returned rows. Cloudflare subscription, retention, and dataset permissions apply.
- Rule simulator uses Cloudflare Trace to evaluate existing rules for an HTTP request. It always sets `skip_response: true` so the trace does not contact the origin. It supports method, country, and request body inputs and displays nested rule evaluation steps.
- Logpush lists jobs for the selected account or zone. Creating disabled jobs, toggling delivery, and deleting jobs use the existing command review flow. Destinations needing credentials or ownership verification should be set up in Cloudflare first; credential-bearing payloads remain unsupported.

Demo mode shows labeled sample Logpush jobs. SQL and rule evaluation require a connected live account. Validation uses local adapter tests, backend argument tests, and bundled CLI dry-runs; live service responses have not been verified against a customer account.

## Account and Web analytics

The analytics sidebar has two dedicated reports, each with a 24-hour or 7-day range ending at the last complete UTC hour. Displayed timestamps use the system timezone.

- **Account analytics** aggregates HTTP requests, bandwidth, cache hit rate, and Cloudflare-reported threats across the account's zones. It includes an hourly chart and a zone breakdown. Unavailable zones are explicitly listed and excluded from partial totals.
- **Web analytics** uses the account's Web Analytics beacon dataset for page views and visits. It includes hostname filtering, an hourly chart, and top sites, paths, referrers, countries, and browsers. Top-10 lists do not determine report totals. Visits are not unique people; Cloudflare may sample the dataset.

Both reports use the existing bundled CLI login inside a read-only child process. The login needs Analytics read permission; Account analytics also needs zone access. Dataset retention and availability depend on the plan. Demo values are labeled as sample data. Adapter tests cover missing metrics, incomplete responses, partial zone failures, and independent web totals; live GraphQL access has not been verified against a customer account.

References: [GraphQL Analytics API](https://developers.cloudflare.com/analytics/graphql-api/) and [Web Analytics metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/).

## GitHub Actions releases

See [RELEASES.md](RELEASES.md) for the build matrix, version/tag process, signing secrets, draft releases, and website download integration. Push a matching `v<version>` tag to prepare a draft release; a manual workflow run produces preview artifacts. Each complete release contains platform installers, `downloads.json`, and SHA-256 checksums.

## License

FlareOps is open source under the [MIT License](LICENSE). Copyright (c) 2026 Walter Lim.

You may use, modify, distribute, and sell copies, provided you retain the copyright and permission notice. FlareOps comes without warranty; see the full license for the terms.

This license applies to the FlareOps original code in this revision. Third-party dependencies and assets retain their own licenses; see [NOTICE](NOTICE).

## Archived project experiment

The desktop app uses the original Cloudflare management navigation. Projects,
AI project onboarding, and the harness are disconnected from the app and desktop
build. Their source is retained for extraction into a separate project; existing
local project data is preserved. The following describes that inactive experiment.

### Protected project previews

Deploy preview uses the signed-in Cloudflare profile and selected account. Before
uploading code, it creates a project-specific Access application that allows the
signed-in user's email. Zero Trust must already be enabled, and the login must
have Access, Workers and requested storage permissions. A setup or policy
verification failure stops the upload; there is no automatic public fallback.
Worker-level Access currently does not support WebSockets.

Agents can declare isolated storage in the reviewed commit at
`.flareops/preview/resources.json`:

```json
[
  { "type": "d1", "binding": "DB" },
  { "type": "kv", "binding": "CACHE" },
  { "type": "r2", "binding": "FILES" }
]
```

The desktop provisions empty resources, binds them to that review, and reuses them
on redeploy. Production IDs and arbitrary Wrangler configuration are rejected.
D1 schema initialization belongs in the application and should be idempotent.
The confirmation dialog lists the requested bindings before provisioning.

Deletion retains data by default. The optional data cleanup deletes D1 databases,
KV namespaces and empty R2 buckets after deleting the preview. Nonempty R2 buckets
must be emptied in Cloudflare first. The project Access application is retained
because it protects other review previews too.

Provisioning metadata is journaled in the desktop application data directory,
scoped by account, profile and project. Keep this journal when moving installations.
An ambiguous interrupted API create requires reconciliation in Cloudflare and the
local journal; FlareOps refuses to guess ownership or create duplicate resources.
An interrupted desktop process may leave a `.lock` file; remove it only after
confirming the recorded process has stopped. API credentials are never saved in
this journal or supplied to generated code.

Update the account's harness backend to export resource manifests from new reviews,
and rebuild/restart the native app for the provisioning helper. Unit tests use
mocked APIs; live Access and resource provisioning have not yet been verified.

References: [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
and [preview resource isolation](https://developers.cloudflare.com/workers/previews/resources/).
