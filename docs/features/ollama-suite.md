# Local Ollama suite manager

The desktop application provides a guided local Ollama manager with a bounded Model Store, local-service health, a pull cart, chat, and allowlisted harness planning. It intentionally does not execute shell commands, connect to hosted model services, invent sample models, scrape an undocumented catalogue, or claim that Ollama launches third-party harnesses.

## Local service boundary

The service accepts only the exact `http://127.0.0.1:11434` origin and the documented routes `/api/version`, `/api/tags`, `/api/ps`, `/api/pull`, and `/api/chat`. Redirects, credentials, query strings, arbitrary paths, hostname aliases, cloud endpoints, and user-entered base URLs are rejected. Responses, streams, names, histories, queues, and persisted records have explicit byte and item limits.

Health combines a validated version, installed-model inventory, and running-model inventory. A refused connection is reported as missing; a malformed or unhealthy service is kept distinct. Pulling uses only `POST /api/pull`, never a CLI or shell, with two concurrent workers, 128 queued items, streamed progress, cancellation, retry, partial outcomes, and atomic durable queue state.

Chat uses only `POST /api/chat`. Model identity must match a verified catalogue variant; history, messages, images, and generation parameters are bounded. Image attachments are accepted only for a variant whose verified capabilities include vision. Cancellation aborts the active local request. Exports omit the system prompt, omit attachment data, and redact common credential assignments.

## Official catalogue and fit evidence

The catalogue adapter is deliberately separate from the core parser so the desktop UI does not embed an undocumented scraper in privileged code. Every page must identify the official source, one stable source revision, its exact page number and URL, the next official URL, and each published variant. Refresh follows every page up to explicit safety limits, detects cycles and duplicates, records completeness/page count/timestamp/revision, and falls back offline to a previously validated cache marked stale. Until a reviewed adapter is supplied, the Model Store displays its explicit unavailable or stale state rather than inventing entries. Installed models remain independently available from the local API.

Fit verdicts are `Runs well`, `Runs with limits`, `Unlikely`, or `Unknown`. The calculation uses exact blob size, parameter count, quantization, context overhead, detected available RAM, VRAM, supported accelerator state, driver evidence, and free disk. A model name never affects the verdict. Missing facts produce `Unknown`; insufficient disk or memory produces `Unlikely`.

## Harness boundary and failure modes

Harness preparation is an allowlisted typed plan, not arbitrary process execution. Only the shipped `vscode-continue`, `opencode-local`, and `open-webui-local` profiles exist. The desktop picker presents semantic choices, fit preflight, a preview, and restore controls. A plan accepts fixed executable identifiers, fixed arguments, and fixed loopback environment keys; it always includes a configuration snapshot and requires rollback on failed launch. Launch remains disabled until a reviewed installed-executable detector and rollback executor are available. Those paths must keep secrets out of arguments, environment, snapshots, and logs.

Failure is fail-closed: invalid inventories, unofficial sources, incomplete pagination, duplicate variants, unknown payload fields at integration boundaries, unsupported attachments, oversized content, arbitrary commands, and unverified model names cannot mutate state or start work. The desktop surface includes guided Material Design controls, troubleshooting, a Model Store regex search, a bounded pull cart, chat, and harness planning. Hardware probing, a reviewed official-catalog adapter, native attachment/export handoff, executable detection/launch/rollback, and packaged interaction evidence remain documented boundaries.

## Verification

`scripts/tests/ollama-suite.test.mjs` covers strict loopback routing, official catalogue validation and pagination, offline stale fallback, evidence-driven fit, local health, bounded pull API behavior, streaming chat, cancellation, export redaction, attachment capability rejection, and allowlisted rollback plans. Negative regressions reject cloud URLs, URL aliases, arbitrary paths, uncatalogued models, unsupported parameters, arbitrary shell fields, and custom executable profiles.

## Suggested articles

- [Workspace and search](workspace-and-search.md)
- [Scheduled settings](scheduled-settings.md)
- [Offline documentation](offline-documentation.md)
