<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
  } from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Phone from "@lucide/svelte/icons/phone";
  import Check from "@lucide/svelte/icons/check";
  import Calendar from "@lucide/svelte/icons/calendar";
  import Clock from "@lucide/svelte/icons/clock";
  import User from "@lucide/svelte/icons/user";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { guides } from "$lib/data/guides";
  import { build_whatsapp_url } from "$lib/config/social.js";
  import { abs_url } from "$lib/config/site.js";
  import { BRAND_WORDMARK_PRIMARY_URL } from "$lib/config/brand.js";

  const guide = guides["skin-prep-before-makeup"];
  const pageUrl = abs_url(`/makeup-guides/${guide.slug}`);
  const pageTitle = guide.title;
  const pageDescription = guide.description;
  const socialImage = abs_url("/og-default.svg");
  const heroImage = abs_url("/images/guides/skin-prep-before-makeup.jpg");

  const whatsappLink = build_whatsapp_url(
    `Hi Megan! I read your "Essential Skin Prep Checklist" and would like to book makeup. Event: _____. Date: _____. Area: Pretoria. Please confirm availability.`,
  );

  const faqs = [
    {
      question: "Should I exfoliate the day before my makeup appointment?",
      answer:
        "It’s better 2–3 days before. The day before can still leave skin slightly sensitive, which may cause redness or foundation cling.",
    },
    {
      question: "Can I get a facial before my wedding or matric?",
      answer:
        "Yes, but keep it gentle and do it 1–2 weeks before. Avoid strong peels or new treatments close to the date.",
    },
    {
      question: "What should I do if my skin is very dry and flaky?",
      answer:
        "Focus on hydration and barrier repair. Skip harsh exfoliation, use a richer moisturizer, and avoid drying cleansers.",
    },
    {
      question: "What if my skin is oily and makeup usually slides off?",
      answer:
        "Use light hydration, avoid heavy oils, and apply a mattifying primer on the T-zone. Blotting paper is better than piling on powder.",
    },
    {
      question: "Should I use retinol or acids before a big event?",
      answer:
        "Not in the final week unless your skin is already used to them. New actives near the event can cause peeling, purging, or irritation.",
    },
    {
      question: "Can sunscreen ruin makeup?",
      answer:
        "It can if it pills or stays greasy. Choose a lightweight SPF, apply evenly, and let it absorb fully before primer.",
    },
    {
      question: "What should I arrive with on the day?",
      answer:
        "Clean skin, moisturized, no makeup (unless you were told otherwise). Bring reference photos and let your artist know about any sensitivities.",
    },
    {
      question: "How long before the event should I stop trying new products?",
      answer: "At least 7–10 days before. Sensitive skin should stop earlier.",
    },
    {
      question: "What if I get a breakout the day before?",
      answer:
        "Don’t panic and don’t “strip” your skin. Keep cleansing gentle, spot treat lightly, and let your artist know — breakouts can be covered well.",
    },
    {
      question: "Do I need a primer if a makeup artist is doing my face?",
      answer:
        "Your artist will usually prep your skin, but primer can help longevity. The key is using the right primer for your skin type and product compatibility.",
    },
  ];

  // Schema.org structured data
  const schemaOrg = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: guide.title,
      description: guide.description,
      image: heroImage,
      inLanguage: "en-ZA",
      isPartOf: {
        "@type": "CollectionPage",
        "@id": abs_url("/makeup-guides"),
      },
      author: {
        "@type": "Person",
        name: "Megan",
        jobTitle: "Makeup Artist",
        url: abs_url("/about"),
      },
      publisher: {
        "@type": "Organization",
        name: "Goat Accounting",
        logo: {
          "@type": "ImageObject",
          url: BRAND_WORDMARK_PRIMARY_URL,
        },
      },
      datePublished: guide.updated_at,
      dateModified: guide.updated_at,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": pageUrl,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.answer,
        },
      })),
    },
  ]);

  const toc = [
    { id: "why-skin-prep-matters", title: "Why skin prep matters" },
    { id: "know-your-skin-type", title: "Know your skin type" },
    { id: "cleanse-properly", title: "Cleanse properly" },
    { id: "exfoliation", title: "Exfoliation" },
    { id: "hydration", title: "Hydration" },
    { id: "primer", title: "Primer" },
    { id: "sunscreen", title: "Sunscreen under makeup" },
    { id: "targeted-treatments", title: "Targeted treatments" },
    { id: "timing-plan", title: "Timing plan" },
    { id: "appointment-checklist", title: "Appointment checklist" },
    { id: "faqs", title: "FAQs" },
  ];
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <link rel="canonical" href={pageUrl} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:image" content={socialImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={pageDescription} />
  <meta name="twitter:image" content={socialImage} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<script type="application/ld+json">${schemaOrg}</script>`}
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-12 md:py-20">
  <div class="grid gap-12 md:grid-cols-[minmax(0,75ch)_minmax(0,1fr)]">
    <!-- Main Content -->
    <article class="space-y-12">
      <!-- Hero -->
      <header class="hero-stagger space-y-6">
        <div class="h-px w-12 bg-brand"></div>
        <h1
          class="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
        >
          {guide.title}
        </h1>
        <p class="text-xl font-medium text-brand italic">
          (Wedding, Matric & Special Events)
        </p>
        <p class="text-lg leading-relaxed text-muted-foreground">
          Perfect makeup starts with skin that is calm, hydrated, and smooth.
          Use this checklist to prep your skin so your makeup sits beautifully,
          photographs well, and lasts longer — with fewer touch-ups.
        </p>

        <div
          class="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground"
        >
          <div class="flex items-center gap-2">
            <Clock class="size-4 text-brand" />
            <span>{guide.read_time_minutes} min read</span>
          </div>
          <div class="flex items-center gap-2">
            <Calendar class="size-4 text-brand" />
            <span>Updated: {guide.updated_at}</span>
          </div>
          <div class="flex items-center gap-2">
            <User class="size-4 text-brand" />
            <span>By Megan — Goat Accounting</span>
          </div>
        </div>

        <div class="aspect-video overflow-hidden rounded-2xl bg-muted/30">
          <img
            src={guide.hero_image}
            alt="Essential skin preparation for flawless event makeup"
            class="h-full w-full object-cover"
            loading="eager"
            fetchpriority="high"
          />
        </div>
      </header>

      <!-- Sidebar CTA (Mobile Only - After Hero) -->
      <div class="md:hidden">
        {@render sidebarCTA()}
      </div>

      <!-- TOC -->
      <nav class="rounded-xl border p-6 bg-muted/20" aria-label="On this page">
        <p
          class="mb-4 text-sm font-semibold uppercase tracking-wider text-brand"
        >
          On this page
        </p>
        <ul class="grid gap-2 sm:grid-cols-2">
          {#each toc as item}
            <li>
              <a
                href={`#${item.id}`}
                class="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
              >
                <ChevronRight class="size-3.5 shrink-0" />
                {item.title}
              </a>
            </li>
          {/each}
        </ul>
      </nav>

      <!-- Main Long-form Content -->
      <div class="prose prose-brand max-w-none dark:prose-invert">
        <h2 id="why-skin-prep-matters">
          Why Skin Prep Matters for Wedding, Matric & Event Makeup
        </h2>
        <p>
          Your special day deserves special attention — and that starts with
          skin. If skin is dry, flaky, oily, or textured, makeup can:
        </p>
        <ul>
          <li>cling to patches</li>
          <li>separate around the nose and mouth</li>
          <li>crease into fine lines</li>
          <li>slide off faster in heat or humidity</li>
        </ul>
        <p>
          Good prep makes the “canvas” smoother so makeup looks more natural and
          stays put longer. It also helps your makeup artist work faster and
          more precisely because the base behaves.
        </p>
        <p>
          Skin prep isn’t about chasing “perfect skin”. It’s about reducing the
          things that make makeup misbehave: uneven texture, dehydration, and
          irritation.
        </p>

        <h2 id="know-your-skin-type">
          Know Your Skin Type (So You Don’t Fight It)
        </h2>
        <p>Your skin type decides what works — and what backfires.</p>

        <div class="grid gap-6 sm:grid-cols-2 mt-8 not-prose">
          <Card class="border-brand/10 bg-brand/5">
            <CardHeader class="pb-2">
              <CardTitle class="text-base">Dry skin</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                Often feels tight. Makeup may look powdery or "cakey".<br
                /><strong>Focus:</strong> hydration + barrier support.
              </p>
            </CardContent>
          </Card>
          <Card class="border-brand/10 bg-brand/5">
            <CardHeader class="pb-2">
              <CardTitle class="text-base">Oily skin</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                Shine builds quickly. Makeup may break down around the T-zone.<br
                /><strong>Focus:</strong> light hydration + oil control (without
                stripping).
              </p>
            </CardContent>
          </Card>
          <Card class="border-brand/10 bg-brand/5">
            <CardHeader class="pb-2">
              <CardTitle class="text-base">Combination skin</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                Oily T-zone, dry cheeks. Most people fall here.<br /><strong
                  >Focus:</strong
                > treat zones differently.
              </p>
            </CardContent>
          </Card>
          <Card class="border-brand/10 bg-brand/5">
            <CardHeader class="pb-2">
              <CardTitle class="text-base">Sensitive skin</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                Redness, stinging, reactivity.<br /><strong>Focus:</strong> gentle
                products, fewer steps, no surprises.
              </p>
            </CardContent>
          </Card>
        </div>

        <p class="mt-8">
          If you’re unsure, keep it simple and avoid “active” products close to
          the event. When in doubt, speak to a skin professional.
        </p>

        <h2 id="cleanse-properly">
          Cleanse Properly: The Base Layer for Smooth Makeup
        </h2>
        <p>
          Cleansing removes oil, sweat, sunscreen, and product residue so makeup
          can grip evenly.
        </p>
        <h3>What to do</h3>
        <ul>
          <li>Use a cleanser that matches your skin type.</li>
          <li>Rinse with lukewarm water (hot water can dry and irritate).</li>
          <li>Pat dry with a clean towel (don’t rub).</li>
        </ul>
        <h3>Should you double cleanse?</h3>
        <p>Double cleansing helps if you wear heavy makeup or SPF daily:</p>
        <ol>
          <li>Oil-based cleanser to lift makeup/SPF</li>
          <li>Water-based cleanser to finish clean</li>
        </ol>
        <p>
          A clean base helps every step after it absorb better and perform
          better.
        </p>

        <h2 id="exfoliation">
          Exfoliation: When to Do It (and When to Skip It)
        </h2>
        <p>
          Exfoliation smooths texture by removing dead skin cells. Done right,
          it makes foundation sit flatter and glow more evenly.
        </p>
        <h3>Frequency</h3>
        <ul>
          <li>Most people: 1–2 times per week</li>
          <li>Sensitive skin: less, or avoid close to the event</li>
        </ul>
        <h3>Physical vs chemical exfoliation</h3>
        <ul>
          <li>
            <strong>Physical:</strong> scrubs/grains (riskier for sensitivity)
          </li>
          <li>
            <strong>Chemical:</strong> acids/enzymes (often more even, but still
            can irritate)
          </li>
        </ul>
        <div
          class="bg-brand/10 border-l-4 border-brand p-6 my-8 not-prose rounded-r-lg"
        >
          <p
            class="text-sm font-semibold text-brand uppercase tracking-wider mb-2"
          >
            Timing rule
          </p>
          <p class="text-lg font-medium">
            Do <strong>not</strong> exfoliate on the day of your makeup appointment.
          </p>
          <p class="text-muted-foreground mt-2">
            Best window: exfoliate <strong>2–3 days before</strong>, then focus
            on hydration.
          </p>
        </div>

        <h2 id="hydration">Hydration: How to Choose the Right Moisturizer</h2>
        <p>Hydrated skin makes makeup look smoother and more “skin-like”.</p>
        <ul>
          <li>
            <strong>Oily skin:</strong> Choose light, gel, or oil-free moisturizers.
          </li>
          <li>
            <strong>Dry skin:</strong> Choose richer creams that lock in moisture.
          </li>
          <li>
            <strong>Combination skin:</strong> Use a lighter layer on the T-zone
            and richer on dry areas.
          </li>
          <li>
            <strong>Sensitive skin:</strong> Choose fragrance-free, soothing formulas.
          </li>
        </ul>
        <p>
          Apply after cleansing and any serums. Let it absorb before your next
          step.
        </p>

        <!-- Inline CTA 1 -->
        <div class="my-12 not-prose">
          <Card
            class="border-brand/20 shadow-lg bg-brand/5 relative overflow-hidden"
          >
            <div
              class="absolute -right-12 -top-12 size-48 rounded-full bg-brand/5"
            ></div>
            <CardContent class="p-8 text-center relative">
              <h3 class="font-display text-2xl font-semibold mb-3">
                Book your makeup appointment
              </h3>
              <p class="text-muted-foreground mb-6">
                Megan offers professional <a
                  href="/services/bridal-makeup"
                  class="text-brand font-medium hover:underline"
                  >bridal makeup in Pretoria</a
                > and surrounds.
              </p>
              <Button
                href={whatsappLink}
                size="lg"
                class="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Book on WhatsApp
                <MessageCircle class="ml-2 size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <h2 id="primer">Primer: Which Type Works Best for Your Skin</h2>
        <p>
          Primer is your “grip” layer. The right one improves wear and finish.
        </p>
        <h3>Choose primer by goal</h3>
        <ul>
          <li>
            <strong>Oil control:</strong> mattifying primers for the T-zone
          </li>
          <li>
            <strong>Dryness:</strong> hydrating primers to prevent patchiness
          </li>
          <li>
            <strong>Pores/texture:</strong> smoothing primers for nose/cheeks
          </li>
          <li>
            <strong>Sensitive skin:</strong> simple, fragrance-free primers
          </li>
        </ul>
        <h3>How to apply</h3>
        <ul>
          <li>Use a small amount.</li>
          <li>Press into areas that fade first (nose, chin, smile lines).</li>
          <li>Let it set before foundation.</li>
        </ul>

        <h2 id="sunscreen">Sunscreen Under Makeup: What to Use (No Pilling)</h2>
        <p>
          SPF is non-negotiable. The trick is choosing one that plays nicely
          with makeup.
        </p>
        <h3>What to look for</h3>
        <ul>
          <li>Broad spectrum (SPF 30+)</li>
          <li>Lightweight finish</li>
          <li>No heavy oils that break makeup down</li>
        </ul>
        <h3>Avoid pilling</h3>
        <ul>
          <li>Apply a thin, even layer.</li>
          <li>Let it absorb fully (5–10 minutes).</li>
          <li>Don’t rub primer on top — press it in gently.</li>
        </ul>
        <p>
          If you consistently pill, your products may be incompatible (SPF +
          primer bases can clash). Swap one, not everything.
        </p>

        <h2 id="targeted-treatments">
          Targeted Treatments for Common Skin Concerns
        </h2>
        <p>
          Targeted products can help, but the closer you get to an event, the
          more you should avoid experimentation.
        </p>
        <ul>
          <li>
            <strong>Acne or breakouts:</strong> Use gentle acne support early. Avoid
            "new strong actives" right before.
          </li>
          <li>
            <strong>Pigmentation or dullness:</strong> Brightening takes time. Start
            weeks ahead, not two days before.
          </li>
          <li>
            <strong>Texture and visible pores:</strong> Often improves with consistent
            cleansing, hydration, and the right primer.
          </li>
          <li>
            <strong>Sensitive or reactive skin:</strong> Less is more. Calm skin
            beats "aggressive" routines.
          </li>
        </ul>

        <h2 id="timing-plan">
          Timing: Your 6-Week, 2-Week, 48-Hour, Morning-Of Plan
        </h2>
        <p>
          This is the difference between “okay makeup” and “effortless makeup”.
        </p>

        <div class="space-y-4 mt-8 not-prose">
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div
                class="size-8 rounded-full bg-brand text-brand-foreground flex items-center justify-center font-bold text-sm shrink-0"
              >
                6
              </div>
              <div class="w-px h-full bg-border mt-2"></div>
            </div>
            <div class="pb-6">
              <h4 class="font-semibold text-lg">6 weeks before</h4>
              <ul class="mt-2 space-y-1 text-muted-foreground text-sm">
                <li>• Build consistency: cleanse + moisturize + SPF daily</li>
                <li>• Add exfoliation 1–2×/week if tolerated</li>
                <li>• Test any new products early (not later)</li>
              </ul>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div
                class="size-8 rounded-full bg-brand text-brand-foreground flex items-center justify-center font-bold text-sm shrink-0"
              >
                2
              </div>
              <div class="w-px h-full bg-border mt-2"></div>
            </div>
            <div class="pb-6">
              <h4 class="font-semibold text-lg">2 weeks before</h4>
              <ul class="mt-2 space-y-1 text-muted-foreground text-sm">
                <li>• Keep routine stable</li>
                <li>• If you do a facial, choose gentle and do it early</li>
                <li>
                  • Consider a <a
                    href="/services/bridal-makeup"
                    class="text-brand hover:underline">bridal makeup trial</a
                  > if you’re a bride
                </li>
              </ul>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div
                class="size-8 rounded-full bg-brand text-brand-foreground flex items-center justify-center font-bold text-sm shrink-0"
              >
                48
              </div>
              <div class="w-px h-full bg-border mt-2"></div>
            </div>
            <div class="pb-6">
              <h4 class="font-semibold text-lg">48 hours before</h4>
              <ul class="mt-2 space-y-1 text-muted-foreground text-sm">
                <li>• No new products</li>
                <li>• Hydrate consistently</li>
                <li>• Prioritise sleep and water intake</li>
              </ul>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div
                class="size-8 rounded-full bg-brand text-brand-foreground flex items-center justify-center font-bold text-sm shrink-0"
              >
                AM
              </div>
            </div>
            <div>
              <h4 class="font-semibold text-lg">Morning of</h4>
              <ul class="mt-2 space-y-1 text-muted-foreground text-sm">
                <li>• Cleanse gently & Moisturize</li>
                <li>• Apply lightweight SPF</li>
                <li>
                  • Primer (only if applying base before the artist arrives)
                </li>
              </ul>
            </div>
          </div>
        </div>

        <h2 id="appointment-checklist">
          Your Appointment Checklist (What to Do and What to Avoid)
        </h2>
        <div class="grid gap-8 sm:grid-cols-2 mt-8 not-prose">
          <Card
            class="border-green-100 bg-green-50/30 dark:bg-green-950/10 dark:border-green-900/50"
          >
            <CardHeader class="pb-2">
              <CardTitle class="text-base text-green-700 dark:text-green-400"
                >Do</CardTitle
              >
            </CardHeader>
            <CardContent>
              <ul class="text-sm space-y-2">
                <li class="flex items-start gap-2">
                  <Check class="size-4 shrink-0 mt-0.5 text-green-600" /> Arrive
                  with clean skin (no makeup)
                </li>
                <li class="flex items-start gap-2">
                  <Check class="size-4 shrink-0 mt-0.5 text-green-600" /> Moisturize
                  the night before and morning of
                </li>
                <li class="flex items-start gap-2">
                  <Check class="size-4 shrink-0 mt-0.5 text-green-600" /> Exfoliate
                  2–3 days before
                </li>
                <li class="flex items-start gap-2">
                  <Check class="size-4 shrink-0 mt-0.5 text-green-600" /> Share allergies
                  or sensitivities
                </li>
                <li class="flex items-start gap-2">
                  <Check class="size-4 shrink-0 mt-0.5 text-green-600" /> Bring reference
                  photos of your favorite look
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card class="border-destructive/10 bg-destructive/5">
            <CardHeader class="pb-2">
              <CardTitle class="text-base text-destructive">Don't</CardTitle>
            </CardHeader>
            <CardContent>
              <ul class="text-sm space-y-2">
                <li class="flex items-start gap-2">
                  <span
                    class="text-destructive font-bold text-lg leading-none mt-[-2px] shrink-0"
                    >×</span
                  > Try new skincare the day before or day of
                </li>
                <li class="flex items-start gap-2">
                  <span
                    class="text-destructive font-bold text-lg leading-none mt-[-2px] shrink-0"
                    >×</span
                  > Use strong actives right before
                </li>
                <li class="flex items-start gap-2">
                  <span
                    class="text-destructive font-bold text-lg leading-none mt-[-2px] shrink-0"
                    >×</span
                  > Overload skin with too many layers
                </li>
                <li class="flex items-start gap-2">
                  <span
                    class="text-destructive font-bold text-lg leading-none mt-[-2px] shrink-0"
                    >×</span
                  > Forget to drink water (dehydration shows!)
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <p class="mt-8">
          Ready for your transformation? Megan specializes in <a
            href="/services/matric-farewell"
            class="text-brand hover:underline font-medium"
            >matric farewell makeup</a
          >
          and
          <a
            href="/services/special-events"
            class="text-brand hover:underline font-medium"
            >special event makeup</a
          > across Gauteng.
        </p>

        <h2 id="faqs">Frequently Asked Questions</h2>
      </div>

      <!-- FAQ Section -->
      <div class="space-y-4">
        {#each faqs as faq}
          <details
            class="group rounded-lg border border-border px-6 py-4 bg-background"
          >
            <summary
              class="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold [&::-webkit-details-marker]:hidden"
            >
              {faq.question}
              <ChevronRight
                class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
              />
            </summary>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
              {faq.answer}
            </p>
          </details>
        {/each}
      </div>

      <!-- Final CTA -->
      <section class="border-t pt-12">
        <div class="flex flex-col items-center text-center">
          <div class="mb-6 h-px w-12 bg-brand"></div>
          <h2 class="font-display text-4xl font-semibold tracking-tight">
            Book Megan (Pretoria & surrounds)
          </h2>
          <p class="mt-4 text-muted-foreground max-w-lg">
            Use the <a
              href="/contact"
              class="text-brand font-medium hover:underline"
              >Contact Goat Accounting</a
            > page or WhatsApp with your event type, date, area, and number of guests.
          </p>
          <div class="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              href={whatsappLink}
              size="lg"
              class="bg-brand text-brand-foreground hover:bg-brand/90 px-8 h-12"
            >
              Book on WhatsApp
              <MessageCircle class="ml-2 size-5" />
            </Button>
            <Button
              href="/contact"
              variant="outline"
              size="lg"
              class="px-8 h-12"
            >
              Send Enquiry
            </Button>
          </div>
        </div>
      </section>
    </article>

    <!-- Sidebar (Desktop Sticky) -->
    <aside class="hidden md:block">
      <div class="sticky top-24">
        {@render sidebarCTA()}
      </div>
    </aside>
  </div>
</div>

{#snippet sidebarCTA()}
  <Card class="border-brand/20 shadow-xl overflow-hidden group">
    <CardHeader class="bg-brand/5 border-b border-brand/10">
      <CardTitle class="flex items-center gap-2 text-xl">
        <Phone class="size-5 text-brand" />
        Book your GLAM
      </CardTitle>
      <CardDescription class="text-brand/80 font-medium"
        >Check availability for your date</CardDescription
      >
    </CardHeader>
    <CardContent class="grid gap-8 p-6">
      <div class="space-y-4">
        <p
          class="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60"
        >
          Include in message:
        </p>
        <ul class="grid gap-3">
          <li class="flex items-start gap-3 text-sm">
            <div
              class="size-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5"
            >
              <span class="text-[10px] font-bold text-brand">1</span>
            </div>
            <span>Event Type & Date</span>
          </li>
          <li class="flex items-start gap-3 text-sm">
            <div
              class="size-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5"
            >
              <span class="text-[10px] font-bold text-brand">2</span>
            </div>
            <span>Location/Area</span>
          </li>
          <li class="flex items-start gap-3 text-sm">
            <div
              class="size-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5"
            >
              <span class="text-[10px] font-bold text-brand">3</span>
            </div>
            <span>Number of Faces</span>
          </li>
        </ul>
      </div>

      <div class="grid gap-3 pt-4">
        <Button
          href={whatsappLink}
          class="w-full h-12 bg-brand text-brand-foreground hover:bg-brand/90 shadow-md"
        >
          WhatsApp Enquire
          <MessageCircle class="ml-2 size-4" />
        </Button>
        <Button
          href="/contact"
          variant="ghost"
          class="w-full text-muted-foreground hover:text-brand"
        >
          Other Contact Methods
        </Button>
      </div>
    </CardContent>
    <div class="h-1 w-full bg-brand"></div>
  </Card>
{/snippet}

<style>
  .hero-stagger {
    animation: hero-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes hero-fade-in {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-stagger {
      animation: none !important;
    }
  }

  :global(.prose h2) {
    scroll-margin-top: 6rem;
    font-family: var(--font-display);
    font-weight: 600;
  }

  :global(.prose img) {
    border-radius: 1rem;
  }

  :global(.prose a) {
    color: #d68e85;
    font-weight: 500;
    text-decoration: none;
  }

  :global(.prose a:hover) {
    text-decoration: underline;
  }
</style>
