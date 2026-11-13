<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Continue to password setup | Goat Accounting</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<section class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
		<a href="/admin/login" class="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Staff sign-in</a>
		<h1 class="font-display mt-6 min-w-0 break-words text-3xl font-semibold tracking-tight">
			{data.kind === 'invite' ? 'Accept your staff invitation' : 'Continue to password reset'}
		</h1>
		<p class="mt-2 text-sm leading-6 text-muted-foreground">
			{data.kind === 'invite'
				? 'Continue to verify your invitation and choose a password for your staff account.'
				: 'Continue to verify your reset request and choose a new password.'}
		</p>
		<p role="status" class="mt-5 border-l-2 border-primary pl-3 text-sm leading-6 text-foreground">
			This link can be used once. If it has expired, request a new one.
		</p>
		<form method="POST" class="mt-6">
			<button
				type="submit"
				class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
			>
				Continue
			</button>
		</form>
	</section>
</main>
