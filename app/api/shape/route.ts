import { NextRequest, NextResponse } from "next/server";
import { getUserStage } from "@/lib/db";

// Returns a person's current stage so the client can restore the ambient
// glow color on a fresh page load, since signal_depth only fires once per
// stage and won't re-fire on later visits to re-tell the client what's
// already stored.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const stage = await getUserStage(userId);
  return NextResponse.json({ stage: stage ?? null });
}
