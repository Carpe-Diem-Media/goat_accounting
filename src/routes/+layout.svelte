<script lang="ts">
  import "./layout.css";
  import { beforeNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { SITE_URL } from "$lib/config/site.js";
  import { BRAND_WORDMARK_PRIMARY_URL } from "$lib/config/brand.js";
  import { shouldReloadForAdminTransition } from "$lib/navigation/admin-document-boundary";

  let { children } = $props();

  const organizationSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: "Goat Accounting",
    url: SITE_URL,
    logo: BRAND_WORDMARK_PRIMARY_URL,
    telephone: "+27828198890",
    email: "hello@goataccounting.co.za",
  });

  const isAdmin = $derived(page.url.pathname.startsWith("/admin"));
  const isEstimator = $derived(page.url.pathname === "/estimate" || page.url.pathname.startsWith("/estimate/"));

  beforeNavigate(({ from, to, cancel }) => {
    if (!to || !shouldReloadForAdminTransition(from?.url ?? null, to.url)) return;

    cancel();
    window.location.assign(to.url);
  });
</script>

<svelte:head>
  <meta name="robots" content={isAdmin ? "noindex,nofollow" : "index,follow"} />
  {#if !isAdmin}
    <meta name="author" content="Goat Accounting" />
    <meta property="og:site_name" content="Goat Accounting" />
    <meta property="og:locale" content="en_ZA" />
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html `<script type="application/ld+json">${organizationSchema}</script>`}
  {/if}
</svelte:head>

{#if !isAdmin && !isEstimator}
  <noscript>
    <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KQ3W4DKN" title="" height="0" width="0" class="hidden"></iframe>
  </noscript>
{/if}

{@render children()}
