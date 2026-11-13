<script lang="ts">
	import { navigating, page } from '$app/state';
	let { children, data } = $props();
	const onLoginPage = $derived(
		page.url.pathname.startsWith('/admin/login') || page.url.pathname === '/admin/auth/callback'
	);
	const isLoading = $derived(navigating.to?.url.pathname.startsWith('/admin') ?? false);
</script>

<svelte:head>
	<title>Staff admin | Goat Accounting</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

{#if onLoginPage}
	{@render children()}
{:else}
	<div class="min-h-screen bg-background text-foreground">
		<a
			href="#admin-main"
			class="sr-only z-50 rounded-md bg-background px-4 py-3 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
		>
			Skip to content
		</a>
		<header class="border-b border-border bg-card">
			<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
				<a class="font-display text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px" href="/admin/estimates">
					Goat Accounting <span class="font-sans text-sm font-medium text-muted-foreground">Staff</span>
				</a>
				<nav aria-label="Staff navigation" class="flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-4">
					{#if data.accessLabel}
						<span class="hidden text-sm text-muted-foreground sm:inline">{data.accessLabel}</span>
					{/if}
					{#if data.dashboardEnabled}
					<a
						href="/admin/dashboard"
						aria-current={page.url.pathname.startsWith('/admin/dashboard') ? 'page' : undefined}
						class="inline-flex min-h-11 items-center rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
					>Dashboard</a>
					{/if}
					{#if data.pricingNavigationVisible}
						<a
							href="/admin/pricing"
							aria-current={page.url.pathname.startsWith('/admin/pricing') ? 'page' : undefined}
							class="inline-flex min-h-11 items-center rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
						>Pricing</a>
					{/if}
					<a
						href="/admin/estimates"
						aria-current={page.url.pathname.startsWith('/admin/estimates') ? 'page' : undefined}
						class="inline-flex min-h-11 items-center rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
					>
						Estimates
					</a>
					<a
						href="/admin/leads"
						aria-current={page.url.pathname.startsWith('/admin/leads') ? 'page' : undefined}
						class="inline-flex min-h-11 items-center rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
					>
						Leads
					</a>
					<form method="POST" action="/admin/logout">
						<button
							type="submit"
							class="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
						>
							Sign out
						</button>
					</form>
				</nav>
			</div>
		</header>
		<main id="admin-main" class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<p class="sr-only">Signed in with the {data.identity?.role ?? 'staff'} role.</p>
			{#if isLoading}
				<div class="space-y-5" role="status" aria-live="polite" aria-busy="true">
					<span class="sr-only">Loading staff page</span>
					<div class="h-9 w-48 rounded-md bg-muted motion-safe:animate-pulse"></div>
					<div class="h-12 w-full rounded-lg border border-border bg-card motion-safe:animate-pulse"></div>
					<div class="h-64 w-full rounded-lg border border-border bg-card motion-safe:animate-pulse"></div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
{/if}
