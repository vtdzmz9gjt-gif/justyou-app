import { NextRequest, NextResponse } from "next/server";
import { consumeRestoreToken } from "@/lib/db";

// Consumes a restore-link token and hands back the real userId to swap
// into the client's localStorage. One-shot: a token can only ever succeed
// once, whether that's this call or a retry after a network hiccup, so a
// failed/expired token just means the client falls back to whatever local
// id it already had.
export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { token } = body;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const result = await consumeRestoreToken(token);
  if (!result) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  return NextResponse.json({ userId: result.userId });
}
