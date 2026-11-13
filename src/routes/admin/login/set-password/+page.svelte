<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Set your staff password | Goat Accounting</title>
	<meta name="description" content="Set or reset the password for your Goat Accounting staff account." />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<section class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
		<a href="/admin/login" class="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">Staff sign-in</a>
		<h1 class="font-display mt-6 min-w-0 break-words text-3xl font-semibold tracking-tight">Set your staff password</h1>
		<p class="mt-2 text-sm leading-6 text-muted-foreground">
			Choose a password for your account. Staff access still requires a verified authenticator, and invited accounts remain pending until an administrator activates them.
		</p>

		{#if form?.message}
			<p role="alert" class="mt-5 border-l-2 border-destructive pl-3 text-sm leading-6 text-foreground">
				{form.message}
			</p>
		{/if}

		<form method="POST" class="mt-6 space-y-5">
			<div>
				<label for="password" class="mb-1.5 block text-sm font-medium">New password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					required
					maxlength="1024"
					class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
				/>
			</div>
			<div>
				<label for="confirmation" class="mb-1.5 block text-sm font-medium">Confirm new password</label>
				<input
					id="confirmation"
					name="confirmation"
					type="password"
					autocomplete="new-password"
					required
					maxlength="1024"
					class="w-full rounded-md border border-muted-foreground bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
				/>
			</div>
			<button
				type="submit"
				class="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
			>
				Save password
			</button>
		</form>
		<p class="mt-5 text-sm leading-6 text-muted-foreground">
			After saving, you will continue to authenticator setup or verification.
		</p>
	</section>
</main>
