<script lang="ts">
  let { children } = $props();
</script>

<div class="min-h-dvh bg-background text-foreground">
  <header class="border-b border-border/70 bg-background/95">
    <div class="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
      <a href="/" aria-label="Goat Accounting Home">
        <img src="/images/ui/goat-logo-icon.webp" alt="Goat Accounting Logo" class="h-10 w-auto sm:h-12" loading="eager" decoding="async" />
      </a>
    </div>
  </header>

  <main>{@render children()}</main>
</div>
