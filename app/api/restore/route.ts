import { NextRequest, NextResponse } from "next/server";
import { issueRestoreToken } from "@/lib/db";
import crypto from "crypto";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If that email has an active subscription, we've sent a link to restore it.",
};

// Requests a magic link to restore a subscription on a new device/browser.
// Always returns the same generic response whether or not the email
// matches an active subscriber -- a plain "does this email have a
// subscription" lookup would let anyone who knows or guesses a billing
// email confirm someone is a subscriber, which is more than this should
// reveal.
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email } = body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }
  const billingEmail = email.trim();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // No email configured -- nothing this endpoint can actually do. Still
    // answer generically rather than revealing that emailing is disabled.
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  try {
    const issued = await issueRestoreToken(billingEmail, token, expiresAt);
    if (issued) {
      const origin = req.nextUrl.origin;
      const restoreUrl = `${origin}/?restore_token=${token}`;
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);
      const fromEmail = process.env.FROM_EMAIL || "Just You <onboarding@resend.dev>";
      await resend.emails.send({
        from: fromEmail,
        to: billingEmail,
        subject: "Restore your Just You subscription",
        text: `Open this link on your new device to restore your subscription and conversation history:\n\n${restoreUrl}\n\nThis link expires in 15 minutes and works once. If you didn't request this, you can ignore it.`,
      });
    }
  } catch (err) {
    console.error("restore token issue/email failed", err);
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
