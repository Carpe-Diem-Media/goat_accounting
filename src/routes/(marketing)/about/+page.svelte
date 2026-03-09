<script lang="ts">
  const socialProof = [
    {
      quote:
        "Rossouw connected my business numbers to my personal plan so every decision now has a tax and wealth lens.",
      person: "Business Client",
      context: "Accounting + Tax + Advisory",
    },
    {
      quote:
        "I wanted one trusted advisor, not three disconnected opinions. The integrated approach made planning far simpler.",
      person: "Family Client",
      context: "Holistic Financial Planning",
    },
    {
      quote:
        "The quality of guidance felt senior from day one, with clear actions and practical follow-through.",
      person: "Professional Client",
      context: "Strategy and Execution",
    },
  ] as const;

  const faqs = [
    {
      question: "What makes Rossouw different from a traditional advisor?",
      answer:
        "Rossouw combines accounting depth, tax strategy, and licensed financial advice so recommendations are aligned across your full financial picture.",
    },
    {
      question: "Do you work with both individuals and business owners?",
      answer:
        "Yes. Services are structured for professionals, families, and entrepreneurs who want coordinated wealth, tax, and accounting support.",
    },
    {
      question: "Can I start with one service and expand later?",
      answer:
        "Absolutely. Many clients begin with one immediate priority and then build into a complete strategy over time.",
    },
  ] as const;

</script>

<svelte:head>
  <title>About Rossouw Briers | NWU Finance Grad & Tax Consultant</title>
  <meta
    name="description"
    content="Learn how Rossouw Briers bridges the gap between accounting and wealth generation. Finance degree from NWU, former accounting articles, and Liberty Advisor."
  />
  <link rel="canonical" href="https://goataccounting.co.za/about" />
  <meta property="og:title" content="About Rossouw Briers | NWU Finance Grad & Tax Consultant" />
  <meta
    property="og:description"
    content="Learn how Rossouw Briers bridges the gap between accounting and wealth generation."
  />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="https://goataccounting.co.za/about" />
  <meta property="og:image" content="https://goataccounting.co.za/og-default.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="About Rossouw Briers | NWU Finance Grad & Tax Consultant" />
  <meta
    name="twitter:description"
    content="Learn how Rossouw Briers bridges the gap between accounting and wealth generation."
  />
  <meta name="twitter:image" content="https://goataccounting.co.za/og-default.svg" />

  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "mainEntity": {
        "@id": "https://goataccounting.co.za/#person"
      }
    }
  </script>
</svelte:head>

<section class="border-b border-border/70 py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
      <div>
        <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Meet Rossouw Briers: Bridging the Gap Between
          <span class="text-gradient-primary">Accounting and Wealth</span>.
        </h1>

        <div class="mt-8 space-y-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
          <p>
            I started my career deep in the numbers. After earning my Finance degree from NWU
            Potchefstroom, I completed my accounting articles and spent years working on the front
            lines of an established accounting firm. I saw firsthand how much money clients left on
            the table because their accountants and their financial advisors never spoke to each
            other.
          </p>

          <p class="text-foreground font-semibold">
            I realized I could provide more value by being the bridge.
          </p>

          <p>
            Today, as a Financial Accountant, Tax Consultant with Goat Accounting, and a Financial
            Advisor under the Kainos Group and Liberty, I offer a modern, dynamic approach to
            personal and business finance. Whether it's drafting your annual financial statements,
            navigating complex tax legislation, or structuring an investment portfolio, my goal is
            simple: to be the only financial partner you will ever need.
          </p>
        </div>

        <div class="mt-10">
          <a
            href="/booking"
            class="btn-gold-gradient inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-95"
          >
            Let's Build Your Strategy
          </a>
        </div>
      </div>

      <div class="relative mx-auto w-full max-w-md overflow-visible pb-4 pr-4 lg:max-w-none">
        <div
          class="absolute inset-0 -z-10 translate-x-4 translate-y-4 rounded-2xl bg-slate-100"
          aria-hidden="true"
        ></div>
        <img
          src="/images/services/financial-consulting.webp"
          alt="Portrait of financial advisor Rossouw Briers"
          class="image-reveal relative z-10 aspect-[4/5] w-full rounded-2xl object-cover shadow-lg"
          width="960"
          height="1200"
          loading="eager"
          decoding="async"
        />
      </div>
    </div>
  </div>
</section>

<section class="border-b border-border/70 bg-card/30 py-16 sm:py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
      Client <span class="text-gradient-primary">Outcomes</span>
    </h2>
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
    <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
      Frequently Asked <span class="text-gradient-primary">Questions</span>
    </h2>
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
