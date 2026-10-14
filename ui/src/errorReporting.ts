/**
 * Uncaught errors and rejected promises in the window go to the app's error
 * log (Settings > General > Troubleshooting), so they can be attached to a bug report.
 */
const describe = (value: unknown) =>
  value instanceof Error ? value.stack || `${value.name}: ${value.message}` : typeof value === 'string' ? value : String(value);

window.addEventListener('error', (e) => {
  const where = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : '';
  void window.warpApi?.logWrite?.('error', `${describe(e.error ?? e.message)}${where}`).catch(() => {});
});

window.addEventListener('unhandledrejection', (e) => {
  void window.warpApi?.logWrite?.('error', `Unhandled rejection: ${describe(e.reason)}`).catch(() => {});
});

export {};
