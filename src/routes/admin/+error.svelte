<script lang="ts">
	import { page } from '$app/state';
	let { status } = $props();
	const message = $derived(status === 403 ? 'You do not have access to this page.' : 'The staff page could not be loaded.');
</script>

<svelte:head>
	<title>Staff page unavailable | Goat Accounting</title>
</svelte:head>

<section class="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center py-12">
	<h1 class="font-display min-w-0 break-words text-3xl font-semibold tracking-tight">Page unavailable</h1>
	<p role="alert" class="mt-4 border-l-2 border-destructive pl-3 text-sm leading-6">{message}</p>
	<div class="mt-6 flex flex-wrap gap-3">
		<a
			href={`${page.url.pathname}${page.url.search}`}
			data-sveltekit-reload
			class="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
		>
			Try again
		</a>
		<a
			href="/admin/login"
			class="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
		>
			Go to sign-in
		</a>
	</div>
</section>
