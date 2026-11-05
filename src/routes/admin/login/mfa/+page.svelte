<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Authenticator | Goat Accounting staff</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<section class="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
		<a href="/admin/login" class="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Staff sign-in</a>
		<h1 class="font-display mt-6 min-w-0 break-words text-3xl font-semibold tracking-tight">
			{data.state === 'setup'
				? 'Set up your authenticator'
				: data.state === 'activate'
					? 'Finish staff account setup'
					: 'Verify your authenticator'}
		</h1>
		<p class="mt-2 text-sm leading-6 text-muted-foreground">
			{data.state === 'setup'
				? 'Staff access requires a verified authenticator. Add this account to your authenticator app, then enter its six-digit code.'
				: data.state === 'activate'
					? 'Your authenticator is verified. Finish the invitation setup to activate your staff account.'
					: 'Enter the current six-digit code from your authenticator app to continue.'}
		</p>

		{#if form?.message}
			<p role="alert" class="mt-5 border-l-2 border-destructive pl-3 text-sm leading-6 text-foreground">
				{form.message}
			</p>
		{/if}

		{#if data.state === 'activate'}
			<form method="POST" action="?/verify" class="mt-6">
				<button type="submit" class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
					Finish staff setup
				</button>
			</form>
		{:else if data.state === 'setup' && !form?.enrollment}
			<form method="POST" action="?/enroll" class="mt-6">
				<button type="submit" class="rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
					Set up authenticator
				</button>
			</form>
		{:else}
			{#if form?.enrollment}
				<div class="mt-6 space-y-4">
					<img class="mx-auto size-48 rounded-md bg-white p-2" src={form.enrollment.qrCode} alt="Authenticator setup QR code" />
					<p class="text-sm leading-6 text-muted-foreground">If your app cannot scan the code, enter this setup key:</p>
					<code class="block break-all rounded-md bg-muted px-3 py-2 text-sm text-foreground">{form.enrollment.secret}</code>
				</div>
			{/if}
			<form method="POST" action="?/verify" class="mt-6 space-y-4">
				<div>
					<label for="code" class="mb-1.5 block text-sm font-medium">Six-digit code</label>
					<input
						id="code"
						name="code"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9]{6}"
						maxlength="6"
						required
						class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base tracking-[0.2em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
					/>
				</div>
				<button type="submit" class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
					Verify and continue
				</button>
			</form>
		{/if}
	</section>
</main>
