# Package operations

Material System Utility provides a reviewed application catalogue and a narrow, explicit boundary for package changes. The renderer never constructs a shell command from free-form text.

## Behavior

The application can:

- load the bundled application catalogue;
- detect installed WinGet packages;
- install selected catalogue packages;
- uninstall selected catalogue packages; and
- request a WinGet upgrade-all operation.

Install and uninstall operations run sequentially. The interface receives progress for each selected package and reports the real process exit code and output.

## Identifier validation

Ordinary package identifiers must match the application's bounded WinGet identifier pattern. Microsoft Store catalogue records use the explicit `msstore:<StoreId>` form. The main process separates that form into the `msstore` source and a validated Store ID before execution.

The supported commands use argument arrays with exact, silent, non-interactive behavior and package/source agreement flags. Invalid identifiers are rejected before WinGet starts.

## Configuration

Package metadata lives in the bundled reviewed catalogue at `config/winutil.json`. The source catalogue is data, not executable instructions. Adding an item does not authorize arbitrary script execution.

## Failure modes

- If WinGet is not available, the application attempts the operating system's supported Desktop App Installer registration path and then checks again.
- An invalid package identifier returns an input error without starting a package operation.
- A package-manager failure keeps the actual non-zero exit code and output.
- A partial multi-package operation reports each completed item and does not claim that the whole selection succeeded.

## Security considerations

- Renderer text never enters `ScriptBlock::Create` or a downloaded script.
- Only reviewed operation kinds cross the preload bridge.
- Package identifiers are validated again in the main process.
- The application does not silently bootstrap a third-party package manager.
- Package installation still changes the computer. Review the selected package names and publisher information before running an action.

## Verification

The committed baseline verifier checks catalogue totals, identifier shapes, the Microsoft Store parsing path, explicit source selection, and the absence of unsafe script-evaluation patterns. Local builds compile the TypeScript sources and run that verifier.

## Suggested articles

- [Workspace and search](workspace-and-search.md)
- [Build and installer](build-and-installer.md)
- [Release boundary](release-boundary.md)
