<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Reset staff password | Goat Accounting</title>
	<meta name="description" content="Request a password reset for a Goat Accounting staff account." />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<section class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
		<a href="/admin/login" class="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Staff sign-in</a>
		<h1 class="font-display mt-6 min-w-0 break-words text-3xl font-semibold tracking-tight">Reset your staff password</h1>
		<p class="mt-2 text-sm leading-6 text-muted-foreground">
			Enter the work email address for your staff account. If it is eligible for recovery, we will send a one-time link.
		</p>

		{#if !data.configured}
			<p role="status" class="mt-5 border-l-2 border-primary pl-3 text-sm leading-6 text-muted-foreground">
				Password recovery is unavailable until the approved project connection is configured.
			</p>
		{:else if form?.message}
			<p
				role={form.submitted ? 'status' : 'alert'}
				class="mt-5 border-l-2 border-primary pl-3 text-sm leading-6 text-foreground"
			>
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
						autocomplete="email"
						required
						maxlength="320"
						class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
					/>
				</div>
				<button
					type="submit"
					class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
				>
					Send reset link
				</button>
			</form>
		{/if}
	</section>
</main>
