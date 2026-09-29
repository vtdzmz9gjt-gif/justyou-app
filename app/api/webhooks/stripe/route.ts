import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { setStripeSubscription, updateSubscriptionPeriod } from "@/lib/db";

// The one place in this app that trusts an unauthenticated POST -- so
// signature verification against the raw body is not optional. Stripe
// retries delivery on anything but a 2xx, and every write below is a plain
// keyed UPDATE, so a duplicate delivery just re-applies the same value.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires once, right after a Checkout Session completes -- this is
      // where a subscriber's stripe_* columns and subscribed_until are
      // populated for the first time.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const billingEmail = session.customer_details?.email;
        if (!userId || !customerId || !subscriptionId || !billingEmail) {
          console.error("checkout.session.completed missing a required field", {
            hasUserId: !!userId,
            hasCustomerId: !!customerId,
            hasSubscriptionId: !!subscriptionId,
            hasBillingEmail: !!billingEmail,
          });
          break;
        }
        // The session itself doesn't carry the billing period -- only the
        // subscription object does, per item since Stripe moved
        // current_period_end off the subscription and onto each item.
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const periodEnd = subscription.items.data[0]?.current_period_end;
        if (!periodEnd) {
          console.error("checkout.session.completed: subscription has no current_period_end", subscriptionId);
          break;
        }
        await setStripeSubscription(userId, customerId, subscriptionId, billingEmail, new Date(periodEnd * 1000));
        break;
      }

      // Fires on every renewal, plan change, and Stripe's own dunning
      // retries after a failed payment -- keeping subscribed_until synced
      // to current_period_end here is what makes cancellation (access
      // holds through the already-paid period) and a failed renewal
      // (access just lapses, no grace period) both work with no extra
      // code: subscribed_until simply stops advancing.
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const periodEnd = subscription.items.data[0]?.current_period_end;
        if (!periodEnd) {
          console.error("customer.subscription.updated: no current_period_end", subscription.id);
          break;
        }
        await updateSubscriptionPeriod(subscription.id, new Date(periodEnd * 1000));
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`stripe webhook handler failed for ${event.type}`, err);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
