# Release dependency inventory

The Windows release workflow starts on the pinned `windows-2025` GitHub-hosted runner image because no compatible repository-scoped self-hosted runner is currently registered. Organization runner inventory must be readable and a compatible runner must be online, idle, repository-accessible, Windows x64, and correctly labelled before the workflow may be changed to use it.

## Release job

| Dependency | Version or source | Bootstrap path | Purpose |
|---|---|---|---|
| Windows runner | `windows-2025` | GitHub-hosted image | Windows and PowerShell execution |
| Git | Runner-provided, verified by checkout | `actions/checkout@v4` with full history | Source checkout, tags, and blame-based line attribution |
| Node.js | `22.15.0` x64 | `actions/setup-node@v4` | Locked npm install and release scripts |
| npm packages | Exact `package-lock.json` graph | `build.bat /s` and `build-installer.bat /s` run `npm ci` | TypeScript compilation, Electron, and Squirrel.Windows packaging |
| Electron binary | `37.0.0` | Checksum-verified `scripts/ensure-electron-binary.mjs` path | Application packaging |
| GitHub CLI | Runner-provided | Version is recorded before publication | Catalog lookup and release publication |
| Squirrel.Windows | `electron-builder-squirrel-windows@26.15.3` | Locked npm graph | Unsigned Setup.exe, RELEASES, full package, and delta packages where generated |

The workflow does not install or use code-signing tools or credentials. It proves the generated Setup executable has the `NotSigned` Authenticode status and fails packaging when that condition is not met.

The clean hosted image plus the repository's one-click build scripts are the cache-miss bootstrap proof. Both scripts install the exact locked package graph without manual preparation. Workflow caches may improve speed later, but are not required for correctness.
