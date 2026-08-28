/** Where a signed-in user lands when no explicit destination was requested. */
export const HOME_PATH = "/namaz";

/** Analytics for daily category entries — no longer the landing page. */
export const DASHBOARD_PATH = "/dashboard";

/** Only same-origin app paths may be used as a post-login redirect target. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return HOME_PATH;
  // Reject absolute URLs and protocol-relative "//evil.com" redirects.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return HOME_PATH;
  }
  return next;
}
