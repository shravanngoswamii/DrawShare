// A snapshot share link carries a large, private payload that must never reach
// the server: the full page contents. The app routes on clean history-mode
// paths, so that payload rides in the URL fragment (after #), which browsers
// never send to a server. Everything else is a plain path. These helpers build
// and read the fragment payload.

const BASE = import.meta.env.BASE_URL;

// Absolute app URL for `routePath` (no leading slash, e.g. "s" or "v/ABCD"),
// with an optional payload encoded into the fragment.
export function buildShareUrl(routePath: string, fragment?: Record<string, string>): string {
  let url = window.location.origin + BASE + routePath.replace(/^\//, "");
  if (fragment && Object.keys(fragment).length > 0) {
    url += `#${new URLSearchParams(fragment).toString()}`;
  }
  return url;
}

// Read one payload value from a route hash like "#d=...". Returns "" if absent.
export function readFragmentParam(hash: string, name: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get(name) ?? "";
}
