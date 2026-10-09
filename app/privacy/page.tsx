import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Just You",
  description: "What Just You collects, how it's stored, who it's shared with, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">
          ← Back to Just You
        </Link>
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last updated October 8, 2026</p>
        <p className="legal-intro">
          Just You is operated by an individual (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;Just You&rdquo;).
          This page explains what the app collects, how it&apos;s stored, who it&apos;s shared with,
          and how to have it deleted. Questions: <a href="mailto:hello@justyou.fyi">hello@justyou.fyi</a>.
        </p>

        <section className="legal-section">
          <h2>What we collect</h2>
          <p>
            Your conversations — the messages you send and the replies you receive, stored so the app can
            remember context between visits instead of starting over every time.
          </p>
          <p>
            A private, anonymous ID, generated on your device when you first open the app. It&apos;s not tied to
            your name, and there&apos;s no public account or password.
          </p>
          <p>
            Optional email addresses, if you choose to give one: for check-in reminders you asked for, and
            separately, the billing email Stripe collects if you subscribe — used to send receipts and let you
            restore your subscription on a new device. Giving an email is never required to use the app.
          </p>
          <p>
            Mood and reflection answers, like how you say you&apos;re arriving or what you say you felt alive
            doing, which the app may draw on later in the same conversation.
          </p>
          <p>
            Commitments you make — the specific next action and date, if you ask the app to track one, so it can
            follow up.
          </p>
          <p>Billing information, if you subscribe, handled entirely by Stripe. We never see or store your card number.</p>
        </section>

        <section className="legal-section">
          <h2>How it&apos;s stored</h2>
          <p>
            Everything is stored in a Postgres database hosted by Neon, encrypted both in transit and at rest.
            There&apos;s no separate login system to break into — your anonymous ID is the only key, generated and
            kept on your own device.
          </p>
        </section>

        <section className="legal-section">
          <h2>Who it&apos;s shared with</h2>
          <p>
            <strong>Anthropic</strong>, to generate the app&apos;s replies. Your conversation is sent to
            Anthropic&apos;s API to produce a response. Anthropic&apos;s API does not train its models on this
            data.
          </p>
          <p>
            <strong>Stripe</strong>, if you subscribe, to process payment. Stripe handles your card details
            directly — they never reach our servers.
          </p>
          <p>
            <strong>Resend</strong>, only if you&apos;ve given an email for reminders or billing, to actually
            deliver that email.
          </p>
          <p>
            That&apos;s the complete list. We don&apos;t sell data, we don&apos;t share it with advertisers, and
            we don&apos;t use it to train any AI model, ours or anyone else&apos;s.
          </p>
        </section>

        <section className="legal-section">
          <h2>Who reads your conversations</h2>
          <p>
            No one. Not us, not a reviewer, not a moderator. Conversations exist only so the app can respond to
            you with real context — they&apos;re never read, audited, or shared with anyone for any other
            purpose.
          </p>
        </section>

        <section className="legal-section">
          <h2>How long we keep it</h2>
          <p>
            Your data stays for as long as your anonymous ID exists — there&apos;s currently no automatic
            deletion after a period of inactivity or after a subscription ends. If you stop using the app or stop
            paying, nothing is automatically removed; it&apos;s retained until you ask us to delete it.
          </p>
        </section>

        <section className="legal-section">
          <h2>Requesting deletion</h2>
          <p>
            Email <a href="mailto:hello@justyou.fyi">hello@justyou.fyi</a> and ask. We&apos;ll delete your
            conversation history and anything tied to your ID, and confirm back to you. There&apos;s no
            self-serve delete button in the app yet.
          </p>
        </section>

        <section className="legal-section">
          <h2>Changes to this policy</h2>
          <p>If this changes in a meaningful way, we&apos;ll update this page and, where it matters, say so in the app.</p>
        </section>

        <div className="legal-cross-links">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/">Back to Just You</Link>
        </div>
      </div>
    </div>
  );
}
