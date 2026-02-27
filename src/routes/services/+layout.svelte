<script lang="ts">
  import { page } from "$app/state";
  import { BRAND_WORDMARK_LIGHT_ON_DARK_URL, BRAND_WORDMARK_PRIMARY_URL } from "$lib/config/brand.js";

  let { children } = $props();

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
      <a href="/" aria-label="Goat Accounting Home">
        <img src={BRAND_WORDMARK_PRIMARY_URL} alt="Goat Accounting" class="h-8 w-auto dark:hidden" />
        <img src={BRAND_WORDMARK_LIGHT_ON_DARK_URL} alt="Goat Accounting" class="hidden h-8 w-auto dark:block" />
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
        class="inline-flex items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90"
      >
        Book a Consultation
      </a>
    </div>
  </header>

  <main>
    {@render children()}
  </main>

  <footer class="border-t border-border/70 bg-card/35">
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p>&copy; {new Date().getFullYear()} Goat Accounting. Financial guidance with clarity.</p>
      <div class="flex items-center gap-4">
        <a class="transition-colors hover:text-foreground" href="/about">Advisor Profile</a>
        <a class="transition-colors hover:text-foreground" href="/services">Services</a>
        <a class="transition-colors hover:text-foreground" href="/booking">Book</a>
      </div>
    </div>
  </footer>
</div>
