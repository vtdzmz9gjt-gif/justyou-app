import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Vercel's edge network tags every request with the visitor's country.
// Stash it in a cookie so the client can use it as a language fallback
// when the browser's own language setting isn't one we support — see
// COUNTRY_TO_LANG in app/page.tsx. Browser language always takes
// priority over this; it's only consulted as a second guess.
export function proxy(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  const response = NextResponse.next();
  if (country) {
    response.cookies.set("visitor_country", country, {
      path: "/",
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: "/",
};
