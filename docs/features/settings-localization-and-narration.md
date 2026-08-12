# Settings, localization, and narration

The Settings destination persists a useful appearance, language, and spoken-narration subset. Narration is off by default and uses the operating system speech voices only after the user enables it.

## Behavior

Available preferences include light or dark theme, comfortable or compact density, accent, a bounded font-family list, font scale, font weight, corner radius, reduced motion, export format, tab docking, language mode, two funny-level values, narrator language, narrator enabled, narrator quiet hours, and reduced sound. Valid preferences are projected and written atomically to the application user-data directory.

The production settings surface also owns a bounded application display name, a persisted **Show emojis in dialogs and message boxes** switch, and the shared School mode record. Renaming changes the title bar, app bar, About heading, and app-authored presentation only. The application id, package id, user-data directory, update feed, and history identity stay fixed.

Dialog emoji are rendered as separate `aria-hidden` presentation nodes selected from a fixed category map. They never enter dialog titles, messages, buttons, labels, or accessible names. The toggle is keyboard reachable and persists independently of language and funny-level settings.

English, Hong Kong Cantonese, and bilingual modes change the primary navigation, search copy, category labels, and an implemented set of common controls. A substantial amount of secondary copy remains English-only, so this build must not be described as fully localized.

## Configuration

Language and narrator choices are persisted with the other preferences. Values outside the accepted enums and numeric bounds are rejected. The reset action restores the shipped preference object after destructive confirmation.

## Narration behavior

The main process owns a bounded serialized queue. Same-category events debounce and supersede stale queued work, categories have cooldowns, and errors bypass those cooldowns so their exact facts remain available. `Both` always speaks English and then Cantonese without overlap. The funny levels add a localized lead-in while retaining the complete source fact.

The renderer uses `SpeechSynthesisUtterance` with a local English or Hong Kong Cantonese voice when one is installed. It receives only a numeric request id, bounded text, and a language tag through the isolated preload bridge; there is no shell command or child-process speech route. Cancellation, shutdown, and a bounded watchdog prevent a stuck speech engine from holding the queue forever.

Narration yields when Electron reports active accessibility support and mutes for quiet hours or reduced sound. These choices suppress audio, not the visual notification or its exact error detail.

School mode is a versioned shared record below local application data. The desktop process watches that record and applies generation-ordered updates live. Its label is user-renamable. Enabling requires a configured local password; only a salted verifier is stored in Windows Credential Manager. Disabling validates the password through the main process. This is a user-experience lock, not a security boundary, and the credential can be reset locally.

While the mode is enabled, the renderer uses effective English presentation and omits Cantonese, bilingual, funny-level, personal-vocabulary, dialog-emoji, and dim-sum surfaces. Stored base preferences are not overwritten and return live after an accepted unlock. A corrupt or unwatched shared record is reported as unavailable and suppresses private personalization instead of being assumed off. Scheduled settings remain visible and follow the effective English-only presentation boundary.

## Failure modes

- Missing or malformed preference data falls back to shipped values.
- A missing shared School mode record is created once. A corrupt record is retained for diagnosis and produces an explicit unavailable state; it is not overwritten as disabled.
- If Windows Credential Manager is unavailable, password setup or unlock reports that exact unavailable boundary and does not change the mode.
- Invalid values are rejected rather than partially applied.
- An enabled narrator can still be silent when no compatible platform voice is installed, the operating-system speech engine fails, assistive technology is active, quiet hours is enabled, or reduced sound is enabled. The Settings status and notification centre report the applicable state.
- Cantonese voice quality depends on the Hong Kong voices installed in Windows. The application does not implement a network speech service; the selected operating-system voice remains subject to the operating system's own voice-service behavior.
- Some untranslated secondary text remains English in Cantonese and bilingual modes.

## Security considerations

Preferences contain no credentials. The files are local, bounded, and atomically replaced. The School mode record carries only stable credential metadata; the salted verifier is held under an application-owned Windows Credential Manager target. Password values never enter the shared record, renderer persistence, logs, exports, or history. Personal-vocabulary data is stored separately in its validated local cache, and no Home Assistant token is accepted through narrator preferences.

## Verification

Local behavioral checks cover disabled-by-default narration, serialization without overlap, strict English-then-Cantonese order, funny-level formatting with preserved facts, debounce, category cooldowns, error handling, accessibility and quiet suppression, cancellation, stop, bounds, and the isolated renderer transport. Focused settings-service checks cover display-name and emoji persistence, a non-plaintext password verifier, School mode enable/unlock and preference restoration, corrupt-record fail-safe behavior, bounded IPC/preload/renderer seams, and the persistent scheduled/external-settings service. All-copy localization and packaged interaction proof remain separate incomplete contracts.

## Suggested articles

- [Appearance controls](appearance-controls.md)
- [Notifications](notifications.md)
- [Offline documentation browser](offline-documentation.md)
- [Release boundary](release-boundary.md)
