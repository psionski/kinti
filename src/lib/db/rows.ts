/**
 * Returns the single row from a Drizzle `.returning().all()` / `.all()` result
 * that is guaranteed by construction to contain exactly one row — an insert,
 * an update by primary key, or an aggregate (e.g. `count(*)`).
 *
 * With `noUncheckedIndexedAccess` enabled, indexing such a result yields
 * `T | undefined`. This helper resolves that to `T`, throwing instead of
 * silently propagating `undefined` if the driver ever returns no rows.
 */
export function requireRow<T>(rows: readonly T[], entity = "row"): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected exactly one ${entity}, but the query returned none`);
  }
  return row;
}
