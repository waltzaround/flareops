# FlareOps agent backend

This separate Worker powers the desktop Projects page. It uses the selected
account's Workers AI binding, Artifacts repositories, and two durable agents
with separate `@cloudflare/computer` workspaces. The implementation is a preview;
cloud deployment and live model/import execution have not yet been verified.

## Set up from FlareOps

Sign in to Cloudflare, select the account, then open Projects → Connect agent
backend → Set up backend. The same action is available during onboarding.
Setup uses that named cf profile; no second Wrangler login, account ID, URL,
or backend token is required for a new installation.

The account needs access to Artifacts, Workers AI, Durable Objects, Dynamic
Workers and Containers, and an enabled workers.dev subdomain. Docker must be
installed and running locally to build the pinned agent container image.
Resources and inference incur usage charges in the selected account.

Setup checks account access and Docker, deploys `flareops-harness` with its
bindings and container images, supplies a generated `HARNESS_TOKEN`, and checks
the backend health before saving the connection. The credential is saved in the
OS credential store before deployment, so retry can resume after partial
failure. Cloudflare OAuth credentials only go to Cloudflare and the deployment
subprocess; neither credential is returned to the renderer.

Wrangler receives the backend secret through a temporary secrets file in a
private temporary directory (mode 0600 on Unix). Temporary configuration and
logs are removed when setup finishes or fails normally. A forced process kill
can leave temporary files. The Cloudflare login token is passed to Wrangler in
its process environment and is never written to that secrets file.

A non-secret installation fingerprint prevents setup from overwriting an
unrecognized existing Worker or rotating another installation’s token. To
connect another installation or a manually deployed backend, use Advanced
connection with its existing HTTPS origin and access token. Connections and
pending setup credentials are scoped by account and profile. This is a
single-account backend; accounts each get their own deployment.

The installer does not start agents, import repositories, or delete partial
cloud resources. Retry checks an existing installation before deploying again.
Artifacts creates the default namespace when the first repository is created.

### Packaging and development

`npm run desktop:build` stages the pinned backend source and deployment
runtime along with the cf sidecar. It copies an explicit allowlist and excludes
local credentials and Wrangler state. For desktop development, install the
backend dependencies with `npm ci --prefix harness`; native debug builds use
that directory. Browser preview cannot deploy or access credentials.

Manual deployment remains available for development:

```sh
cd harness
npm ci
node scripts/configure.mjs YOUR_CLOUDFLARE_ACCOUNT_ID
npx wrangler login
npx wrangler deploy --config wrangler.local.json
npx wrangler secret put HARNESS_TOKEN --config wrangler.local.json
```

For manual deployment, use a random token of at least 32 characters and keep it
in a password manager. The checked-in configuration has no account ID or
secrets. The root Wrangler configuration belongs to the marketing website;
backend setup never uses it.

### GitHub imports

Public repositories need no GitHub token. For private repositories:

```sh
npx wrangler secret put GITHUB_TOKEN --config wrangler.local.json
```

Use a fine-grained GitHub token with read access to repository contents for the
repositories you want to import. GitHub organization policies may require
additional approval. Imports clone full history, copy all advertised branches
and tags to Artifacts, and verify their object IDs. The source is never pushed
to. Empty repositories and repositories reporting more than 100 MB through the
GitHub metadata API are rejected in this preview. Large/LFS repositories and
submodules need additional support: LFS objects, issues, PRs, Actions secrets,
releases and other GitHub metadata are not copied. Failed imports retain the
partial target and can be retried. Do not treat them as completed copies.

### Execution and review

New runs initialize or clone the project, then launch an implementation agent
and a documentation agent in parallel. Each has its own workspace and branch.
Agents use Workers AI and filesystem/shell tools, with Linux commands routed to
Containers. A run allows up to 20 model steps, 100,000 reported tokens and 20
minutes per agent; individual commands are stopped after 60 seconds. These are
execution limits, not a monetary spending cap.

### Budgets, concurrency, and shutdown

Backend settings expose account-wide AI budgets: defaults are **US$5 per UTC
day**, **US$50 per UTC month**, and **two concurrent project/import runs**.
Limits are shared across profiles. Setting either dollar limit to zero stops
new model calls; lowering a limit does not cancel calls already in flight.
The concurrency selector supports one or two runs to match the configured
four agent containers. A durable lease admits each run atomically; abandoned
leases expire after 30 minutes, and projects stop after 25 minutes.

