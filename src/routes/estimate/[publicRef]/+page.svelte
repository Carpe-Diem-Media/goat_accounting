<script lang="ts">
	import { onMount } from 'svelte';
	import { trackEstimatorEvent } from '$lib/estimator-analytics';
	import ContactPanel from '$lib/ui/estimator/contact-panel.svelte';
	import { goto } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let estimate = $derived(data.estimate);
	let resultTitle = $derived(estimate.calculatorType === 'business' ? 'Your business estimate' : estimate.calculatorType === 'personal' ? 'Your personal tax estimate' : 'Your business and personal estimate');
	type EstimateLifecycleState = PageProps['data']['estimate']['state'];
	type LifecycleNotice = Readonly<{
		message: string;
		role: 'alert' | 'status';
		tone: 'invalidated' | 'historical';
	}>;
	const lifecycleNotices: Record<EstimateLifecycleState, LifecycleNotice | null> = {
		VALID: null,
		VOIDED: {
			message: 'The saved amounts below have been invalidated. Do not rely on these saved amounts. This result remains available for your records.',
			role: 'alert',
			tone: 'invalidated'
		},
		SUPERSEDED: {
			message: 'This saved result has been superseded. The amounts below belong to an earlier estimate.',
			role: 'status',
			tone: 'historical'
		}
	};
	let lifecycleNotice = $derived(lifecycleNotices[estimate.state]);
	let pdfDownloadPending = $state(false);
	let pdfDownloadError = $state(false);

	const confidenceLabels = {
		high: 'High',
		good: 'Good',
		preliminary: 'Preliminary'
	} as const;

	function formatRand(amount: number): string {
		return new Intl.NumberFormat('en-ZA', {
			style: 'currency',
			currency: 'ZAR',
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatRange(range: Readonly<{ minCents: number; maxCents: number }>): string {
		const minRand = Math.floor(range.minCents / 100);
		const maxRand = Math.ceil(range.maxCents / 100);
		return `${formatRand(minRand)} – ${formatRand(maxRand)}`;
	}

	async function downloadEstimatePdf(event: MouseEvent): Promise<void> {
		event.preventDefault();
		if (pdfDownloadPending) return;
		pdfDownloadPending = true;
		pdfDownloadError = false;
		try {
			const response = await fetch(`/api/estimates/${estimate.publicRef}/pdf`);
			if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/pdf') {
				throw new Error('PDF response was unsuccessful');
			}
			const pdf = await response.blob();
			if (pdf.size < 5 || await pdf.slice(0, 5).text() !== '%PDF-') throw new Error('PDF response was invalid');
			const url = URL.createObjectURL(pdf);
			const link = document.createElement('a');
			link.href = url;
			link.download = `estimate-${estimate.publicRef}.pdf`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			trackEstimatorEvent('estimate_pdf_downloaded', { calculator_type: estimate.calculatorType });
		} catch {
			pdfDownloadError = true;
		} finally {
			pdfDownloadPending = false;
		}
	}

	onMount(() => {
		trackEstimatorEvent('estimate_result_viewed', { calculator_type: estimate.calculatorType, confidence: estimate.confidence });
		// A result is available only after the server loader has returned the saved DTO.
		try {
			sessionStorage.removeItem('goat-accounting:business-estimator:v1');
		} catch {
			// The rendered result still comes from the saved server DTO when storage is disabled.
		}
	});
</script>

<svelte:head>
	<title>Your estimate | Goat Accounting</title>
	<meta name="description" content="Your saved accounting and tax estimate from Goat Accounting." />
	<meta property="og:title" content="Your estimate | Goat Accounting" />
</svelte:head>

<article class="space-y-8" aria-labelledby="question-title">
	<header class="space-y-3">
		<h1 id="question-title" class="min-w-0 [overflow-wrap:break-word] font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
			{resultTitle}
		</h1>
		<p class="max-w-2xl text-base leading-7 text-muted-foreground">
			This estimate is based on your answers and the saved pricing model. You can review the catch-up work and monthly support below.
		</p>
		<p class="text-xs text-muted-foreground">Reference <code class="font-mono">{estimate.publicRef}</code></p>
	</header>
	{#if lifecycleNotice}
		<section
			role={lifecycleNotice.role}
			aria-labelledby="lifecycle-notice-heading"
			class={lifecycleNotice.tone === 'invalidated'
				? 'rounded-xl border-2 border-destructive bg-destructive/10 p-5 text-destructive sm:p-6'
				: 'rounded-xl border border-border border-l-4 border-l-primary bg-muted p-5 text-foreground sm:p-6'}
		>
			{#if estimate.state === 'VOIDED'}
				<h2 id="lifecycle-notice-heading" class="font-display text-xl font-semibold break-words min-w-0">This estimate has been invalidated</h2>
			{:else}
				<h2 id="lifecycle-notice-heading" class="font-display text-xl font-semibold break-words min-w-0">Historical estimate</h2>
			{/if}
			<p class="mt-2 text-sm leading-6">{lifecycleNotice.message}</p>
		</section>
	{/if}

	<section aria-label="Estimate ranges" class="grid gap-4 sm:grid-cols-2">
		<div class="rounded-xl border border-border bg-card p-5 sm:p-6">
			<p class="text-sm font-medium text-muted-foreground">Catch-up work</p>
			<p class="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
				{formatRange(estimate.catchup)}
			</p>
			<p class="mt-2 text-sm leading-6 text-muted-foreground">Once-off work to bring records and compliance up to date.</p>
		</div>
		<div class="rounded-xl border border-border bg-card p-5 sm:p-6">
			<p class="text-sm font-medium text-muted-foreground">Ongoing monthly support</p>
			<p class="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
				{formatRange(estimate.ongoing)}
			</p>
			<p class="mt-2 text-sm leading-6 text-muted-foreground">Recurring monthly services based on the support you selected.</p>
		</div>
	</section>

	<section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="confidence-heading">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h2 id="confidence-heading" class="font-display text-xl font-medium text-foreground">Estimate confidence</h2>
				<p class="mt-1 text-sm leading-6 text-muted-foreground">{confidenceLabels[estimate.confidence]} confidence</p>
			</div>
			<span class="inline-flex w-fit items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground">
				{confidenceLabels[estimate.confidence]}
			</span>
		</div>
		{#if estimate.confidenceReasons.length > 0}
			<ul class="mt-4 space-y-2 border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
				{#each estimate.confidenceReasons as reason (reason)}
					<li class="flex gap-2"><span aria-hidden="true" class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span><span>{reason}</span></li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if estimate.manualReviewRequired}
		<section role="status" aria-labelledby="review-heading" class="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950 sm:p-6">
			<h2 id="review-heading" class="font-display text-xl font-medium">A professional review is needed</h2>
			<p class="mt-2 text-sm leading-6">The estimate is still available, but your request needs review before a final quote can be confirmed.</p>
			<ul class="mt-4 space-y-3 border-t border-amber-300/70 pt-4 text-sm leading-6">
				{#each estimate.reviewFlags as flag}
					<li>
						<p class="font-semibold">{flag.label}</p>
						<p>{flag.reason}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="space-y-6" aria-labelledby="included-heading">
		<div class="space-y-1">
			<h2 id="included-heading" class="font-display text-2xl font-medium text-foreground">What is included</h2>
			<p class="text-sm leading-6 text-muted-foreground">The explanation beside each item shows how it relates to your request.</p>
		</div>

		<div class="space-y-5">
			<section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="catchup-items-heading">
				<h3 id="catchup-items-heading" class="font-semibold text-foreground">Catch-up work</h3>
				{#if estimate.catchup.lineItems.filter((item) => item.category === 'catchup').length > 0}
					<ul class="mt-3 divide-y divide-border">
						{#each estimate.catchup.lineItems.filter((item) => item.category === 'catchup') as item}
							<li class="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-6">
								<div class="space-y-1">
									<p class="text-sm font-medium text-foreground">{item.label}{#if estimate.calculatorType === 'both'} <span class="text-muted-foreground">({item.branch === 'business' ? 'Business' : 'Personal tax'})</span>{/if}</p>
									<p class="max-w-xl text-sm leading-6 text-muted-foreground">{item.explanation}</p>
								</div>
								<p class="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatRange(item)}</p>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-3 text-sm leading-6 text-muted-foreground">No separate catch-up items were returned.</p>
				{/if}
			</section>

			<section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="ongoing-items-heading">
				<h3 id="ongoing-items-heading" class="font-semibold text-foreground">Ongoing monthly services</h3>
				{#if estimate.ongoing.lineItems.filter((item) => item.category === 'ongoing').length > 0}
					<ul class="mt-3 divide-y divide-border">
						{#each estimate.ongoing.lineItems.filter((item) => item.category === 'ongoing') as item}
							<li class="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-6">
								<div class="space-y-1">
									<p class="text-sm font-medium text-foreground">{item.label}{#if estimate.calculatorType === 'both'} <span class="text-muted-foreground">({item.branch === 'business' ? 'Business' : 'Personal tax'})</span>{/if}</p>
									<p class="max-w-xl text-sm leading-6 text-muted-foreground">{item.explanation}</p>
								</div>
								<p class="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatRange(item)}</p>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-3 text-sm leading-6 text-muted-foreground">No separate monthly service items were returned.</p>
				{/if}
			</section>
		</div>
	</section>

	<aside class="rounded-lg border-l-4 border-primary bg-muted px-4 py-4 text-sm leading-6 text-muted-foreground" aria-label="Estimate disclaimer">
		<p class="font-semibold text-foreground">Indicative estimate, not a final quote.</p>
		<p class="mt-1">The final scope and fee may change after a professional reviews your records and confirms the work required.</p>
	</aside>

	<div class="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm leading-6 text-muted-foreground">No contact details were needed to view this estimate.</p>
		<a
			href={`/api/estimates/${estimate.publicRef}/pdf`}
			onclick={downloadEstimatePdf}
			aria-disabled={pdfDownloadPending}
			class="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			{pdfDownloadPending ? 'Preparing PDF…' : 'Download PDF'}
		</a>
		{#if pdfDownloadError}<p role="status" class="text-sm text-destructive">The PDF could not be downloaded. Please try again.</p>{/if}
		<button
			type="button"
			onclick={() => goto('/estimate?new=1')}
			class="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
		>
			Start a new estimate
		</button>
	</div>
	{#if data.contact && estimate.state === 'VALID'}
		{#key estimate.publicRef}<ContactPanel publicRef={estimate.publicRef} siteKey={data.contact.siteKey} showBusinessName={estimate.calculatorType !== 'personal'} />{/key}
	{/if}
</article>
