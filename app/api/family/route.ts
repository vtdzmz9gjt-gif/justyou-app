import { NextRequest, NextResponse } from "next/server";
import { ensureUser, getFamilyState } from "@/lib/db";

// Returns the Family Constellation's current state -- one entry per theme
// that's ever been genuinely traced to a parent, tier derived fresh from
// the full tag history each time (never a stored counter), same as
// /api/tree. No path-lighting, tension pairs, or milestone yet -- those
// come in later stages.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  await ensureUser(userId);
  const state = await getFamilyState(userId);
  return NextResponse.json({ state });
}
