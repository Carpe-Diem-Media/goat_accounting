<script lang="ts">
  import LeadBookingForm from "$lib/ui/components/lead-booking-form.svelte";

  const process = [
    {
      step: "1. Pick a Service",
      title: "Pick a Service",
      description: "Tell me what you need help with right now.",
    },
    {
      step: "2. Choose a Time",
      title: "Choose a Time",
      description: "Select an open slot on the calendar.",
    },
    {
      step: "3. Get Clarity",
      title: "Get Clarity",
      description: "We'll meet via a secure online link to discuss your goals.",
    },
  ] as const;

  const socialProof = [
    {
      quote: "The session was focused and practical. I left with clear next steps for both tax and investments.",
      person: "Professional Client",
    },
    {
      quote:
        "Booking was easy, and the strategy call connected my business reporting with my personal financial goals.",
      person: "Owner-Managed Business Client",
    },
  ] as const;

  const faqs = [
    {
      question: "How long is the consultation?",
      answer:
        "Most discovery consultations run for approximately 30 to 45 minutes, depending on complexity.",
    },
    {
      question: "What should I prepare before the call?",
      answer:
        "Bring your top priorities and any relevant context around current investments, tax position, or financial reporting needs.",
    },
    {
      question: "Will I receive a product recommendation immediately?",
      answer:
        "The first call is diagnostic. Recommendations are provided after your goals and current setup are properly reviewed.",
    },
  ] as const;
</script>

<svelte:head>
  <title>Book a Financial Consultation | Rossouw Briers</title>
  <meta
    name="description"
    content="Schedule a free discovery call to discuss your wealth, tax, or accounting needs. Choose a time that works for you."
  />
  <link rel="canonical" href="https://goataccounting.co.za/booking" />
  <meta property="og:title" content="Book a Financial Consultation | Rossouw Briers" />
  <meta
    property="og:description"
    content="Schedule a free discovery call to discuss your wealth, tax, or accounting needs."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://goataccounting.co.za/booking" />
  <meta property="og:image" content="https://goataccounting.co.za/og-default.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Book a Financial Consultation | Rossouw Briers" />
  <meta
    name="twitter:description"
    content="Schedule a free discovery call to discuss your wealth, tax, or accounting needs."
  />
  <meta name="twitter:image" content="https://goataccounting.co.za/og-default.svg" />
  <meta name="robots" content="index, follow" />
</svelte:head>

<section class="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
  <div class="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
    <article class="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8">
      <h1 class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Schedule Your <span class="text-gradient-primary">Consultation</span>
      </h1>
      <p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Choose a time that works for you. Whether you need tax advice, wealth management, or financial statements, let's map out your next steps.
      </p>

      <ol class="mt-8 space-y-4">
        {#each process as item}
          <li class="rounded-xl border border-border/70 bg-background/85 p-4">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{item.step}</p>
            <p class="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </li>
        {/each}
      </ol>
    </article>

    <aside class="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
      <h2 class="font-display text-2xl font-semibold tracking-tight">
        Book <span class="text-gradient-primary">Your Slot</span>
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">All slots are shown in South African Standard Time (SAST, UTC+2).</p>
      <div class="mt-6">
        <LeadBookingForm />
      </div>
    </aside>
  </div>
</section>

<section class="border-y border-border/70 bg-card/20 py-12 sm:py-14">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <h2 class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
      Trusted by Clients Who Value <span class="text-gradient-primary">Clarity</span>
    </h2>
    <div class="mt-6 grid gap-4 md:grid-cols-2">
      {#each socialProof as item}
        <article class="rounded-xl border border-border/70 bg-background p-5">
          <p class="text-sm leading-relaxed text-foreground/90">"{item.quote}"</p>
          <p class="mt-4 text-sm font-semibold">{item.person}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="py-12 sm:py-14">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <h2 class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
      Booking <span class="text-gradient-primary">FAQs</span>
    </h2>
    <div class="mt-6 space-y-3">
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
