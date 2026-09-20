import { NextRequest, NextResponse } from "next/server";
import {
  getDistinctActiveDays,
  getMirrorLine,
  getResolvedCommitments,
  getUserStage,
  saveMirrorLine,
} from "@/lib/db";
import { generateMirrorLine } from "@/lib/anthropic";

const MIN_ACTIVE_DAYS = 3;
const REGENERATE_AFTER_DAYS = 7;

// Weekly mirror line: one earned sentence, in the destiny-mirror voice,
// about who this person is becoming -- shown once someone has a real
// pattern of resolved commitments behind them, refreshed at most weekly.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const [activeDays, resolved, existing, stage] = await Promise.all([
    getDistinctActiveDays(userId),
    getResolvedCommitments(userId),
    getMirrorLine(userId),
    getUserStage(userId),
  ]);

  if (activeDays < MIN_ACTIVE_DAYS || resolved.length === 0) {
    return NextResponse.json({ line: null });
  }

  if (existing) {
    const ageDays = (Date.now() - new Date(existing.generated_at).getTime()) / 86400000;
    if (ageDays < REGENERATE_AFTER_DAYS) {
      return NextResponse.json({ line: existing.line });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // No key configured -- fall back to the cached line if there is one,
    // otherwise just skip it rather than error the whole page.
    return NextResponse.json({ line: existing?.line ?? null });
  }

  try {
    const line = await generateMirrorLine(stage, resolved);
    if (!line) return NextResponse.json({ line: existing?.line ?? null });
    await saveMirrorLine(userId, line);
    return NextResponse.json({ line });
  } catch (err) {
    console.error("mirror line error", err);
    return NextResponse.json({ line: existing?.line ?? null });
  }
}
