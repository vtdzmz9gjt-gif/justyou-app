import { NextRequest, NextResponse } from "next/server";
import { getDueReminders, markReminderSent, getDueCheckIns, markCheckInSent } from "@/lib/db";

// Call this every 15 minutes from an external scheduler (Vercel Cron, a
// GitHub Action, cron-job.org — anything that can hit a URL on a schedule).
// Two independent things happen here, both optional -- without
// RESEND_API_KEY configured, the app still works fine on the pull model,
// the AI raises anything overdue itself the next time someone opens chat:
//   1. The spec's "day before" proactive nudge for a commitment coming due.
//   2. A person's own chosen check-in time, if they set one -- a warm,
//      low-pressure "good time to talk?" that also names the week ahead.
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
  const [due, dueCheckIns] = await Promise.all([getDueReminders(), getDueCheckIns()]);

  if (!resendKey) {
    return NextResponse.json({
      sentReminders: 0,
      sentCheckIns: 0,
      skipped: due.length + dueCheckIns.length,
      note: "RESEND_API_KEY not set — reminders are not being emailed. This is fine; the app falls back to raising it in-chat.",
    });
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);

  let sentReminders = 0;
  for (const commitment of due) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: commitment.email,
        subject: "Still doing the thing?",
        text: `${commitment.action}\n\nThat was the plan. Open Just You when you're ready.`,
      });
      await markReminderSent(commitment.id);
      sentReminders++;
    } catch (err) {
      console.error("reminder email failed", commitment.id, err);
    }
  }

  let sentCheckIns = 0;
  for (const person of dueCheckIns) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: person.email,
        subject: "This is usually your time",
        text: "No pressure, just a nudge. What's one real thing on your mind this week? Open Just You when you're ready.",
      });
      await markCheckInSent(person.id, person.local_date);
      sentCheckIns++;
    } catch (err) {
      console.error("check-in email failed", person.id, err);
    }
  }

  return NextResponse.json({
    sentReminders,
    totalDueReminders: due.length,
    sentCheckIns,
    totalDueCheckIns: dueCheckIns.length,
  });
}
