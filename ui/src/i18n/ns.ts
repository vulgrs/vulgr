/**
 * Declares one translation namespace. The Turkish table must have exactly the
 * English table's shape, so a missing or mistyped key fails the type-check.
 * Use functions for interpolated strings, e.g. `panes: (n: number) => `${n} panes``.
 */
export function ns<T>(en: T, tr: NoInfer<T>): { en: T; tr: T } {
  return { en, tr };
}
