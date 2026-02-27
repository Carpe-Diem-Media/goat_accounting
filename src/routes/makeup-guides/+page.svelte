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
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Phone from "@lucide/svelte/icons/phone";
  import Check from "@lucide/svelte/icons/check";
  import { guideList } from "$lib/data/guides";
  import { build_whatsapp_url } from "$lib/config/social.js";
  import { abs_url } from "$lib/config/site.js";

  const pageUrl = abs_url("/makeup-guides");
  const pageTitle = "Makeup Guides | Goat Accounting Pretoria";
  const pageDescription =
    "Professional makeup guides for brides, matric farewells, and special events. Practical tips for flawless, long-lasting results in the Pretoria & Gauteng area.";
  const socialImage = abs_url("/og-default.svg");

  const featuredGuides = guideList.filter((g) => g.featured);
  const otherGuides = guideList.filter((g) => !g.featured);

  const whatsappLink = build_whatsapp_url(
    "Hi Megan! I would like to book a makeup appointment. Event: _____. Date: _____. Area: Pretoria. Please confirm availability.",
  );

  // Schema.org structured data
  const schemaOrg = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: pageTitle,
    description: pageDescription,
    url: pageUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: guideList.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: guideList.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: guide.title,
        item: {
          "@type": "WebPage",
          "@id": abs_url(`/makeup-guides/${guide.slug}`),
          name: guide.title,
        },
      })),
    },
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <link rel="canonical" href={pageUrl} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:type" content="website" />
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
    <div class="space-y-16">
      <!-- Hero Header -->
      <section class="hero-stagger">
        <div class="mb-6 h-px w-12 bg-brand"></div>
        <h1
          class="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
        >
          Makeup Guides for Brides, Matric & Events
        </h1>
        <p class="mt-6 text-lg leading-relaxed text-muted-foreground">
          Expert advice to help you prepare for your professional makeup
          appointment. Based in Pretoria, serving all of Gauteng with premium
          artistry that lasts.
        </p>
      </section>

      <!-- Sidebar CTA (Mobile Only - After Hero) -->
      <div class="md:hidden">
        {@render sidebarCTA()}
      </div>

      <!-- Start Here (Featured) -->
      {#if featuredGuides.length > 0}
        <section>
          <h2 class="font-display mb-8 text-2xl font-semibold tracking-tight">
            Start Here
          </h2>
          <div class="grid gap-6">
            {#each featuredGuides as guide}
              {@render guideCard(guide)}
            {/each}
          </div>
        </section>
      {/if}

      <!-- All Guides -->
      {#if otherGuides.length > 0}
        <section>
          <h2 class="font-display mb-8 text-2xl font-semibold tracking-tight">
            All Guides
          </h2>
          <div class="grid gap-6 sm:grid-cols-2">
            {#each otherGuides as guide}
              {@render guideCard(guide)}
            {/each}
          </div>
        </section>
      {/if}

      <!-- Book Megan Section -->
      <section class="rounded-2xl bg-brand/5 p-8 sm:p-12 text-center">
        <div class="mx-auto mb-6 h-px w-12 bg-brand"></div>
        <h2 class="font-display text-3xl font-semibold tracking-tight">
          Book Megan
        </h2>
        <p class="mx-auto mt-4 max-w-md text-muted-foreground">
          Ready to secure your date? Whether it's for your wedding, farewell, or
          a special event, I'm here to help you look your best.
        </p>
        <div
          class="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4"
        >
          <Button
            href={whatsappLink}
            size="lg"
            class="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            WhatsApp Me
            <MessageCircle class="ml-2 size-4" />
          </Button>
          <Button href="/contact" variant="outline" size="lg">
            Contact Form
          </Button>
        </div>
      </section>
    </div>

    <!-- Sidebar (Desktop Sticky) -->
    <aside class="hidden md:block">
      <div class="sticky top-24">
        {@render sidebarCTA()}
      </div>
    </aside>
  </div>
</div>

{#snippet guideCard(guide: import("$lib/data/guides").GuideData)}
  <a href={`/makeup-guides/${guide.slug}`} class="group block">
    <Card
      class="relative h-full transition-shadow duration-300 hover:shadow-md"
    >
      <CardHeader>
        <div class="flex items-center justify-between gap-4">
          <Badge class="border-transparent bg-brand/10 text-brand">
            {guide.category}
          </Badge>
          <span class="text-xs text-muted-foreground">
            {guide.read_time_minutes} min read
          </span>
        </div>
        <CardTitle class="mt-4 group-hover:text-brand transition-colors">
          {guide.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription class="leading-relaxed">
          {guide.description}
        </CardDescription>
        <div class="mt-6 flex items-center justify-between gap-4">
          <span
            class="flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            Read guide
            <ArrowRight class="size-3.5" />
          </span>
          <span
            class="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold"
          >
            Updated {guide.updated_at}
          </span>
        </div>
      </CardContent>
    </Card>
  </a>
{/snippet}

{#snippet sidebarCTA()}
  <Card class="border-brand/20 shadow-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Phone class="size-4 text-brand" />
        Book your makeup
      </CardTitle>
      <CardDescription>
        Send a message to check availability for your date.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-6">
      <ul class="grid gap-3">
        <li class="flex items-start gap-3 text-sm">
          <Check class="mt-0.5 size-4 shrink-0 text-brand" />
          <span>Bridal, Matric & Events</span>
        </li>
        <li class="flex items-start gap-3 text-sm">
          <Check class="mt-0.5 size-4 shrink-0 text-brand" />
          <span>Mobile Artist (Pretoria/Gauteng)</span>
        </li>
        <li class="flex items-start gap-3 text-sm">
          <Check class="mt-0.5 size-4 shrink-0 text-brand" />
          <span>Professional, lasting glams</span>
        </li>
      </ul>
      <div class="grid gap-3">
        <Button
          href={whatsappLink}
          class="w-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          WhatsApp Primary
          <MessageCircle class="ml-2 size-4" />
        </Button>
        <Button href="/contact" variant="outline" class="w-full">
          Contact Details
        </Button>
      </div>
    </CardContent>
  </Card>
{/snippet}

<style>
  .hero-stagger {
    animation: hero-fade-in 0.8s ease both;
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
    .hero-stagger {
      animation: none !important;
    }
  }
</style>
