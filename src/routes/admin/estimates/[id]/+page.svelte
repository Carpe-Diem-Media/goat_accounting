<script lang="ts">
	let { data } = $props();
	const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
	const range = (minimum: number, maximum: number) => `${money.format(minimum / 100)} – ${money.format(maximum / 100)}`;
	const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
</script>

<svelte:head>
	<title>Estimate {data.estimate.public_ref} | Goat Accounting staff</title>
</svelte:head>

<section>
	<a href="/admin/estimates" class="text-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Back to estimates</a>
	<div class="mt-4 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-display min-w-0 break-words text-3xl font-semibold tracking-tight">Estimate details</h1>
			<p class="mt-1 min-w-0 break-words text-lg font-medium">{data.estimate.public_ref}</p>
			<p class="mt-2 text-sm text-muted-foreground">Saved {date(data.estimate.created_at)}</p>
		</div>
		<span class="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium capitalize">{data.estimate.state.toLowerCase()}</span>
	</div>

	<div class="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-sm text-muted-foreground">Calculator</p>
			<p class="mt-1 font-semibold capitalize">{data.estimate.calculator_type}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-sm text-muted-foreground">Catch-up range</p>
			<p class="mt-1 font-semibold">{range(data.estimate.catchup_min_cents, data.estimate.catchup_max_cents)}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-sm text-muted-foreground">Ongoing range</p>
			<p class="mt-1 font-semibold">{range(data.estimate.ongoing_min_cents, data.estimate.ongoing_max_cents)}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-sm text-muted-foreground">Confidence</p>
			<p class="mt-1 font-semibold capitalize">{data.estimate.confidence}</p>
			{#if data.estimate.manual_review_required}<p class="mt-1 text-sm text-muted-foreground">Manual review required</p>{/if}
		</div>
	</div>

	{#if data.lead}
		<section class="mt-7 rounded-lg border border-border bg-card p-5">
			<h2 class="font-display min-w-0 break-words text-xl font-semibold">Lead</h2>
			<p class="mt-1 text-sm text-muted-foreground">{data.lead.full_name}. State: {data.lead.state.toLowerCase()}</p>
			<a href={`/admin/leads/${data.lead.id}`} class="mt-3 inline-flex text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">View lead details</a>
		</section>
	{/if}

	<section class="mt-7 rounded-lg border border-border bg-card p-5 sm:p-6">
		<h2 class="font-display min-w-0 break-words text-xl font-semibold">Estimate line items</h2>
		{#if data.estimate.estimate_line_items.length === 0}
			<p class="mt-3 text-sm text-muted-foreground">This estimate has no saved line items.</p>
			<a href="/admin/estimates" class="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Return to estimates</a>
		{:else}
			<div class="mt-4 overflow-x-auto">
				<table class="w-full min-w-[600px] border-collapse text-left text-sm">
					<thead class="border-b border-border text-xs font-semibold text-muted-foreground">
						<tr><th scope="col" class="py-3 pr-4">Item</th><th scope="col" class="py-3 pr-4">Branch</th><th scope="col" class="py-3 pr-4">Range</th><th scope="col" class="py-3">Explanation</th></tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each data.estimate.estimate_line_items as item (item.id)}
							<tr class="align-top">
								<td class="py-3 pr-4"><p class="font-medium">{item.label}</p><p class="mt-1 text-xs text-muted-foreground">{item.rule_code}</p></td>
								<td class="py-3 pr-4 capitalize">{item.branch}</td>
								<td class="whitespace-nowrap py-3 pr-4">{range(item.min_cents, item.max_cents)}</td>
								<td class="max-w-md py-3 text-muted-foreground">{item.explanation}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<details class="mt-5 rounded-lg border border-border bg-card p-5">
		<summary class="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Stored estimate snapshot</summary>
		<dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
			<div><dt class="text-muted-foreground">Pricing model version</dt><dd class="mt-1 break-all font-medium">{data.estimate.pricing_model_version}</dd></div>
			<div><dt class="text-muted-foreground">Engine version</dt><dd class="mt-1 break-all font-medium">{data.estimate.engine_version}</dd></div>
			<div><dt class="text-muted-foreground">Pricing model id</dt><dd class="mt-1 break-all font-medium">{data.estimate.pricing_model_id}</dd></div>
			<div><dt class="text-muted-foreground">Review flags</dt><dd class="mt-1 font-medium">{data.estimate.review_flag_codes.length ? data.estimate.review_flag_codes.join(', ') : 'None'}</dd></div>
		</dl>
		<h3 class="mt-5 text-sm font-semibold">Answers</h3>
		<pre class="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">{JSON.stringify(data.estimate.answers_snapshot, null, 2)}</pre>
		<h3 class="mt-5 text-sm font-semibold">Calculation</h3>
		<pre class="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">{JSON.stringify(data.estimate.calculation_snapshot, null, 2)}</pre>
		{#if data.estimate.free_text}
			<h3 class="mt-5 text-sm font-semibold">Additional notes</h3>
			<p class="mt-2 whitespace-pre-wrap text-sm leading-6">{data.estimate.free_text}</p>
		{/if}
		{#if data.estimate.review_reasons}
			<h3 class="mt-5 text-sm font-semibold">Review reasons</h3>
			<pre class="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">{JSON.stringify(data.estimate.review_reasons, null, 2)}</pre>
		{/if}
	</details>
</section>
