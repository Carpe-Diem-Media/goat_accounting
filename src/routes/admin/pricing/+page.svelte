<script lang="ts">
 let {data,form} = $props();
</script>
<svelte:head><title>Pricing | Goat Accounting staff</title></svelte:head>
<section>
 <h1 class="font-display text-3xl font-semibold tracking-tight">Pricing models</h1>
 <p class="mt-2 text-sm text-muted-foreground">Drafts can be edited. Active and retired models are read-only.</p>
 <p class="mt-2 text-sm text-muted-foreground">Activation is unavailable until the independent approval workflow is complete.</p>
 {#if form?.message}<p role="alert" class="mt-4 rounded-md border border-border p-3 text-sm">{form.message}</p>{/if}
 {#if data.models.length === 0}
  <p class="mt-6 rounded-lg border border-border bg-card p-5">No pricing models are available.</p>
 {:else}
  <div class="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
   <table class="w-full min-w-[600px] text-left text-sm"><caption class="sr-only">Pricing models</caption>
    <thead class="bg-muted/70"><tr><th scope="col" class="p-3">Version</th><th scope="col" class="p-3">State</th><th scope="col" class="p-3">Created</th><th scope="col" class="p-3">Clone</th></tr></thead>
    <tbody class="divide-y divide-border">{#each data.models as model (model.id)}
     <tr><td class="p-3"><a class="underline focus-visible:outline-2 focus-visible:outline-ring" href={`/admin/pricing/${model.id}`}>{model.version}</a></td><td class="p-3">{model.state}</td><td class="p-3">{new Date(model.created_at).toLocaleDateString('en-ZA')}</td><td class="p-3">
      {#if model.state !== 'DRAFT'}<form method="POST" action="?/clone" class="flex flex-wrap items-end gap-2"><input type="hidden" name="sourceId" value={model.id} /><label class="text-xs">New version <input required maxlength="80" name="version" placeholder="1.2.3" class="block w-32 rounded border border-foreground/60 bg-background px-2 py-2 text-sm" /></label><button class="min-h-11 rounded border border-border px-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">Clone</button></form>{/if}
     </td></tr>
    {/each}</tbody>
   </table>
  </div>
 {/if}
 <nav aria-label="Pricing model pages" class="mt-5 flex items-center justify-between gap-3">
  {#if data.page>1}<a class="rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" href={`/admin/pricing?page=${data.page-1}`}>Previous page</a>{:else}<span></span>{/if}
  {#if data.hasNext}<a class="rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" href={`/admin/pricing?page=${data.page+1}`}>Next page</a>{/if}
 </nav>
</section>
