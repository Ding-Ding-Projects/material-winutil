# Tweaks and configuration catalogue

The Tweaks and Config destinations are searchable, read-only catalogue surfaces. They make WinUtil records inspectable without enabling the higher-risk system adapters that would apply them.

## Behavior

The application groups 67 tweak records and 33 optional-feature or fix records by category. Users can search, inspect descriptions and identifiers, select rows, collapse groups, and use the repository's Standard, Minimal, or Advanced tweak presets to change the current selection. Applying a preset selects catalogue identifiers only; it does not modify Windows.

The row detail view states that the item is read-only. Buttons and menu entries that would execute a tweak, optional feature, undo, AppX removal, or a Windows Update policy are disabled or return a visible unavailable result.

## Configuration

Catalogue records and presets are bundled in `config/winutil.json`, derived from the reviewed upstream data. The records are data, not commands. The shipped main-process operation allowlist supports package installation, package removal, and upgrade-all only.

## Failure modes

- If an unsupported operation reaches the main process, it returns exit code `78` with an explanation that the verified adapter is not installed.
- A missing or invalid catalogue fails validation rather than silently changing the expected record set.
- An empty or invalid search produces explicit feedback and does not execute anything.
- Preset selection can still be recorded in the local event log even though no system change occurred; the entry describes selection, not execution.

## Security considerations

No tweak body is interpreted as a script. The renderer cannot turn free text or a catalogue value into a PowerShell command. System-wide registry, service, scheduled-task, AppX, optional-feature, and policy mutations remain unavailable until individually bounded adapters are implemented and reviewed.

## Verification

The baseline verifier checks catalogue totals, expected data shapes, and the operation allowlist. Contract tests confirm unsupported operation kinds fail closed. There is no execution test for tweaks or optional features because this build deliberately does not execute them.

## Suggested articles

- [Package operations](package-operations.md)
- [ISO customization preview](iso-preview.md)
- [Destructive confirmation](destructive-confirmation.md)
- [Release boundary](release-boundary.md)

