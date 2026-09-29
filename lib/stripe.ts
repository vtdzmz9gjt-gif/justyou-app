import Stripe from "stripe";

// Constructed lazily, not at module scope -- Stripe's SDK throws immediately
// if no key is passed, and this module gets imported (though not called)
// during the production build before STRIPE_SECRET_KEY is necessarily set.
let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set.");
    }
    stripe = new Stripe(key);
  }
  return stripe;
}