These are estimated **AI inference budgets**, not caps on the complete
Cloudflare invoice. CPU, container runtime, storage, requests, Git operations,
and logs remain separate. Only the configured Kimi K2.7 Code model currently
has a reviewed price and context bound; other models fail closed.

Before every provider call, the account ledger reserves US$0.265421: the full
262,144-token input window at $0.95/million plus 4,096 output tokens at
$4/million. Automatic model retries are disabled. Known input/output usage
replaces the reservation at those rates, ignoring cache discounts
conservatively. Missing usage, aborted calls, and crashes retain their full
reservation; replayed calls need new reservations. This can stop runs before
the actual invoice reaches the limit. Prices are estimates fixed to the
October 2026 model rates and must be maintained when provider pricing changes.

Run status reports input tokens, output tokens, estimated AI cost, and
in-flight/unconfirmed reservations separately. Late responses settle against
the original UTC day and month. The ledger and usage survive restarts.

Agents explicitly destroy their containers after success, failure, and
cancellation. Project containers stop after import/integration, cancellation,
failure, and merge attempts. Failed shutdowns retain a cleanup alarm for retry;
terminal alarms also retry cleanup. Durable workspace files and Git branches
are retained, but ephemeral container processes/disk are disposable.

Existing installations need **Update backend** in the connection dialog to
receive the new account Budget Durable Object and its v2 migration. Update
when no runs are active. A deployment from another installation still requires
its existing credentials and a manual upgrade; setup does not claim ownership.

Durable Object alarms advance runs and persist model conversations between
steps. Closing the desktop does not cancel a run. If an instance dies mid-step,
that step can replay; exactly-once external tool effects are not guaranteed.
Cancellation is best effort and does not reverse accepted remote operations.

Agent branches are integrated into a review branch. Conflicts stop the run;
there is no automatic conflict resolution yet. Main is only updated after
explicit approval of the review head, with a fresh main-head check and a
non-force push. Diffs larger than 60 KB stop the run instead of presenting a
truncated approval. Review agent reports carefully: test execution is available
to the agents, but there is no independent mandatory validation gate yet.

BYO model configuration is retained in the desktop, but this backend currently
accepts Cloudflare models only. GitHub export/migration helpers are present in
`src/repositories.ts`; they are not exposed in the desktop or API yet. Keep the
source repository until a migration's refs have been verified.

## Local checks

```sh
npm run check
npm test
WRANGLER_LOG_PATH=/tmp/flareops-wrangler.log npx wrangler deploy --dry-run --containers-rollout=none
```

The last command validates the Worker bundle only. A full dry run and deployment
also require Docker to build the pinned computerd image. Model inference and
Artifacts service behavior require a configured Cloudflare account; unit tests
use mocks and do not prove cloud integration.

## Cloudflare Worker Previews

Completed project reviews expose **Deploy preview**, **View bundle**, refresh,
and delete in the desktop. The app uses Cloudflare's branch Preview product
through pinned Wrangler 4.146.0, not legacy version preview URLs.

The implementation agent is instructed to produce a self-contained ES module
Worker at `.flareops/preview/worker.js` (up to 2 MB), embedding static assets and
bundling dependencies. Existing projects need a new agent run to generate it.
Apps requiring data bindings currently need mock integrations in this bundle;
full project configuration, preview database provisioning, custom domains,
Access policies, and secret editing are not automated by this flow yet.

The backend exports the bundle from the exact reviewed Git tree. Generated
bundle content is not expanded into the source diff; its size and SHA-256 are
shown instead, and View bundle exposes the committed source before publishing.
Source changes still have the 60 KB review limit. The desktop sends only this
bundle to Wrangler, with a generated configuration. It never executes repo
build scripts or package lifecycle hooks with Cloudflare credentials.

Preview parents are scoped to account/profile/project; each review commit has
its own named Preview. The UI shows the Preview URL and immutable Deployment
URL, verifies the deployment's commit tag, and links to Cloudflare's deployment,
logs, and settings dashboard. Refresh recovers deployment state after restarting
the desktop. Deleting a Preview deletes that Preview's deployment history but
does not delete the project repository or parent Worker. Previews remain until
manually deleted or Cloudflare prunes its oldest previews/deployments at limits.

Publication requires the Deploy preview action because workers.dev URLs are
public. No production routes, secrets, data bindings, or Preview Base settings
are inherited. Observability is enabled, and only ENVIRONMENT=preview is set.
Merge approval does not deploy to production or delete the preview. Preview
traffic/logs cost is outside the AI budget. Live deployment is not yet verified.

References:
- https://developers.cloudflare.com/workers/previews/
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/previews/resources/
