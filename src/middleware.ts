import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { HOME_PATH } from "@/lib/routes";

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js"];

/** Unauthenticated API endpoints. Everything else under /api needs a session. */
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  /** Cron-triggered; guarded by its own shared-secret check. */
  "/api/notifications/run",
];

/** Headers the app derives from the verified session — never from the client. */
const SESSION_HEADERS = ["x-user-id", "x-user-role", "x-user-name"];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon-512.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/icon.svg" ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$/i.test(pathname)
  );
}

/**
 * Reject cross-site state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already stops cross-site form POSTs
 * from carrying it. This is the second lock: a request that declares a foreign
 * origin never reaches a route handler, whatever the browser decided to send.
 */
function isCrossSiteWrite(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false;

  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "cross-site";

  // Older clients: fall back to comparing Origin against the request host.
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  // Strip any client-sent identity headers before anything downstream reads them.
  const requestHeaders = new Headers(request.headers);
  for (const header of SESSION_HEADERS) requestHeaders.delete(header);

  const pass = () =>
    withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));

  if (isCrossSiteWrite(request)) {
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, message: "Cross-site request blocked" },
        { status: 403 }
      )
    );
  }

  if (PUBLIC_API_PATHS.includes(pathname)) {
    return pass();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/login") {
    if (session) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL(HOME_PATH, request.url))
      );
    }
    return pass();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return pass();
  }

  if (pathname.startsWith("/api/")) {
    if (!session) {
      return withSecurityHeaders(
        NextResponse.json(
          { success: false, message: "Unauthorized" },
          { status: 401 }
        )
      );
    }
    requestHeaders.set("x-user-id", session.sub);
    requestHeaders.set("x-user-role", session.role);
    requestHeaders.set("x-user-name", session.username);
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } })
    );
  }

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  /**
   * Redirect the root here rather than from the page component: a server
   * `redirect()` in a prerendered route answers 200 with the redirect encoded
   * in the RSC payload, so a cold document load would paint an empty page
   * first. A 307 from middleware is instant and works without JavaScript.
   */
  if (pathname === "/") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(HOME_PATH, request.url))
    );
  }

  if (pathname.startsWith("/users") && session.role !== "admin") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(HOME_PATH, request.url))
    );
  }

  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
