import { NextRequest, NextResponse } from "next/server";
import { getUserShape, getUserStage } from "@/lib/db";

// Returns a person's current shape family + stage so the client can
// restore the persistent artwork on a fresh page load, since the
// assign_shape_family / signal_depth tools each only fire once and won't
// re-fire on later visits to re-tell the client what's already stored.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const [family, stage] = await Promise.all([getUserShape(userId), getUserStage(userId)]);
  return NextResponse.json({ family: family ?? null, stage: stage ?? null });
}
