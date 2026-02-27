<script lang="ts">
  import "./layout.css";
  import { SITE_URL } from "$lib/config/site.js";
  import { BRAND_WORDMARK_PRIMARY_URL } from "$lib/config/brand.js";

  let { children } = $props();

  const organizationSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: "Goat Accounting",
    url: SITE_URL,
    logo: BRAND_WORDMARK_PRIMARY_URL,
    telephone: "+27816098157",
    email: "hello@goataccounting.com",
  });
</script>

<svelte:head>
  <meta name="robots" content="index,follow" />
  <meta name="author" content="Goat Accounting" />
  <meta property="og:site_name" content="Goat Accounting" />
  <meta property="og:locale" content="en_ZA" />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<script type="application/ld+json">${organizationSchema}</script>`}
</svelte:head>

{@render children()}
