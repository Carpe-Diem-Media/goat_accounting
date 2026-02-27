<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Clock from '@lucide/svelte/icons/clock';
	import CheckCircle from '@lucide/svelte/icons/check-circle-2';
	import Send from '@lucide/svelte/icons/send';
	import type { ActionData } from './$types';
	import { WHATSAPP_URL } from '$lib/config/social.js';
	import { abs_url } from '$lib/config/site.js';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);

	const serviceOptions = [
		'Wealth & Investments',
		'Tax Consulting',
		'Financial Statements',
		'Risk Cover & Protection',
		'Retirement Planning',
		'General / Full Review',
	] as const;

	const pageUrl = abs_url('/contact');
	const socialImage = abs_url('/og-default.svg');
	const pageTitle = 'Goat Accounting | Contact';
	const pageDescription =
		'Contact Goat Accounting to discuss wealth planning, tax consulting, and accounting support.';
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={pageUrl} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={pageUrl} />
	<meta property="og:image" content={socialImage} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={socialImage} />
</svelte:head>

<!-- Page Header -->
<section class="pb-10 pt-20 sm:pt-24">
	<div class="mx-auto max-w-5xl px-4">
		<div class="mb-8 h-px w-12 bg-brand"></div>
		<p class="text-sm font-medium uppercase tracking-widest text-brand">Get in Touch</p>
		<h1 class="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
			Contact Goat Accounting
		</h1>
		<p class="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
			Share your priorities and I will get back to you within 24 hours to map next steps.
		</p>
	</div>
</section>

<Separator />

