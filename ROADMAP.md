# Roadmap

This roadmap separates shipped behavior from future work. Dates are intentionally omitted until a milestone has an owned delivery plan and verified release path.

## Current baseline

- [x] Public repository with distinct Material System Utility branding.
- [x] Reviewed WinUtil-derived catalogue with retained attribution.
- [x] Frameless Material Design desktop shell.
- [x] Exact validated WinGet install and uninstall.
- [x] WinGet upgrade-all and installed-package detection.
- [x] Local catalogue search and regex tooling.
- [x] Basic tabs, groups, pinning, bulk-close preview, and appearance preferences.
- [x] One-click runnable and unsigned Squirrel.Windows installer build scripts.
- [x] Local responsive documentation site and release-boundary inventory.

## Release readiness

- [ ] Complete installed-build automatic-update verification against the published
      mutable unsigned feed, including hash mismatch, replacement, and rollback cases.
- [ ] Finish runtime accessibility checks at narrow widths and 100%, 125%, 150%, and 200% display scale.
- [x] Capture every shipped surface from the exact release commit (71 verified states for `v0.1.8601`).
- [x] Publish a verified non-draft release with unsigned Squirrel.Windows assets, hashes, release timing, line-count evidence, and current documentation.
- [x] Publish the documentation site with a versioned installer link and an explicit
      warning that immutable releases are disabled and assets can be replaced by administrators.

## Safe system adapters

- [ ] Design one bounded, allowlisted adapter per tweak family.
- [ ] Add preflight, preview, rollback, progress, and real failure evidence for every adapter.
- [ ] Implement optional-feature operations without evaluating catalogue-authored scripts.
- [ ] Keep AppX removal, update-policy changes, and image servicing unavailable until their destructive boundaries and rollback paths are independently reviewed.

## Universal product contracts

- [ ] Complete language coverage for English, Hong Kong Cantonese, and bilingual mode.
- [ ] Complete per-language humor controls, narration, and personal-vocabulary handling.
- [x] Implement shared mode plus persistent scheduled settings with bounded HTTPS and Home Assistant boolean activation.
- [ ] Extend live cross-application propagation beyond the shared School-mode record and capture packaged scheduled-settings interaction proof.
- [ ] Complete per-element appearance editing across every rendered element and state. The shared color translator, alpha, clipping feedback, copy actions, and WCAG contrast readout now exist in the picker; packaged interaction and full per-element coverage remain.
- [x] Provide structured exports, bulk actions, local Git-backed history, locks, TOTP, and local recovery flows.
- [ ] Finish the changelog viewer and command-palette coverage inventory.
- [x] Finish the offline in-app documentation browser.
- [x] Ship the non-blocking public-catalog dim-sum startup surprise with cache integrity checks and protected-startup suppression.

Items remain unchecked until their actual runtime behavior, documentation, tests, artifacts, and release evidence exist.
