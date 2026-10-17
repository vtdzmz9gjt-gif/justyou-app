import { NextResponse } from "next/server";

// Lets a client detect "I'm running an old build" and reload itself --
// see app/layout.tsx's build-sha meta tag (embedded at build time) and
// page.tsx's visibility-change check (compares the two, reloads on
// mismatch). Deliberately never cached: this has to reflect whichever
// deployment is actually live right now, not whatever was live when some
// edge node last cached a response.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
