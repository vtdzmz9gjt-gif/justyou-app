import { NextRequest, NextResponse } from "next/server";
import { getDueReminders, markReminderSent } from "@/lib/db";

// Call this once a day from an external scheduler (Vercel Cron, a GitHub
// Action, cron-job.org — anything that can hit a URL on a schedule) to send
// the spec's "day before" proactive nudge by email. It's optional: without
// RESEND_API_KEY configured, the app still works fine on the pull model —
// the AI raises an overdue commitment itself the next time someone opens
// the chat.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "Just You <onboarding@resend.dev>";
  const due = await getDueReminders();

  if (!resendKey) {
    return NextResponse.json({
      sent: 0,
      skipped: due.length,
      note: "RESEND_API_KEY not set — reminders are not being emailed. This is fine; the app falls back to raising it in-chat.",
    });
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);

  let sent = 0;
  for (const commitment of due) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: commitment.email,
        subject: "Still doing the thing?",
        text: `${commitment.action}\n\nThat was the plan. Open Just You when you're ready.`,
      });
      await markReminderSent(commitment.id);
      sent++;
    } catch (err) {
      console.error("reminder email failed", commitment.id, err);
    }
  }

  return NextResponse.json({ sent, total_due: due.length });
}
