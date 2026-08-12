# Appearance controls

Global appearance preferences work and persist. The broader per-element editor is a partial surface and must not be described as a complete theme engine.

## Behavior

The Settings destination applies light or dark theme, comfortable or compact density, accent, font family, font scale, font weight, corner radius, and reduced motion. Tab docking supports left, right, top, and bottom and persists with the workspace.

The color picker provides hue, saturation, lightness, and alpha controls, native full-spectrum selection, preset starting points, recent colors, and a live preview. Its renderer-only translator consumes the shared appearance color engine and lets the user select, edit, and copy HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, CIELAB, LCH, OKLab, OKLCH, or CMYK representations. Non-HEX representations use an explicit bounded JSON object so channel names and alpha remain unambiguous.

The picker reports whether the selected representation is inside the displayable sRGB gamut. When a source conversion is outside that gamut, it identifies the clipped channels rather than silently claiming an exact display match. A configurable HEX/HEX8 background produces a composited WCAG contrast ratio and separate normal- and large-text AA/AAA results. Selection and profile colors have visible effects.

Context menus and toolbar actions can open a per-element editor showing accent, font, radius, scale, and weight. Applying the editor to the application root updates the global persisted preferences.

## Configuration

Validated global preferences are stored in the application user-data directory. The font selector currently offers a small fixed list; it does not enumerate all installed fonts. Named-theme storage is visibly disabled.

## Current boundary

Non-root element overrides exist only in renderer memory and the rendering path does not yet consume them consistently. An **Appearance applied and persisted** message for such a target must not be interpreted as proof that the target changed or survived restart.

The editor does not provide word-processor-depth typography, every element and pseudo-state, named presets, import/export, property locks, or self-theming picker chrome. The color translator is implemented in the picker, but that does not complete the broader per-element editor or prove that every rendered element consumes every appearance value.

## Failure modes

- Invalid persisted global preferences fall back to shipped defaults.
- Invalid, overlong, or out-of-range translator input is rejected in place; it is not partially applied.
- Out-of-sRGB values are converted through the shared engine and reported with their clipped channels before the display preview is used.
- An invalid contrast background keeps the selected color intact and replaces the ratio with an actionable validation message.
- Reset element removes the in-memory override but cannot restore a property that was never rendered.
- Unsupported named-theme storage remains disabled instead of pretending to save.
- A non-root editor can show controls without producing a durable visual change; this is a known implementation boundary.

## Security considerations

Appearance values are bounded before main-process persistence. Font strings reject control characters and excessive length. No remote font, stylesheet, or theme asset is fetched by these controls.

## Verification

Shared contracts cover every color-space round trip, alpha, gamut clipping, and composited WCAG contrast. Renderer contracts verify that the picker loads the same shared engine, exposes all ten representations, bounds the editable payload, offers copy, and includes accessible clipping and contrast feedback. A complete per-element rendering, persistence, reset, and runtime accessibility matrix remains unverified.

## Suggested articles

- [Settings, localization, and narration boundary](settings-localization-and-narration.md)
- [Workspace and search](workspace-and-search.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)
