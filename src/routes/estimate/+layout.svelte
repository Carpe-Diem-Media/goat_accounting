<script lang="ts">
	import { BRAND_WORDMARK_PRIMARY_URL } from '$lib/config/brand.js';
	let { children } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<a
	href="#question-title"
	class="sr-only fixed left-4 top-4 z-50 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors active:bg-primary/80 focus:not-sr-only focus:outline-2 focus:outline-offset-2 focus:outline-ring"
>
	Skip to questionnaire
</a>

<div class="min-h-dvh bg-background text-foreground">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<a href="/" aria-label="Goat Accounting home" class="inline-flex min-h-10 items-center rounded-sm transition-opacity active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
				<img src={BRAND_WORDMARK_PRIMARY_URL} alt="Goat Accounting" class="h-8 w-auto max-w-44 object-contain" />
			</a>
			<p class="text-right text-sm font-medium text-muted-foreground">Business estimate</p>
		</div>
	</header>

	<main id="main-content" class="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
		{@render children()}
	</main>

	<footer class="border-t border-border bg-card">
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-5 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<p>See your estimate before sharing contact details.</p>
			<p>Goat Accounting · South Africa</p>
		</div>
	</footer>
</div>
