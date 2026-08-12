# Appearance controls

Global appearance preferences work and persist. The broader per-element editor is a partial surface and must not be described as a complete theme engine.

## Behavior

The Settings destination applies light or dark theme, comfortable or compact density, accent, font family, font scale, font weight, corner radius, and reduced motion. Tab docking supports left, right, top, and bottom and persists with the workspace.

The color picker provides hue, saturation, and lightness controls, native full-spectrum selection, HEX input, preset starting points, recent colors, a live preview, and HEX copy. Selection and profile colors have visible effects.

Context menus and toolbar actions can open a per-element editor showing accent, font, radius, scale, and weight. Applying the editor to the application root updates the global persisted preferences.

## Configuration

Validated global preferences are stored in the application user-data directory. The font selector currently offers a small fixed list; it does not enumerate all installed fonts. Named-theme storage is visibly disabled.

## Current boundary

Non-root element overrides exist only in renderer memory and the rendering path does not yet consume them consistently. An **Appearance applied and persisted** message for such a target must not be interpreted as proof that the target changed or survived restart.

The editor does not provide word-processor-depth typography, every element and pseudo-state, named presets, import/export, property locks, self-theming picker chrome, or the required bidirectional color translators for RGB, HSL, HSV, HWB, Lab/LCH, OKLab/OKLCH, CMYK, and alpha.

## Failure modes

- Invalid persisted global preferences fall back to shipped defaults.
- Reset element removes the in-memory override but cannot restore a property that was never rendered.
- Unsupported named-theme storage remains disabled instead of pretending to save.
- A non-root editor can show controls without producing a durable visual change; this is a known implementation boundary.

## Security considerations

Appearance values are bounded before main-process persistence. Font strings reject control characters and excessive length. No remote font, stylesheet, or theme asset is fetched by these controls.

## Verification

Preference contracts and smoke states cover the main theme, density, dock, and selected scale/language combinations. A complete per-element rendering, persistence, reset, color-space, and accessibility matrix remains unverified.

## Suggested articles

- [Settings, localization, and narration boundary](settings-localization-and-narration.md)
- [Workspace and search](workspace-and-search.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)

