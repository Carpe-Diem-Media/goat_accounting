<script lang="ts">
	let { data } = $props();
	const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
	const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 });
	const range = (minimum: number, maximum: number) => `${money.format(minimum / 100)} – ${money.format(maximum / 100)}`;
</script>

<svelte:head>
	<title>Lead {data.lead.full_name} | Goat Accounting staff</title>
</svelte:head>

<section>
	<a href="/admin/leads" class="text-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Back to leads</a>
	<div class="mt-4 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-display min-w-0 break-words text-3xl font-semibold tracking-tight">Lead details</h1>
			<p class="mt-1 min-w-0 break-words text-lg font-medium">{data.lead.full_name}</p>
			<p class="mt-2 text-sm text-muted-foreground">Saved {date(data.lead.created_at)}</p>
		</div>
		<span class="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium capitalize">{data.lead.state.toLowerCase().replaceAll('_', ' ')}</span>
	</div>

	<div class="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr]">
		<section class="rounded-lg border border-border bg-card p-5 sm:p-6">
			<h2 class="font-display min-w-0 break-words text-xl font-semibold">Contact details</h2>
			<dl class="mt-4 space-y-4 text-sm">
				<div><dt class="text-muted-foreground">Email</dt><dd class="mt-1 break-all font-medium"><a class="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`mailto:${data.lead.email}`}>{data.lead.email}</a></dd></div>
				<div><dt class="text-muted-foreground">Phone</dt><dd class="mt-1 font-medium">{#if data.lead.phone}<a class="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`tel:${data.lead.phone}`}>{data.lead.phone}</a>{:else}Not provided{/if}</dd></div>
				<div><dt class="text-muted-foreground">Business</dt><dd class="mt-1 font-medium">{data.lead.business_name ?? 'Not provided'}</dd></div>
				<div><dt class="text-muted-foreground">Preferred contact</dt><dd class="mt-1 font-medium capitalize">{data.lead.preferred_contact_method ?? 'Not specified'}</dd></div>
				<div><dt class="text-muted-foreground">Contact consent</dt><dd class="mt-1 font-medium">Recorded {date(data.lead.contact_consent_at)}</dd></div>
			</dl>
		</section>

		<section class="rounded-lg border border-border bg-card p-5 sm:p-6">
			<h2 class="font-display min-w-0 break-words text-xl font-semibold">Related estimate</h2>
			{#if data.estimate}
				<p class="mt-4 text-sm text-muted-foreground">Reference {data.estimate.public_ref}. State: {data.estimate.state.toLowerCase()}.</p>
			<p class="mt-2 text-sm capitalize">{data.estimate.calculator_type}</p>
			<dl class="mt-4 space-y-3 text-sm">
				<div><dt class="text-muted-foreground">Catch-up range</dt><dd class="mt-1 font-medium">{range(data.estimate.catchup_min_cents, data.estimate.catchup_max_cents)}</dd></div>
				<div><dt class="text-muted-foreground">Ongoing range</dt><dd class="mt-1 font-medium">{range(data.estimate.ongoing_min_cents, data.estimate.ongoing_max_cents)}</dd></div>
				<div><dt class="text-muted-foreground">Created</dt><dd class="mt-1 font-medium">{date(data.estimate.created_at)}</dd></div>
			</dl>
			<a class="mt-5 inline-flex text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href={`/admin/estimates/${data.estimate.id}`}>View estimate</a>
			{:else}
				<p class="mt-3 text-sm text-muted-foreground">The related estimate is no longer available.</p>
				<a href="/admin/leads" class="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Return to leads</a>
			{/if}
		</section>
	</div>
</section>
