<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardFooter,
  } from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import Breadcrumb from "$lib/components/breadcrumb.svelte";
  import Gem from "@lucide/svelte/icons/gem";
  import Scissors from "@lucide/svelte/icons/scissors";
  import Star from "@lucide/svelte/icons/star";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Users from "@lucide/svelte/icons/users";
  import Check from "@lucide/svelte/icons/check";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import Clock from "@lucide/svelte/icons/clock";
  import CreditCard from "@lucide/svelte/icons/credit-card";
  import X from "@lucide/svelte/icons/x";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import type { Component } from "svelte";
  import type { PageData } from "./$types";
  import { services as allServices } from "$lib/data/services";
  import { WHATSAPP_URL, build_whatsapp_url } from "$lib/config/social.js";
  import { abs_url } from "$lib/config/site.js";
  import { guides } from "$lib/data/guides";

  let { data }: { data: PageData } = $props();
  const service = $derived(data.service);

  const iconMap: Record<string, Component> = {
    gem: Gem,
    scissors: Scissors,
    star: Star,
    sparkles: Sparkles,
    users: Users,
  };

  const HeroIcon = $derived(iconMap[service.icon] ?? Gem);

  const relatedServices = $derived(
    service.relatedSlugs.map((slug) => allServices[slug]).filter(Boolean),
  );
  const pageUrl = $derived(abs_url(`/services/${service.slug}`));
  const pageImage = abs_url("/og-default.svg");

  const parsePrice = (value: string) => {
    const numeric = value.replace(/[^0-9.]/g, "");
    if (!numeric) {
      return undefined;
    }

    return Number.parseFloat(numeric).toFixed(2);
  };

  const serviceOffers = $derived(
    service.pricing
      .flatMap((group) => group.rows)
      .map((row) => {
        const normalizedPrice = parsePrice(row.price);
        if (!normalizedPrice) {
          return undefined;
        }

        return {
          "@type": "Offer",
          priceCurrency: "ZAR",
          price: normalizedPrice,
          availability: "https://schema.org/InStock",
          description: row.item,
          url: pageUrl,
        };
      })
      .filter(Boolean),
  );

  const notes = [
    {
      icon: MapPin,
      title: "Travel",
      text: "Based in Moreleta Park, Pretoria. Available across Centurion, Midrand, Sandton, and Johannesburg. Travel charged at R5\u00A0/\u00A0km (to venue and back).",
    },
    {
      icon: Clock,
      title: "Timing",
      text: "Bridal bookings require a 3-hour minimum window. Early-morning starts (before 06:00) carry a small surcharge.",
    },
    {
      icon: CreditCard,
      title: "Booking",
      text: "A 50% deposit secures your date. Final payment is due on the day of your appointment.",
    },
  ];

  const skinPrepGuide = guides["skin-prep-before-makeup"];
  const serviceWhatsAppLink = $derived(
    build_whatsapp_url(
      `Hi Megan! I'm interested in ${service.title} in Pretoria. ` +
        `Event: _____. Date: _____. Please confirm availability.`,
    ),
  );

  const guideCopyMap: Record<string, string> = {
    "bridal-makeup":
      "Every bride needs a flawless canvas. Learn how to prep your skin for your wedding day.",
    "matric-farewell":
      "Get camera-ready for your big night with these essential skin prep tips.",
    "special-events":
      "Make your event makeup last all day and night with proper preparation.",
  };

  const tailoredGuideCopy = $derived(
    guideCopyMap[service.slug] ??
      "Preparation is the secret to a professional, long-lasting makeup finish.",
  );

  // Schema.org structured data
  const schemaOrg = $derived(
    JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: service.title,
        description: service.metaDescription,
        provider: {
          "@type": "LocalBusiness",
          name: "Goat Accounting",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Pretoria",
            addressRegion: "Gauteng",
            addressCountry: "ZA",
          },
          telephone: "+27816098157",
          url: abs_url("/"),
        },
        areaServed: [
          { "@type": "City", name: "Pretoria" },
          { "@type": "City", name: "Centurion" },
          { "@type": "City", name: "Midrand" },
          { "@type": "City", name: "Johannesburg" },
        ],
        offers: serviceOffers,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: abs_url("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Services",
            item: abs_url("/services"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: service.shortTitle,
            item: pageUrl,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: service.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ]),
  );
