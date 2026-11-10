<script lang="ts">
  import { page } from '$app/state';
</script>
<svelte:head><title>Dashboard unavailable | Goat Accounting staff</title></svelte:head>
<section role="alert" class="space-y-4">
  <h1 class="font-display text-3xl font-semibold text-foreground">Dashboard unavailable</h1>
  <p class="max-w-prose text-sm leading-6 text-muted-foreground">{page.status === 403 ? 'Access denied.' : 'Dashboard unavailable. Please try again.'}</p>
  <a href="/admin/dashboard" class="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Try again</a>
</section>
