# Release v0.1.8601 capture evidence

These curated PNG files are real frames from the published unsigned Squirrel.Windows
full package for commit `3de1bba97d9f59daaba1fe10e083158ef8760183`.

- Release: `v0.1.8601`
- Full-package SHA-256: `4ff8e5e383adce246b4edc0f6d5d5fcd9a349b2da7ed31fba8db71b89c02e7b9`
- Capture route: cheap hidden desktop plus isolated loopback CDP
- Verified matrix: 71 decoded non-duplicate frames (51 desktop-app, 20 live-site)
- Safety counters: zero package commands, zero completed confirmations, and zero visible-desktop interactions

The checked-in gallery is intentionally compact. The full generated matrix is kept out
of Git because its raw metadata contains local capture-environment paths; the smoke
verifier is the authoritative method to regenerate and validate it.

| File | Surface |
| --- | --- |
| `app-install-dark-comfortable-en-1440x940.png` | Package catalogue |
| `app-install-dark-en-360x600.png` | Narrow package catalogue |
| `app-locks-manager-empty-dark-en.png` | Functional Locks manager |
| `app-locks-support-local-dark-en.png` | Local-only Support Tickets recovery route |
| `app-docs-bundle-18-index-dark-en-1440x940.png` | Offline documentation browser |
| `app-appearance-editor-root-dark-en.png` | Opaque appearance editor |
