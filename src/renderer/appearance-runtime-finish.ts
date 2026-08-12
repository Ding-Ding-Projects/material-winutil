/* Expose only the pure colour operations, then remove the CommonJS shim. */
interface AppearanceRuntimeExports {
  convertColor?: unknown;
  contrastRatio?: unknown;
}

const appearanceRuntimeWindow = window as unknown as {
  exports?: AppearanceRuntimeExports;
  appearanceColor?: Readonly<{ convertColor: unknown; contrastRatio: unknown }>;
};
const appearanceRuntimeExports = appearanceRuntimeWindow.exports;
if (typeof appearanceRuntimeExports?.convertColor !== 'function' || typeof appearanceRuntimeExports.contrastRatio !== 'function') {
  throw new Error('The bundled appearance colour runtime is unavailable.');
}
appearanceRuntimeWindow.appearanceColor = Object.freeze({
  convertColor: appearanceRuntimeExports.convertColor,
  contrastRatio: appearanceRuntimeExports.contrastRatio,
});
// The CommonJS module's exported functions resolve `exports` at call time, so it must
// remain available after loading. Freeze it rather than leaving a mutable global seam.
Object.freeze(appearanceRuntimeExports);
