<script lang="ts">
	let { data } = $props();
	const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
</script>

<svelte:head>
	<title>Leads | Goat Accounting staff</title>
</svelte:head>

<section>
	<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="font-display min-w-0 break-words text-3xl font-semibold tracking-tight">Leads</h1>
		</div>
		<p class="text-sm text-muted-foreground">Page {data.page}</p>
	</div>

	{#if data.leads.length === 0}
		<div class="rounded-lg border border-border bg-card px-5 py-10 text-center">
			<h2 class="min-w-0 break-words text-lg font-semibold">No leads to show</h2>
			<p class="mt-2 text-sm text-muted-foreground">Saved lead requests will appear here.</p>
			<a href={`/admin/leads?page=${data.page}`} data-sveltekit-reload class="mt-4 inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Refresh leads</a>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border bg-card">
			<div class="overflow-x-auto">
				<table class="w-full min-w-[680px] border-collapse text-left text-sm">
					<caption class="sr-only">Saved leads in newest-first order</caption>
					<thead class="bg-muted/70 text-xs font-semibold text-muted-foreground">
						<tr>
							<th scope="col" class="px-4 py-3">Name</th>
							<th scope="col" class="px-4 py-3">Business</th>
							<th scope="col" class="px-4 py-3">Email</th>
							<th scope="col" class="px-4 py-3">State</th>
							<th scope="col" class="px-4 py-3">Created</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each data.leads as lead (lead.id)}
							<tr class="align-top hover:bg-muted/40">
								<td class="px-4 py-3">
									<a class="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/leads/${lead.id}`}>
										{lead.full_name}
									</a>
								</td>
								<td class="px-4 py-3">{lead.business_name ?? '—'}</td>
								<td class="px-4 py-3"><a class="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`mailto:${lead.email}`}>{lead.email}</a></td>
								<td class="px-4 py-3 capitalize">{lead.state.toLowerCase().replaceAll('_', ' ')}</td>
								<td class="whitespace-nowrap px-4 py-3 text-muted-foreground">{date(lead.created_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<nav aria-label="Lead pages" class="mt-5 flex items-center justify-between gap-3">
		{#if data.page > 1}
			<a class="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/leads?page=${data.page - 1}`}>Previous page</a>
		{:else}
			<span></span>
		{/if}
		{#if data.hasNext}
			<a class="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/leads?page=${data.page + 1}`}>Next page</a>
		{/if}
	</nav>
</section>
