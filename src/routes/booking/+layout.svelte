<script lang="ts">
  import { BRAND_WORDMARK_LIGHT_ON_DARK_URL, BRAND_WORDMARK_PRIMARY_URL } from "$lib/config/brand.js";

  let { children } = $props();
</script>

<div class="min-h-dvh bg-background text-foreground">
  <header class="border-b border-border/70 bg-background/95">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
      <a href="/" aria-label="Goat Accounting Home">
        <img src={BRAND_WORDMARK_PRIMARY_URL} alt="Goat Accounting" class="h-8 w-auto dark:hidden" />
        <img src={BRAND_WORDMARK_LIGHT_ON_DARK_URL} alt="Goat Accounting" class="hidden h-8 w-auto dark:block" />
      </a>
      <a href="/" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        Back to Website
      </a>
    </div>
  </header>

  <main>{@render children()}</main>
</div>
