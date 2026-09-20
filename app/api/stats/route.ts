import { NextRequest, NextResponse } from "next/server";
import { getSignals } from "@/lib/db";

// Minimal signals, nothing more: whether people come back, and what
// happens to the actions they commit to. Aggregate counts only -- no
// per-user detail. Set STATS_SECRET to require a ?key= to view this;
// without it, the endpoint is open (it exposes counts, not identities).
export async function GET(req: NextRequest) {
  const secret = process.env.STATS_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const signals = await getSignals();
  return NextResponse.json(signals);
}
