import { NextRequest, NextResponse } from "next/server";
import { getNodeReflection } from "@/lib/anthropic";

// "Your pattern" -- fetched lazily, only when a person actually opens a
// specific node's detail panel, not for every touched node on every
// /api/tree or /api/family load. getNodeReflection handles the caching:
// an unchanged tag count since the last generation returns the stored
// reflection instantly, no model call.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const system = req.nextUrl.searchParams.get("system");
  const node = req.nextUrl.searchParams.get("node");
  const lang = req.nextUrl.searchParams.get("lang");

  if (!userId || (system !== "tree" && system !== "family") || !node) {
    return NextResponse.json({ error: "Missing or invalid userId, system, or node." }, { status: 400 });
  }

  const reflection = await getNodeReflection(userId, system, node, lang);
  return NextResponse.json({ reflection });
}
