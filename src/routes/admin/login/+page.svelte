<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Staff sign-in | Goat Accounting</title>
	<meta name="description" content="Sign in to the Goat Accounting staff area." />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<section class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
		<a href="/" class="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Goat Accounting</a>
		<h1 class="font-display mt-6 min-w-0 break-words text-3xl font-semibold tracking-tight">Staff sign-in</h1>
		<p class="mt-2 text-sm leading-6 text-muted-foreground">Use your invited staff account to continue.</p>

		{#if !data.configured}
			<p role="status" class="mt-5 border-l-2 border-primary pl-3 text-sm leading-6 text-muted-foreground">
				Staff sign-in is unavailable until the approved project connection is configured.
			</p>
		{/if}

		{#if data.linkMessage}
			<p role="alert" class="mt-5 border-l-2 border-destructive pl-3 text-sm leading-6 text-foreground">
				{data.linkMessage}
			</p>
		{/if}

		{#if form?.message}
			<p role="alert" class="mt-5 border-l-2 border-destructive pl-3 text-sm leading-6 text-foreground">
				{form.message}
			</p>
		{/if}

		{#if data.configured}
			<form method="POST" class="mt-6 space-y-5">
				<div>
					<label for="email" class="mb-1.5 block text-sm font-medium">Work email</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="username"
						required
						maxlength="320"
						class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
					/>
				</div>
				<div>
					<label for="password" class="mb-1.5 block text-sm font-medium">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						maxlength="1024"
						class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
					/>
				</div>
				<button
					type="submit"
					class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
				>
					Sign in
				</button>
			</form>
			<p class="mt-5 text-center text-sm leading-6 text-muted-foreground">
				Need a new password?
				<a href="/admin/login/recover" class="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Request a reset link</a>
			</p>
		{/if}
	</section>
</main>
