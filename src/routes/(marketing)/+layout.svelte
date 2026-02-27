<script lang="ts">
  import { page } from "$app/state";
  import Menu from "@lucide/svelte/icons/menu";
  import X from "@lucide/svelte/icons/x";

  let { children } = $props();
  let mobileMenuOpen = $state(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/services", label: "Services" },
  ] as const;

  const isActive = (href: string, pathname: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };
</script>

<div class="min-h-dvh bg-background text-foreground">
  <header class="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
      <a href="/" aria-label="Goat Accounting Home" onclick={() => (mobileMenuOpen = false)}>
        <img src="/images/ui/goat-logo-icon.webp" alt="Goat Accounting Logo" class="h-10 w-auto sm:h-12" loading="eager" decoding="async" />
      </a>

      <nav class="hidden items-center gap-8 text-sm font-medium md:flex">
        {#each navLinks as link}
          <a
            href={link.href}
            class={isActive(link.href, page.url.pathname)
              ? "text-foreground"
              : "text-muted-foreground transition-colors hover:text-foreground"}
          >
            {link.label}
          </a>
        {/each}
      </nav>

      <a
        href="/booking"
        class="hidden items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-primary-600 active:scale-95 md:inline-flex"
      >
        Book a Consultation
      </a>

      <button
        type="button"
        class="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent/30 md:hidden"
        aria-controls="mobile-nav"
        aria-expanded={mobileMenuOpen}
        aria-label="Toggle navigation menu"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        {#if mobileMenuOpen}
          <X class="size-5" />
        {:else}
          <Menu class="size-5" />
        {/if}
      </button>
    </div>

    {#if mobileMenuOpen}
      <div id="mobile-nav" class="border-t border-border/70 bg-background/95 px-4 pb-4 pt-3 md:hidden sm:px-6">
        <nav class="flex flex-col gap-1 text-sm font-medium">
          {#each navLinks as link}
            <a
              href={link.href}
              class={isActive(link.href, page.url.pathname)
                ? "rounded-md px-3 py-2 text-foreground"
                : "rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"}
              onclick={() => (mobileMenuOpen = false)}
            >
              {link.label}
            </a>
          {/each}
        </nav>
        <a
          href="/booking"
          class="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:bg-primary-600 active:scale-95"
          onclick={() => (mobileMenuOpen = false)}
        >
          Book a Consultation
        </a>
      </div>
    {/if}
  </header>

  <main>
    {@render children()}
  </main>

  <footer class="border-t border-border/70 bg-card/35">
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div class="flex flex-col gap-2">
        <img src="/images/ui/goat-logo-landscape.webp" alt="Goat Accounting Logo" class="h-12 w-auto sm:h-16" loading="lazy" decoding="async" />
        <p>&copy; {new Date().getFullYear()} Goat Accounting. Financial guidance with clarity.</p>
      </div>
      <div class="flex items-center gap-4">
        <a class="transition-colors hover:text-foreground" href="/about">Advisor Profile</a>
        <a class="transition-colors hover:text-foreground" href="/services">Services</a>
        <a class="transition-colors hover:text-foreground" href="/booking">Book</a>
      </div>
    </div>
  </footer>
</div>
