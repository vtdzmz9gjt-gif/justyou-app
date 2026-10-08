import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { ensureUser } from "@/lib/db";

// Creates a Stripe Checkout Session for the $9.99/month subscription and
// hands back its hosted URL -- the client just redirects the browser there.
// Stripe Checkout collects the billing email itself (subscription mode
// defaults to requiring it); webhooks (Stage 2) are what actually grant
// access once payment completes, this route only starts that process.
export async function POST(req: NextRequest) {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "Subscriptions are not configured yet." }, { status: 503 });
  }

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

  await ensureUser(userId);

  const origin = req.nextUrl.origin;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
      success_url: `${origin}/?subscribed=1`,
      cancel_url: `${origin}/?subscribed=0`,
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${origin}/terms) and [Privacy Policy](${origin}/privacy).`,
        },
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout session creation failed", err);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
