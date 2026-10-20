// Pure selection logic for a bounded in-browser failover.
// A failed media URL is not assumed to be unlicensed or permanently dead.
export const MAX_AUTOMATIC_BACKUPS = 2;
export function nextFallbackIndex(streams, selected, attempted, retries, limit = MAX_AUTOMATIC_BACKUPS) {
  if (!Array.isArray(streams) || streams.length < 2 ||
      !Number.isInteger(selected) || selected < 0 || selected >= streams.length ||
      !Number.isInteger(retries) || retries < 0 || retries >= limit) return -1;
  const tried = attempted instanceof Set ? attempted : new Set(attempted || []);
  for (let offset = 1; offset < streams.length; offset++) {
    const next = (selected + offset) % streams.length;
    if (!tried.has(next)) return next;
  }
  return -1;
}
