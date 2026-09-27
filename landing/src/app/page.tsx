import { EarlyAccessForm } from "@/components/EarlyAccessForm";
import { Logo } from "@/components/Logo";
import { ProductPreview } from "@/components/ProductPreview";

const steps = [
  {
    title: "Your invoices",
    body: "Bring in your open invoices, due dates and payment history.",
  },
  {
    title: "CashPilot identifies what needs attention",
    body: "Accounts are prioritised by amount, days overdue and how the client has paid before, not just by age.",
  },
  {
    title: "AI understands the situation",
    body: "Past reminders, replies, partial payments, promises to pay and open disputes are read together, so you see what’s actually going on.",
  },
  {
    title: "Drafts the right follow-up",
    body: "A professional email that fits the situation. A missed promise, a disputed line item and a slow payer each need a different message.",
  },
  {
    title: "You approve",
    body: "Review every draft. Edit it, approve it or skip it. Nothing is sent without you.",
    highlight: true,
  },
  {
    title: "Get paid",
    body: "Promises, disputes and payments are tracked, so you always know what happens next on each account.",
  },
];

const audiences = [
  "Marketing agencies",
  "Creative studios",
  "Software agencies",
  "Consultancies",
  "Professional services",
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="container header-inner">
          <a href="#top" className="brand" aria-label="CashPilot home">
            <Logo />
            <span>CashPilot</span>
          </a>
          <nav aria-label="Primary" className="nav">
            <a href="#how-it-works">How it works</a>
            <a href="#who-its-for">Who it&rsquo;s for</a>
            <a href="#approval">Human approval</a>
          </nav>
          <a href="#early-access" className="button button-small">
            <span className="label-full">Request Early Access</span>
            <span className="label-short">Early access</span>
          </a>
        </div>
      </header>

      <main id="main">
        {/* 1. Hero */}
        <section className="hero" id="top">
          <div className="container">
            <p className="eyebrow">Accounts receivable for B2B agencies</p>
            <h1>
              Get paid faster.
              <br />
              <span className="muted">Without chasing clients all day.</span>
            </h1>
            <p className="lede">
              CashPilot helps agencies identify overdue invoices that need
              attention, understand what&rsquo;s happening, and send thoughtful{" "}
              <span className="nowrap">follow-ups</span> — without damaging client
              relationships.
            </p>
            <div className="hero-actions">
              <a href="#early-access" className="button button-primary">
                Request Early Access
              </a>
              <a href="#how-it-works" className="button button-ghost">
                See how it works
              </a>
            </div>
            <p className="hero-note">
              In early development. We&rsquo;re talking with agency owners to
              shape it.
            </p>
          </div>
        </section>

        {/* 2. Problem */}
        <section className="section" aria-labelledby="problem-heading">
          <div className="container split">
            <div>
              <p className="eyebrow">The problem</p>
              <h2 id="problem-heading">
                Overdue invoices shouldn&rsquo;t require a founder to spend Friday
                afternoon sending awkward emails.
              </h2>
            </div>
            <ul className="points">
              <li>
                <h3>It&rsquo;s hard to know what needs attention.</h3>
                <p>
                  An aging report lists every late invoice. It doesn&rsquo;t tell
                  you which client is waiting on a PO, which one promised to pay
                  last week, and which has gone quiet.
                </p>
              </li>
              <li>
                <h3>Every follow-up is a judgment call.</h3>
                <p>
                  Too soft and you wait another month. Too blunt and you strain a
                  relationship you&rsquo;ve spent years building.
                </p>
              </li>
              <li>
                <h3>It usually lands on the founder.</h3>
                <p>
                  Small agencies rarely have a finance team. Collections falls to
                  whoever owns the client relationship, often the person with the
                  least time.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* 3. How it works */}
        <section className="section" id="how-it-works" aria-labelledby="how-heading">
          <div className="container">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading">From overdue invoice to paid, with you in control.</h2>
            <ol className="steps">
              {steps.map((step, i) => (
                <li key={step.title} className={step.highlight ? "is-highlight" : undefined}>
                  <span className="step-num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Product preview */}
        <section className="section section-tinted" aria-labelledby="preview-heading">
          <div className="container">
            <p className="eyebrow">Product preview</p>
            <h2 id="preview-heading">One queue. The context behind each invoice. A draft ready for review.</h2>
            <figure className="preview">
              <ProductPreview />
              <figcaption>
                Illustrative preview with sample data. The interface is in active
                development and will change.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 5. Who it's for */}
        <section className="section" id="who-its-for" aria-labelledby="who-heading">
          <div className="container split">
            <div>
              <p className="eyebrow">Who it&rsquo;s for</p>
              <h2 id="who-heading">Small B2B service businesses that invoice clients directly.</h2>
            </div>
            <div>
              <ul className="audience">
                {audiences.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="body">
                Especially teams without a dedicated finance function, where
                follow-ups are handled by founders, account leads or an operations
                manager alongside everything else.
              </p>
              <p className="body subtle">
                Probably not a fit if you&rsquo;re high-volume B2C, or you already
                run a collections team with its own tooling.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Relationship-safe */}
        <section className="section section-dark" id="approval" aria-labelledby="approval-heading">
          <div className="container">
            <p className="eyebrow">Relationship-safe by design</p>
            <h2 id="approval-heading">CashPilot drafts. You decide.</h2>
            <div className="principles">
              <div>
                <h3>Human approval before anything is sent.</h3>
                <p>
                  Every follow-up waits for your review. You can edit, approve or
                  skip it. CashPilot doesn&rsquo;t email your clients on its own.
                </p>
              </div>
              <div>
                <h3>Your customer data stays separated by workspace.</h3>
                <p>
                  Each business&rsquo;s invoices, contacts and history live in its
                  own workspace, kept apart from every other account.
                </p>
              </div>
              <div>
                <h3>Built for relationship-safe collections.</h3>
                <p>
                  Drafts are written to keep the conversation professional and the
                  relationship intact. Firm when it needs to be, never aggressive.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Early access */}
        <section className="section" id="early-access" aria-labelledby="access-heading">
          <div className="container split split-form">
            <div>
              <p className="eyebrow">Early access</p>
              <h2 id="access-heading">Talk to us about your overdue invoices.</h2>
              <p className="body">
                We&rsquo;re opening CashPilot to a small group of agencies first.
                Tell us a little about your situation and we&rsquo;ll follow up to
                learn how you handle receivables today.
              </p>
            </div>
            <EarlyAccessForm />
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="brand brand-footer">
            <Logo />
            <span>CashPilot</span>
          </div>
          <p>Relationship-safe accounts receivable for B2B agencies.</p>
          <nav aria-label="Footer" className="footer-nav">
            <a href="#how-it-works">How it works</a>
            <a href="#early-access">Early access</a>
          </nav>
          <p className="footer-legal">© {new Date().getFullYear()} CashPilot</p>
        </div>
      </footer>
    </>
  );
}
