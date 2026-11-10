<script lang="ts">
	let { data, form } = $props();
	const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
	const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 });
	const range = (minimum: number, maximum: number) => `${money.format(minimum / 100)} – ${money.format(maximum / 100)}`;
	const stateLabel = (state: string) => state.toLowerCase().replaceAll('_', ' ');
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

	{#if data.canManage}
		<section class="mt-7 rounded-lg border border-border bg-card p-5 sm:p-6" aria-labelledby="lead-transition-heading">
			<h2 id="lead-transition-heading" class="font-display min-w-0 break-words text-xl font-semibold">Update lead state</h2>
			{#if data.availableTransitions.length > 0}
				<form method="POST" action="?/transition" class="mt-4 grid gap-4 sm:grid-cols-2">
					<input type="hidden" name="expectedState" value={data.lead.state} />
					{#if form?.message}
						<p class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2" role="alert">{form.message}</p>
					{/if}
					<div>
						<label for="lead-target-state" class="text-sm font-medium">Move to</label>
						<select id="lead-target-state" name="targetState" required class="mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">
							<option value="" disabled selected={!form?.targetState}>Choose a state</option>
							{#each data.availableTransitions as state}
								<option value={state} selected={form?.targetState === state}>{stateLabel(state)}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="lead-transition-reason" class="text-sm font-medium">Reason</label>
						<input id="lead-transition-reason" name="reason" type="text" value={form?.reason ?? ''} aria-describedby="lead-transition-reason-help" class="mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
						<p id="lead-transition-reason-help" class="mt-1 text-xs text-muted-foreground">Required when moving the lead to a closed state.</p>
					</div>
					<div class="sm:col-span-2">
						<label for="lead-transition-note" class="text-sm font-medium">Note <span class="font-normal text-muted-foreground">(optional)</span></label>
						<textarea id="lead-transition-note" name="note" rows="3" maxlength="2000" class="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{form?.note ?? ''}</textarea>
					</div>
					<div class="sm:col-span-2">
						<button type="submit" class="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Save state change</button>
					</div>
				</form>
			{:else}
				<p class="mt-3 text-sm text-muted-foreground">No further state changes are available for this lead.</p>
			{/if}
		</section>
	{/if}

	<section class="mt-7 rounded-lg border border-border bg-card p-5 sm:p-6" aria-labelledby="lead-history-heading">
		<h2 id="lead-history-heading" class="font-display min-w-0 break-words text-xl font-semibold">Event history</h2>
		{#if data.events.length > 0}
			{#if data.events.some((event) => event.event_order === null)}
				<p class="mt-3 text-sm text-muted-foreground">Some older events predate sequence tracking, so their exact order cannot be reconstructed.</p>
			{/if}
			<ol class="mt-4 space-y-4">
				{#each data.events as event (event.id)}
					<li class="rounded-md border border-border bg-background p-4">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<p class="text-sm font-medium">
								{#if event.from_state}
									Moved from {stateLabel(event.from_state)} to {stateLabel(event.to_state)}
								{:else}
									Lead created as {stateLabel(event.to_state)}
								{/if}
							</p>
							<time datetime={event.created_at} class="text-sm text-muted-foreground">{date(event.created_at)}</time>
						</div>
						<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
							<div>
								<dt class="text-muted-foreground">Actor user ID</dt>
								<dd class="mt-1 break-all font-mono text-xs">{event.actor_user_id ?? 'System'}</dd>
							</div>
							{#if event.reason_code && event.reason_code !== 'state_changed' && event.reason_code !== 'lead_created'}
								<div>
									<dt class="text-muted-foreground">Reason</dt>
									<dd class="mt-1 break-words">{event.reason_code}</dd>
								</div>
							{/if}
							{#if event.note}
								<div class="sm:col-span-2">
									<dt class="text-muted-foreground">Note</dt>
									<dd class="mt-1 whitespace-pre-wrap break-words">{event.note}</dd>
								</div>
							{/if}
						</dl>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="mt-3 text-sm text-muted-foreground">No event history is available for this lead.</p>
		{/if}
	</section>
</section>
