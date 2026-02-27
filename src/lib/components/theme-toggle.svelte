<script lang="ts">
  import { onMount } from 'svelte';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import { Button } from '$lib/components/ui/button/index.js';

  let dark = $state(false);
  let mounted = $state(false);

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
    mounted = true;
  });

  function toggle() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
</script>

{#if mounted}
  <Button variant="ghost" size="icon-sm" onclick={toggle} aria-label="Toggle theme">
    {#if dark}
      <Sun class="size-4" />
    {:else}
      <Moon class="size-4" />
    {/if}
  </Button>
{:else}
  <div class="size-8"></div>
{/if}
