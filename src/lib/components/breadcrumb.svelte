<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  interface BreadcrumbItem {
    label: string;
    href?: string;
  }

  let { items }: { items: BreadcrumbItem[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="mx-auto max-w-5xl px-4 pt-6">
  <ol class="flex items-center gap-1.5 text-sm text-muted-foreground">
    {#each items as item, i}
      {#if i > 0}
        <li aria-hidden="true"><ChevronRight class="size-3.5" /></li>
      {/if}
      <li>
        {#if item.href}
          <a href={item.href} class="transition-colors hover:text-foreground">{item.label}</a>
        {:else}
          <span class="font-medium text-foreground">{item.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
