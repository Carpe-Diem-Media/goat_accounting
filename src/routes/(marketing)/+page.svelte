<script lang="ts">
  const trustBar = ["Liberty", "Kainos Group", "Goat Accounting", "NWU Potchefstroom Alumni"] as const;

  const socialProof = [
    {
      quote:
        "Rossouw helped me restructure both investments and tax planning in one strategy. I finally feel in control.",
      person: "Private Client",
      context: "Wealth + Tax Strategy",
    },
    {
      quote:
        "As a business owner, getting accounting clarity and personal planning from one advisor saved me serious time.",
      person: "Business Owner",
      context: "Accounting + Advisory",
    },
    {
      quote:
        "He explained complex trade-offs in plain language and gave me an actionable plan after the first meeting.",
      person: "Family Client",
      context: "Retirement and Risk Cover",
    },
  ] as const;

  const faqs = [
    {
      question: "Who is this service best suited for?",
      answer:
        "Professionals, families, and business owners who want one coordinated strategy across wealth, tax, and accounting.",
    },
    {
      question: "Do I need to move all my products to work with you?",
      answer:
        "Not necessarily. The first step is diagnosis and strategy. Implementation decisions are made after reviewing your current setup.",
    },
    {
      question: "How quickly can we get started?",
      answer:
        "Most clients can schedule an initial discovery call within days, depending on calendar availability.",
    },
  ] as const;

</script>

<svelte:head>
  <title>Rossouw Briers | Financial Advisor, Tax Consultant & Accountant</title>
  <meta
    name="description"
    content="Stop splitting your finances. Get holistic wealth management, tax consulting, and financial accounting in one place with Rossouw Briers (Liberty & Kainos Group)."
  />
  <link rel="canonical" href="https://goataccounting.co.za/" />
  <meta property="og:title" content="Rossouw Briers | Financial Advisor & Tax Consultant" />
  <meta
    property="og:description"
    content="A one-stop financial shop bridging wealth management and accounting."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://goataccounting.co.za/" />
  <meta property="og:image" content="https://goataccounting.co.za/og-default.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Rossouw Briers | Financial Advisor, Tax Consultant & Accountant" />
  <meta
    name="twitter:description"
    content="Stop splitting your finances. Get holistic wealth management, tax consulting, and financial accounting in one place with Rossouw Briers (Liberty & Kainos Group)."
  />
  <meta name="twitter:image" content="https://goataccounting.co.za/og-default.svg" />

  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FinancialService",
          "@id": "https://goataccounting.co.za/#organization",
          "name": "Rossouw Briers Financial Services",
          "description": "Comprehensive financial planning, tax consulting, and accounting services.",
          "url": "https://goataccounting.co.za",
          "areaServed": "ZA",
          "parentOrganization": [
            { "@type": "Organization", "name": "Kainos Group" },
            { "@type": "Organization", "name": "Liberty" },
            { "@type": "AccountingService", "name": "Goat Accounting" }
          ]
        },
        {
          "@type": "Person",
          "@id": "https://goataccounting.co.za/#person",
          "name": "Rossouw Briers",
          "jobTitle": ["Financial Advisor", "Tax Consultant", "Financial Accountant"],
          "worksFor": { "@id": "https://goataccounting.co.za/#organization" },
          "alumniOf": {
            "@type": "CollegeOrUniversity",
            "name": "NWU Potchefstroom"
          },
          "url": "https://goataccounting.co.za/about"
        }
      ]
    }
  </script>
</svelte:head>

<section class="relative overflow-hidden border-b border-border/70">
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--color-brand)_0%,transparent_45%)] opacity-10"></div>
  <div class="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8">
    <div class="flex flex-col gap-6 text-left">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
        Stop Splitting Your Finances. Get Advice That Understands the Whole Picture.
      </h1>
      <p class="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        Most advisors don't understand your tax, and most accountants don't grow your wealth. As a
        qualified Financial Accountant, Tax Consultant, and Liberty Financial Advisor, I build
        holistic strategies that protect your money, optimize your tax, and secure your future, all
        under one roof.
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <a
          href="/booking"
          class="inline-flex items-center justify-center rounded-md bg-brand px-6 py-3 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90"
        >
          Book a Free Discovery Call
        </a>
        <a
          href="/services"
          class="inline-flex items-center justify-center rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent/30"
        >
          Explore My Services
        </a>
      </div>
    </div>

    <div class="relative w-full overflow-hidden rounded-2xl shadow-xl">
      <img
        src="/images/hero/screen-with-graph-it-that-says-word-financial-it%20(1).webp"
        alt="Financial strategy meeting with data visualizations and planning documents"
        class="aspect-square w-full object-cover lg:aspect-[4/3]"
        width="1600"
        height="1200"
        loading="eager"
        fetchpriority="high"
        decoding="async"
      />
    </div>
  </div>
</section>

<section class="border-b border-border/70 bg-card/30 py-16 sm:py-20">
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

<section class="border-b border-border/70 bg-card/35 py-10 sm:py-12">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#each trustBar as logoName}
        <div
          class="flex items-center justify-center rounded-xl border border-border/70 bg-background px-4 py-4 text-sm font-semibold text-foreground"
          aria-label={`${logoName} logo`}
        >
          {logoName}
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="rounded-2xl border border-border/70 bg-card/70 p-7 sm:p-10">
      <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        The Unfair Advantage in Your Corner
      </h2>
      <p class="mt-5 max-w-4xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        You shouldn't have to act as the middleman between your broker and your accountant. With a
        background in formal accounting articles and active roles across Goat Accounting and the
        Kainos Group, I offer a true one-stop financial shop. From drafting your financial
        statements to structuring your retirement, every decision is made with your complete
        financial health in mind.
      </p>
      <div class="mt-8">
        <a
          href="/booking"
          class="inline-flex items-center rounded-md bg-brand px-6 py-3 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90"
        >
          Book a Free Discovery Call
        </a>
      </div>
    </div>
  </div>
</section>
