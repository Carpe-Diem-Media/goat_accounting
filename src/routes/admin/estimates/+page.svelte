<script lang="ts">
	let { data } = $props();
	const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 });
	const range = (minimum: number, maximum: number) => `${money.format(minimum / 100)} – ${money.format(maximum / 100)}`;
	const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
</script>

<svelte:head>
	<title>Estimates | Goat Accounting staff</title>
</svelte:head>

<section>
	<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="font-display min-w-0 break-words text-3xl font-semibold tracking-tight">Estimates</h1>
		</div>
		<p class="text-sm text-muted-foreground">Page {data.page}</p>
	</div>

	{#if data.estimates.length === 0}
		<div class="rounded-lg border border-border bg-card px-5 py-10 text-center">
			<h2 class="min-w-0 break-words text-lg font-semibold">No estimates to show</h2>
			<p class="mt-2 text-sm text-muted-foreground">New estimates will appear here after they are saved.</p>
			<a href={`/admin/estimates?page=${data.page}`} data-sveltekit-reload class="mt-4 inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Refresh estimates</a>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border bg-card">
			<div class="overflow-x-auto">
				<table class="w-full min-w-[760px] border-collapse text-left text-sm">
					<caption class="sr-only">Saved estimates in newest-first order</caption>
					<thead class="bg-muted/70 text-xs font-semibold text-muted-foreground">
						<tr>
							<th scope="col" class="px-4 py-3">Reference</th>
							<th scope="col" class="px-4 py-3">Type</th>
							<th scope="col" class="px-4 py-3">Catch-up range</th>
							<th scope="col" class="px-4 py-3">Ongoing range</th>
							<th scope="col" class="px-4 py-3">Confidence</th>
							<th scope="col" class="px-4 py-3">Created</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each data.estimates as estimate (estimate.id)}
							<tr class="align-top hover:bg-muted/40">
								<td class="px-4 py-3">
									<a class="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/estimates/${estimate.id}`}>
										{estimate.public_ref}
									</a>
									{#if estimate.manual_review_required}
										<span class="mt-1 block text-xs text-muted-foreground">Manual review</span>
									{/if}
								</td>
								<td class="px-4 py-3 capitalize">{estimate.calculator_type}</td>
								<td class="whitespace-nowrap px-4 py-3">{range(estimate.catchup_min_cents, estimate.catchup_max_cents)}</td>
								<td class="whitespace-nowrap px-4 py-3">{range(estimate.ongoing_min_cents, estimate.ongoing_max_cents)}</td>
								<td class="px-4 py-3 capitalize">{estimate.confidence}</td>
								<td class="whitespace-nowrap px-4 py-3 text-muted-foreground">{date(estimate.created_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<nav aria-label="Estimate pages" class="mt-5 flex items-center justify-between gap-3">
		{#if data.page > 1}
			<a class="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/estimates?page=${data.page - 1}`}>Previous page</a>
		{:else}
			<span></span>
		{/if}
		{#if data.hasNext}
			<a class="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/estimates?page=${data.page + 1}`}>Next page</a>
		{/if}
	</nav>
</section>