</script>

{#snippet priceRow(item: string, price: string)}
  <div class="flex items-baseline gap-2 text-sm">
    <dt class="shrink-0 text-muted-foreground">{item}</dt>
    <span
      class="flex-1 translate-y-[-0.2em] border-b border-dotted border-muted-foreground/25"
      aria-hidden="true"
    ></span>
    <dd class="shrink-0 font-semibold tabular-nums">{price}</dd>
  </div>
{/snippet}

{#snippet checkItem(text: string)}
  <li class="flex items-start gap-3 text-sm">
    <Check class="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
    <span>{text}</span>
  </li>
{/snippet}

{#snippet excludeItem(text: string)}
  <li class="flex items-start gap-3 text-sm">
    <X
      class="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
      aria-hidden="true"
    />
    <span class="text-muted-foreground">{text}</span>
  </li>
{/snippet}

<svelte:head>
  <title>{service.metaTitle}</title>
  <meta name="description" content={service.metaDescription} />
  <link rel="canonical" href={pageUrl} />
  <meta property="og:title" content={service.metaTitle} />
  <meta property="og:description" content={service.metaDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:image" content={pageImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={service.metaTitle} />
  <meta name="twitter:description" content={service.metaDescription} />
  <meta name="twitter:image" content={pageImage} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<script type="application/ld+json">${schemaOrg}</script>`}
</svelte:head>

<!-- Breadcrumb -->
<Breadcrumb
  items={[
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
    { label: service.shortTitle },
  ]}
/>

<!-- Hero -->
<section class="py-16 sm:py-20">
  <div class="mx-auto max-w-5xl px-4">
    <div class="hero-stagger flex flex-col items-center text-center">
      <div class="mb-8 h-px w-12 bg-brand"></div>

      {#if service.badge}
        <Badge class="mb-6 border-transparent bg-brand text-brand-foreground">
          {service.badge}
        </Badge>
      {/if}

      <div
        class="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl bg-brand/10 text-brand"
      >
        <HeroIcon class="size-7" />
      </div>

      <h1
        class="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
      >
        {service.title}
      </h1>

      <p
        class="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
      >
        {service.heroDescription}
      </p>

      <div class="mt-8 h-px w-12 bg-brand"></div>

      <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          href="/contact"
          size="lg"
          class="GA4_BookingBtn bg-brand text-brand-foreground hover:bg-brand/90"
        >
          Book Now
          <ArrowRight class="size-4" />
        </Button>
        <Button href={WHATSAPP_URL} variant="outline" size="lg">
          WhatsApp Me
        </Button>
      </div>

      <p class="mt-8 text-sm text-muted-foreground">
        Not sure how to prep your skin?
        <a
          href="/makeup-guides/skin-prep-before-makeup"
          class="font-medium text-brand hover:underline"
        >
          Read the skin prep guide.
        </a>
      </p>
    </div>
  </div>
</section>

<Separator />

<!-- What's Included / Not Included -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        The Details
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        What's Included
      </h2>
    </div>

    <div class="mx-auto max-w-3xl">
      <div class="grid gap-10 sm:grid-cols-2">
        <div>
          <p
            class="mb-4 text-xs font-medium uppercase tracking-widest text-brand"
          >
            Included
          </p>
          <ul class="space-y-3">
            {#each service.included as item}
              {@render checkItem(item)}
            {/each}
          </ul>
        </div>

        <div>
          <p
            class="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground"
          >
            Not Included
          </p>
          <ul class="space-y-3">
            {#each service.excluded as item}
              {@render excludeItem(item)}
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<Separator />

<!-- The Process -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        How It Works
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        The Process
      </h2>
    </div>

    <div class="mx-auto max-w-3xl">
      <ol class="relative space-y-10 border-l border-brand/20 pl-8">
        {#each service.process as step, i}
          <li class="relative">
            <div
              class="absolute -left-11.5 flex size-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground"
            >
              {i + 1}
            </div>
            <h3 class="text-lg font-semibold">{step.title}</h3>
            <p class="mt-2 leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>

<Separator />

<!-- Who It's For -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        Perfect For
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Who It's For
      </h2>
    </div>

    <div class="mx-auto max-w-3xl">
      <p class="mb-6 leading-relaxed text-muted-foreground">
        {service.audience.description}
      </p>
      <ul class="space-y-3">
        {#each service.audience.items as item}
          {@render checkItem(item)}
        {/each}
      </ul>
    </div>
  </div>
</section>

<Separator />

<!-- Pricing -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        Investment
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Pricing
      </h2>
    </div>

    <div class="mx-auto max-w-2xl space-y-8">
      {#each service.pricing as group}
        <div>
          <p
            class="mb-3 text-xs font-medium uppercase tracking-widest text-brand"
          >
            {group.label}
          </p>
          <dl class="space-y-3">
            {#each group.rows as row}
              {@render priceRow(row.item, row.price)}
            {/each}
          </dl>
          {#if group.note}
            <p
              class="mt-3 text-xs leading-relaxed text-muted-foreground italic"
            >
              {group.note}
            </p>
          {/if}
        </div>
      {/each}

      {#if service.addOns && service.addOns.length > 0}
        <div class="rounded-xl border border-border bg-muted/30 px-6 py-5">
          <p
            class="mb-4 text-xs font-medium uppercase tracking-widest text-brand"
          >
            Add-Ons
          </p>
          <dl
            class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-10 sm:gap-y-3"
          >
            {#each service.addOns as tier}
              <div class="flex items-baseline gap-2 text-sm">
                <dt class="text-muted-foreground">{tier.item}</dt>
                <dd class="font-semibold tabular-nums">{tier.price}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/if}
    </div>

    <div class="mt-10 flex justify-center">
      <Button
        href="/contact"
        size="lg"
        class="bg-brand text-brand-foreground hover:bg-brand/90"
      >
        Book This Service
        <ArrowRight class="size-4" />
      </Button>
    </div>
  </div>
</section>

<Separator />

<!-- Good to Know -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        Before You Book
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Good to Know
      </h2>
    </div>

    <div class="grid gap-8 sm:grid-cols-3">
      {#each notes as note}
        <div class="text-center">
          <div
            class="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand"
          >
            <note.icon class="size-5" />
          </div>
          <h3 class="text-sm font-semibold">{note.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            {note.text}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>

<Separator />

<!-- FAQ -->
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        Common Questions
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Frequently Asked
      </h2>
    </div>

    <div class="mx-auto max-w-2xl space-y-3">
      {#each service.faq as faq}
        <details class="group rounded-lg border border-border px-6 py-4">
          <summary
            class="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden"
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
  </div>
</section>

<!-- Related Services -->
{#if relatedServices.length > 0}
  <Separator />

  <section class="py-20 sm:py-24">
    <div class="mx-auto max-w-5xl px-4">
      <div class="mb-14 text-center">
        <p class="text-sm font-medium uppercase tracking-widest text-brand">
          You Might Also Like
        </p>
        <h2
          class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          Related Services
        </h2>
      </div>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each relatedServices as related}
          {@const RelatedIcon = iconMap[related.icon] ?? Gem}
          <a href="/services/{related.slug}" class="group block">
            <Card
              class="relative h-full transition-shadow duration-300 hover:shadow-md"
            >
              {#if related.badge}
                <Badge
                  class="absolute right-4 top-4 border-transparent bg-brand text-brand-foreground"
                >
                  {related.badge}
                </Badge>
              {/if}
              <CardContent class="pt-2 sm:pt-4">
                <div
                  class="mb-3 flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors duration-300 group-hover:bg-brand/20"
                >
                  <RelatedIcon class="size-5" />
                </div>
                <h3 class="text-lg font-semibold">{related.title}</h3>
                <p
                  class="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2"
                >
                  {related.heroDescription}
                </p>
              </CardContent>
              <CardFooter class="border-t pt-4">
                <span
                  class="flex items-center gap-1.5 text-sm font-medium text-brand"
                >
                  Learn More
                  <ArrowRight class="size-3.5" />
                </span>
              </CardFooter>
            </Card>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- Helpful Guides -->
<Separator />
<section class="py-20 sm:py-24">
  <div class="mx-auto max-w-5xl px-4">
    <div class="mb-14 text-center">
      <p class="text-sm font-medium uppercase tracking-widest text-brand">
        Expert Advice
      </p>
      <h2
        class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Helpful Guides
      </h2>
    </div>

    <div class="mx-auto max-w-2xl">
      <Card
        class="group relative overflow-hidden transition-shadow duration-300 hover:shadow-md border-brand/20"
      >
        <CardContent class="p-6 sm:p-8">
          <div class="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div class="flex-1 space-y-3">
              <Badge class="border-transparent bg-brand/10 text-brand">
                {skinPrepGuide.category}
              </Badge>
              <h3
                class="text-xl font-semibold group-hover:text-brand transition-colors"
              >
                Skin prep before makeup (guide)
              </h3>
              <p class="text-sm leading-relaxed text-muted-foreground">
                How to prep your skin for your makeup appointment to ensure a
                flawless, long-lasting finish.
              </p>
              <div class="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href="/makeup-guides/skin-prep-before-makeup"
                  class="flex items-center gap-1.5 text-sm font-medium text-brand"
                >
                  Read guide
                  <ArrowRight class="size-3.5" />
                </a>
                <Button
                  href={serviceWhatsAppLink}
                  variant="ghost"
                  size="sm"
                  class="h-auto p-0 text-brand hover:bg-transparent hover:text-brand/80"
                >
                  <MessageCircle class="mr-1.5 size-3.5" />
                  Book on WhatsApp
                </Button>
              </div>
            </div>
            <div
              class="hidden sm:block size-24 shrink-0 overflow-hidden rounded-xl bg-muted/30"
            >
              <img
                src={skinPrepGuide.hero_image}
                alt="Skin prep"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</section>

<!-- CTA Banner -->
<section class="border-t bg-brand/5">
  <div class="mx-auto max-w-5xl px-4 py-20 sm:py-24">
    <div class="flex flex-col items-center text-center">
      <div class="mb-6 h-px w-12 bg-brand"></div>
      <h2
        class="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Ready to Book?
      </h2>
      <p
        class="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground"
      >
        Let's discuss your look. Whether it's a wedding, farewell, or special
        event, I'd love to hear from you.
      </p>
      <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          href="/contact"
          size="lg"
          class="GA4_BookingBtn bg-brand text-brand-foreground hover:bg-brand/90"
        >
          Get in Touch
          <ArrowRight class="size-4" />
        </Button>
        <Button href={WHATSAPP_URL} variant="outline" size="lg">
          WhatsApp Me
        </Button>
      </div>
    </div>
  </div>
</section>

<style>
  .hero-stagger > :nth-child(1) {
    animation: hero-fade-in 0.8s ease both 0.1s;
  }
  .hero-stagger > :nth-child(2) {
    animation: hero-fade-in 0.8s ease both 0.2s;
  }
  .hero-stagger > :nth-child(3) {
    animation: hero-fade-in 0.8s ease both 0.3s;
  }
  .hero-stagger > :nth-child(4) {
    animation: hero-fade-in 0.8s ease both 0.4s;
  }
  .hero-stagger > :nth-child(5) {
    animation: hero-fade-in 0.8s ease both 0.5s;
  }
  .hero-stagger > :nth-child(6) {
    animation: hero-fade-in 0.8s ease both 0.6s;
  }
  .hero-stagger > :nth-child(7) {
    animation: hero-fade-in 0.8s ease both 0.7s;
  }

  @keyframes hero-fade-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-stagger > * {
      animation: none !important;
    }
  }
</style>
