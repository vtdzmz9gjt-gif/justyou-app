import { NextRequest, NextResponse } from "next/server";
import { ensureUser, getTreeState, claimNewConnection } from "@/lib/db";
import { getTensionInsights } from "@/lib/anthropic";

// Returns the Tree of Life's current state -- one entry per sephirah that
// has ever been genuinely tagged, tier derived fresh from the full tag
// history each time (never a stored counter). Cross-session by design:
// unlike the elemental tally, nothing here is scoped to a boundary.
//
// Also claims at most one newly-lit path per request, if there is one --
// a quiet, one-time "you're starting to see how X and Y connect" fact the
// client can choose to say once and never again -- and returns any
// tension-pair insights that qualify, generating one the first time a
// pair becomes imbalanced and simply reusing the stored wording after.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const lang = req.nextUrl.searchParams.get("lang");
  await ensureUser(userId);
  const state = await getTreeState(userId);
  const newConnection = await claimNewConnection(userId, state);
  const tensionInsights = await getTensionInsights(userId, state, lang);
  return NextResponse.json({ state, newConnection, tensionInsights });
}
