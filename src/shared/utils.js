/**
 * Shared pure helpers.
 */

// Threads usernames are validated upstream to /^[a-zA-Z0-9_.]+$/ — only `.` is
// a regex metachar, so this handles it deterministically. Kept as a helper
// (rather than a hard-coded pattern) so future format changes don't silently
// re-open injection.
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Coalesce calls into one `fn()` per animation frame.
 * @returns {{schedule: () => void, cancel: () => void}}
 */
export function rafThrottle(fn) {
  let frame = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        fn();
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
