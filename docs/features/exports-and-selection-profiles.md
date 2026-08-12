# Exports, archives, and editor handoff

The desktop application exports structured records from the active view through one bounded main-process contract. The scope is explicit as all rows, the current filtered view, or the current selection, with source and exported counts recorded in every manifest.

## Behavior

Available formats are JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, TypeScript, JavaScript, Python, Go, Rust, JSON Schema, and Protobuf-compatible JSON. UTF-8 encoding and LF or CRLF line endings are stated in the manifest. Formats that cannot preserve a field are refused before saving.

Every ordinary export states that personal-vocabulary data, source-file metadata, TOTP/authenticator secrets, credentials, verifier proofs, and encryption keys are omitted. Ordinary export cannot include those values. No secret-export shortcut is provided; any future secrets export requires its own destructive super-confirmation flow.

ZIP and 7z archive export are available when a trusted local `7z.exe` is installed. The 7z surface exposes method, compression level, dictionary and word sizes, solid/non-solid mode, solid-block size, thread count, split-volume size, AES-256 content encryption, and header encryption. When content encryption is on but header encryption is off, the UI warns that filenames remain visible. Password input is bounded, sent only to the local archive process over standard input, cleared from renderer state after the attempt, and never logged, stored, exported, or recorded in history.

After a file is saved, the same surface offers a direct Visual Studio Code action. Detection covers stable, Insiders, PATH, and trusted portable layouts. If VS Code is unavailable, the action reports that honestly and returns the official download route rather than launching another editor.

Selection profiles remain local renderer state and can replace, add, or subtract row selections. Profile export uses the same structured-export surface.

## Failure modes

- Oversized, cyclic, unsafe-key, non-finite, or non-JSON-shaped input fails closed.
- Archive export refuses a missing or untrusted 7-Zip installation and cleans its temporary staging directory.
- Existing target files are not silently overwritten by the plain-file path.
- Cancelling the save dialog writes nothing.

## Security considerations

The renderer supplies structured values rather than executable text or a destination path. The main process revalidates the view, format, scope, counts, size, archive options, and sensitive-field omissions before opening the native save dialog. Archive passwords are never included in command arguments or redacted logs.

## Verification

`npm run check` exercises structured formats, archive configuration and command construction, external-editor detection and launching, renderer contracts, and the main/preload boundary.

## Suggested articles

- [Local Git-backed history](local-history.md)
- [Notifications](notifications.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)
