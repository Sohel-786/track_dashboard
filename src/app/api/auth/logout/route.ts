import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { ok } from "@/lib/api-helpers";

export async function POST() {
  const response = ok({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
