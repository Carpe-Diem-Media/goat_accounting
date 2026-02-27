<script lang="ts">
  const socialProof = [
    {
      quote:
        "We aligned my retirement structure and tax plan in one roadmap. The strategy now feels joined-up instead of fragmented.",
      person: "Executive Client",
      context: "Wealth + Tax",
    },
    {
      quote:
        "Our monthly accounts and financial statements are finally decision-ready, and my personal planning improved at the same time.",
      person: "SME Owner",
      context: "Accounting + Advisory",
    },
    {
      quote:
        "I came for tax support and stayed for the full planning model. Everything now works together.",
      person: "Professional Client",
      context: "Tax Consulting + Wealth Planning",
    },
  ] as const;

  const faqs = [
    {
      question: "Can I use only one service pillar?",
      answer:
        "Yes. You can start with wealth planning, tax consulting, or accounting, then scale into a full integrated strategy when ready.",
    },
    {
      question: "How are these services connected in practice?",
      answer:
        "Every recommendation is reviewed for planning impact, tax impact, and reporting impact so decisions reinforce each other.",
    },
    {
      question: "Do you support both salaried professionals and business owners?",
      answer:
        "Yes. Engagements are tailored for personal portfolios, family goals, and owner-managed business requirements.",
    },
  ] as const;

</script>

<svelte:head>
  <title>Financial, Tax & Accounting Services | Rossouw Briers</title>
  <meta
    name="description"
    content="Expert wealth management, tax optimization, and professional accounting services. Secure your future and optimize your business with a unified financial strategy."
  />
  <link rel="canonical" href="https://goataccounting.co.za/services" />
  <meta property="og:title" content="Financial, Tax & Accounting Services | Rossouw Briers" />
  <meta
    property="og:description"
    content="Expert wealth management, tax optimization, and professional accounting services with a unified strategy."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://goataccounting.co.za/services" />
  <meta property="og:image" content="https://goataccounting.co.za/og-default.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Financial, Tax & Accounting Services | Rossouw Briers" />
  <meta
    name="twitter:description"
    content="Expert wealth management, tax optimization, and professional accounting services with a unified strategy."
  />
  <meta name="twitter:image" content="https://goataccounting.co.za/og-default.svg" />
  
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          "serviceType": "Wealth Management & Financial Advisory",
          "provider": { "@id": "https://goataccounting.co.za/#organization" },
          "description": "Retirement annuities, life cover, and long-term investment strategies backed by Liberty."
        },
        {
          "@type": "Service",
          "serviceType": "Tax Consulting",
          "provider": { "@id": "https://goataccounting.co.za/#organization" },
          "description": "Strategic tax planning and SARS compliance for individuals and businesses."
        },
        {
          "@type": "Service",
          "serviceType": "Financial Accounting",
          "provider": { "@id": "https://goataccounting.co.za/#organization" },
          "description": "Full-suite accounting including financial statements and management accounts."
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Why do I need both a financial advisor and a tax consultant?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Most wealth strategies have tax implications. By using a professional who handles both, you ensure your investments are structured to minimize your tax burden legally and efficiently."
              }
            },
            {
              "@type": "Question",
              "name": "What accounting services do you offer for businesses?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Through Goat Accounting, I provide drafting of annual financial statements, monthly management accounts, and complete corporate tax compliance."
              }
            }
          ]
        }
      ]
    }
  </script>
</svelte:head>

<section class="border-b border-border/70 py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <p class="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      Rossouw Briers Services
    </p>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
      Comprehensive Financial Services: Wealth, Tax, & Accounting.
    </h1>
    <p class="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
      If you are searching for a Liberty Financial Advisor, a Specialist Tax Consultant, or a
      Financial Accountant for your business, this is your one-stop advisory partner.
    </p>
  </div>
</section>

<section class="py-16 sm:py-20">
  <div class="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-3">
    <article class="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Service Pillar 1</p>
      <h2 class="mt-3 font-display text-2xl font-semibold tracking-tight">
        Financial Advisor & Wealth Management
      </h2>
      <p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Secure your family’s future and grow your portfolio with confidence. As an advisor with
        Liberty and the Kainos Group, I provide tailored advice on retirement annuities, life
        cover, income protection, and long-term investment strategies. I don't just sell policies;
        I build resilient financial architectures.
      </p>
      <a
        href="/booking"
        class="mt-6 inline-flex w-fit items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
      >
        Discuss Wealth & Risk Cover
      </a>
    </article>

    <article class="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Service Pillar 2</p>
      <h2 class="mt-3 font-display text-2xl font-semibold tracking-tight">Specialist Tax Consultant</h2>
      <p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Don't pay a cent more than you legally owe. Leveraging my role at Goat Accounting, I
        provide strategic tax planning for individuals and businesses. I ensure your wealth-building
        strategies are highly tax-efficient, managing your SARS compliance seamlessly so you can
        focus on growth.
      </p>
      <a
        href="/booking"
        class="mt-6 inline-flex w-fit items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
      >
        Optimize My Tax
      </a>
    </article>

    <article class="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Service Pillar 3</p>
      <h2 class="mt-3 font-display text-2xl font-semibold tracking-tight">
        Financial Accountant & Business Services
      </h2>
      <p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Solid wealth is built on solid numbers. Armed with a Finance degree from NWU and years of
        practical experience at an established accounting firm, I handle full-suite financial
        accounting. From accurate financial statements to monthly management accounts, I give
        business owners the clarity they need to scale.
      </p>
      <a
        href="/booking"
        class="mt-6 inline-flex w-fit items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
      >
        Handle My Accounting
      </a>
    </article>
  </div>
</section>

<section class="border-y border-border/70 bg-card/30 py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Client Outcomes</h2>
    <div class="mt-8 grid gap-4 md:grid-cols-3">
      {#each socialProof as item}
        <article class="rounded-xl border border-border/70 bg-background p-5">
          <p class="text-sm leading-relaxed text-foreground/90">"{item.quote}"</p>
          <p class="mt-4 text-sm font-semibold">{item.person}</p>
          <p class="text-xs text-muted-foreground">{item.context}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Frequently Asked Questions</h2>
    <div class="mt-8 space-y-3">
      {#each faqs as item}
        <details class="rounded-xl border border-border/70 bg-card px-5 py-4">
          <summary class="cursor-pointer list-none text-sm font-semibold text-foreground">
            {item.question}
          </summary>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<section class="border-t border-border/70 bg-card/40 py-14 sm:py-16">
  <div class="mx-auto max-w-6xl px-4 text-center sm:px-6">
    <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
      One Advisor. One Strategy. One Complete Financial View.
    </h2>
    <p class="mx-auto mt-4 max-w-3xl text-base text-muted-foreground">
      Rossouw Briers combines wealth planning, tax efficiency, and accounting clarity so each
      financial decision supports your full picture, not just one product or one tax year.
    </p>
    <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <a
        href="/booking"
        class="inline-flex items-center rounded-md bg-brand px-6 py-3 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
      >
        Book a Free Discovery Call
      </a>
      <a
        href="/about"
        class="inline-flex items-center rounded-md border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent/30"
      >
        View Credentials & Background
      </a>
    </div>
  </div>
</section>
