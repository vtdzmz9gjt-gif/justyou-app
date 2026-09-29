import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUser } from "@/lib/db";

// Creates a Stripe Billing Portal session so a subscriber can update their
// payment method or cancel -- Stripe's own hosted UI handles all of that,
// nothing here needs to reimplement it.
export async function POST(req: NextRequest) {
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const user = await getUser(userId);
  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription found." }, { status: 404 });
  }

  const origin = req.nextUrl.origin;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${origin}/`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("billing portal session creation failed", err);
    return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
  }
}