<!-- Main Content -->
<section class="py-16 sm:py-20">
	<div class="mx-auto max-w-5xl px-4">
		<div class="grid gap-16 lg:grid-cols-[1fr_20rem] lg:gap-20">
			<!-- Left: Form -->
			<div>
				{#if form?.success}
					<!-- Success State -->
					<div class="flex flex-col items-center py-12 text-center">
						<div
							class="mb-6 flex size-16 items-center justify-center rounded-full bg-brand/10"
						>
							<CheckCircle class="size-8 text-brand" />
						</div>
						<h2
							class="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
						>
							Thank You
						</h2>
						<p class="mx-auto mt-3 max-w-sm text-muted-foreground leading-relaxed">
							Your message has been received. I'll be in touch within 24 hours to
							discuss the details.
						</p>
						<div class="mt-6 h-px w-12 bg-brand"></div>
						<Button href="/contact" variant="outline" class="mt-8">
							Send Another Message
						</Button>
					</div>
				{:else}
					<!-- Contact Form -->
					<form
						id="GA4_Form"
						method="POST"
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								await update();
								submitting = false;
							};
						}}
						class="space-y-6"
						novalidate
					>
						<!-- Name & Email Row -->
						<div class="grid gap-6 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="name">
									Name <span class="text-brand" aria-hidden="true">*</span>
								</Label>
								<Input
									id="name"
									name="name"
									type="text"
									autocomplete="name"
									placeholder="Your full name"
									required
									value={form?.values?.name ?? ''}
									aria-invalid={form?.errors?.name ? 'true' : undefined}
									aria-describedby={form?.errors?.name ? 'name-error' : undefined}
								/>
								{#if form?.errors?.name}
									<p id="name-error" class="text-sm text-destructive">
										{form.errors.name}
									</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="email">
									Email <span class="text-brand" aria-hidden="true">*</span>
								</Label>
								<Input
									id="email"
									name="email"
									type="email"
									autocomplete="email"
									placeholder="you@example.com"
									required
									value={form?.values?.email ?? ''}
									aria-invalid={form?.errors?.email ? 'true' : undefined}
									aria-describedby={form?.errors?.email ? 'email-error' : undefined}
								/>
								{#if form?.errors?.email}
									<p id="email-error" class="text-sm text-destructive">
										{form.errors.email}
									</p>
								{/if}
							</div>
						</div>

						<!-- Service & Date Row -->
						<div class="grid gap-6 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="service">Primary Focus</Label>
								<select
									id="service"
									name="service"
									class="border-input bg-transparent dark:bg-input/30 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] md:text-sm"
								>
									<option value="">Select your focus...</option>
									{#each serviceOptions as option}
										<option
											value={option}
											selected={form?.values?.service === option}
										>
											{option}
										</option>
									{/each}
								</select>
							</div>

							<div class="space-y-2">
								<Label for="date">Preferred Meeting Date</Label>
								<Input
									id="date"
									name="date"
									type="date"
									value={form?.values?.date ?? ''}
								/>
							</div>
						</div>

						<!-- Message -->
						<div class="space-y-2">
							<Label for="message">
								Message <span class="text-brand" aria-hidden="true">*</span>
							</Label>
							<Textarea
								id="message"
								name="message"
								placeholder="Tell me about your goals, current setup, and what outcome you want."
								required
								rows={5}
								class="min-h-32 resize-y"
								value={form?.values?.message ?? ''}
								aria-invalid={form?.errors?.message ? 'true' : undefined}
								aria-describedby={form?.errors?.message ? 'message-error' : undefined}
							/>
							{#if form?.errors?.message}
								<p id="message-error" class="text-sm text-destructive">
									{form.errors.message}
								</p>
							{/if}
						</div>

						<!-- Submit -->
						<div class="pt-2">
							<Button
								type="submit"
								size="lg"
								class="bg-brand text-brand-foreground hover:bg-brand/90"
								disabled={submitting}
							>
								{#if submitting}
									Sending...
								{:else}
									Send Message
									<Send class="size-4" />
								{/if}
							</Button>
						</div>
					</form>
				{/if}
			</div>

			<!-- Right: Contact Details Sidebar -->
			<aside class="lg:border-l lg:pl-12">
				<div class="space-y-8">
					<div>
						<h2
							class="font-display text-lg font-semibold tracking-tight"
						>
							Contact Details
						</h2>
						<div class="mt-1 h-px w-8 bg-brand"></div>
					</div>

					<div class="space-y-5">
						<div class="flex gap-3">
							<Mail class="mt-0.5 size-4 shrink-0 text-brand" />
							<div>
								<p class="text-sm font-medium">Email</p>
								<a
									href="mailto:hello@goataccounting.co.za"
									class="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									hello@goataccounting.co.za
								</a>
							</div>
						</div>

						<div class="flex gap-3">
							<Phone class="mt-0.5 size-4 shrink-0 text-brand" />
							<div>
								<p class="text-sm font-medium">Phone / WhatsApp</p>
								<a
									href="tel:+27816098157"
									class="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									+27 81 609 8157
								</a>
								<a
									href={WHATSAPP_URL}
									class="block text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Message on WhatsApp
								</a>
							</div>
						</div>

						<div class="flex gap-3">
							<Clock class="mt-0.5 size-4 shrink-0 text-brand" />
							<div>
							<p class="text-sm font-medium">Response Time</p>
							<p class="text-sm text-muted-foreground">
									Within 24 hours
								</p>
							</div>
						</div>
					</div>

					<Separator />

					<div>
						<h2
							class="font-display text-lg font-semibold tracking-tight"
						>
							Service Coverage
						</h2>
						<div class="mt-1 h-px w-8 bg-brand"></div>
					</div>

					<div class="flex gap-3">
						<MapPin class="mt-0.5 size-4 shrink-0 text-brand" />
						<div>
							<p class="text-sm font-medium">Based in South Africa</p>
							<p class="text-sm leading-relaxed text-muted-foreground">
								Serving clients nationally via online consultations, with in-person sessions by
								appointment.
							</p>
						</div>
					</div>

					<p class="text-xs leading-relaxed text-muted-foreground/70">
						Consultation format and documentation requirements are confirmed once your enquiry is
						reviewed.
					</p>
				</div>
			</aside>
		</div>
	</div>
</section>
