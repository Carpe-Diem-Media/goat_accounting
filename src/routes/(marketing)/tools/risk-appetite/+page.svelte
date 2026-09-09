<script lang="ts">
	import {
		RISK_QUESTIONS,
		calculateRiskScore,
		getRiskCategory,
		getRiskDescription,
		type RiskAnswers,
		type RiskCategory
	} from '$lib/domain/risk_appetite';

	const scaleOptions = [
		{ value: 1, label: 'Strongly disagree' },
		{ value: 2, label: 'Disagree' },
		{ value: 3, label: 'Neutral' },
		{ value: 4, label: 'Agree' },
		{ value: 5, label: 'Strongly agree' }
	] as const;

	const categoryTones: Record<RiskCategory, string> = {
		Conservative: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200',
		'Moderately Conservative': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200',
		Moderate: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
		'Moderately Aggressive': 'border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200',
		Aggressive: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200'
	};

	let answers = $state<RiskAnswers>({});
	let showResult = $state(false);

	let answeredCount = $derived(Object.keys(answers).length);
	let progress = $derived(Math.round((answeredCount / RISK_QUESTIONS.length) * 100));
	let score = $derived(calculateRiskScore(answers));
	let category = $derived(getRiskCategory(score));
	let categoryDescription = $derived(getRiskDescription(category));
	let categoryTone = $derived(categoryTones[category]);
	let allAnswered = $derived(answeredCount === RISK_QUESTIONS.length);

	function setAnswer(questionId: string, value: number) {
		answers = { ...answers, [questionId]: value };
		showResult = false;
	}

	function revealResult(event: SubmitEvent) {
		event.preventDefault();
		if (allAnswered) showResult = true;
	}

	function resetCalculator() {
		answers = {};
		showResult = false;
		requestAnimationFrame(() => {
			document.getElementById('risk-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}
</script>

<svelte:head>
	<title>Risk Appetite Calculator | Goat Accounting</title>
	<meta
		name="description"
		content="Understand your investment risk profile with Goat Accounting's quick risk appetite calculator."
	/>
	<link rel="canonical" href="https://goataccounting.co.za/tools/risk-appetite" />
	<meta property="og:title" content="Risk Appetite Calculator | Goat Accounting" />
	<meta
		property="og:description"
		content="Get a clearer starting point for conversations about your investment comfort and long-term goals."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://goataccounting.co.za/tools/risk-appetite" />
	<meta name="robots" content="index, follow" />
</svelte:head>

<section class="border-b border-border/70 bg-card/30">
	<div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:px-8">
		<div>
			<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.18em]">Free financial tool</p>
			<h1 class="font-display mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
				How much investment risk feels right for you?
			</h1>
			<p class="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
				Answer ten quick questions to get a useful starting point for conversations about your goals,
				comfort with volatility, and long-term financial plan.
			</p>
			<div class="mt-7 flex flex-wrap gap-3 text-sm text-muted-foreground">
				<span class="rounded-full border border-border bg-background px-3 py-1.5">10 questions</span>
				<span class="rounded-full border border-border bg-background px-3 py-1.5">Takes under 5 minutes</span>
				<span class="rounded-full border border-border bg-background px-3 py-1.5">No sign-up required</span>
			</div>
		</div>

		<aside class="rounded-2xl border border-border/70 bg-background p-6 shadow-sm sm:p-8">
			<div class="flex items-start gap-4">
				<div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
					<span class="text-lg font-bold" aria-hidden="true">%</span>
				</div>
				<div>
					<h2 class="font-display text-xl font-semibold">A clearer conversation starts here</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						Your result is educational and does not replace regulated, personal financial advice.
					</p>
				</div>
			</div>
			<a
				href="#risk-calculator"
				class="btn-gold-gradient mt-6 inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-95"
			>
				Start the calculator <span class="ml-2" aria-hidden="true">→</span>
			</a>
		</aside>
	</div>
</section>

<section id="risk-calculator" class="scroll-mt-24 py-12 sm:py-16">
	<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<div class="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
			<form onsubmit={revealResult} class="space-y-5">
				<div class="rounded-2xl border border-border/70 bg-card p-5 sm:p-7">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.16em]">Your questionnaire</p>
							<h2 class="font-display mt-2 text-2xl font-semibold sm:text-3xl">Choose the answer that feels most like you.</h2>
						</div>
						<p class="shrink-0 text-sm font-semibold text-muted-foreground">{answeredCount}/{RISK_QUESTIONS.length}</p>
					</div>
					<div class="mt-5 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${progress}% complete`}>
						<div class="h-full rounded-full bg-primary transition-[width] duration-300" style={`width: ${progress}%`}></div>
					</div>
				</div>

				{#each RISK_QUESTIONS as question, index}
					<fieldset class="rounded-2xl border border-border/70 bg-card p-5 sm:p-7">
						<legend class="flex w-full gap-3 text-left text-base font-semibold leading-relaxed sm:text-lg">
							<span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">{index + 1}</span>
							<span>{question.text}</span>
						</legend>
						<div class="mt-5 grid grid-cols-5 gap-2" role="radiogroup" aria-label={`Answer for question ${index + 1}`}>
							{#each scaleOptions as option}
								<button
									type="button"
									role="radio"
									aria-checked={answers[question.id] === option.value}
									onclick={() => setAnswer(question.id, option.value)}
									class={answers[question.id] === option.value
										? 'border-primary bg-primary text-primary-foreground shadow-md'
										: 'border-border bg-background text-muted-foreground hover:border-primary/60 hover:bg-accent/30 hover:text-foreground'}
								>
									<span class="text-lg font-bold">{option.value}</span>
									<span class="sr-only">{option.label}</span>
								</button>
							{/each}
						</div>
						<div class="mt-3 flex justify-between text-xs text-muted-foreground">
							<span>Strongly disagree</span>
							<span>Strongly agree</span>
						</div>
					</fieldset>
				{/each}

				<div class="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5 sm:flex-row sm:p-7">
					<p class="text-sm text-muted-foreground">
						{#if allAnswered}
							All questions answered. Ready to see your profile?
						{:else}
							Answer all {RISK_QUESTIONS.length} questions to reveal your profile.
						{/if}
					</p>
					<button
						type="submit"
						disabled={!allAnswered}
						class="btn-gold-gradient inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
					>
						See my risk profile <span class="ml-2" aria-hidden="true">→</span>
					</button>
				</div>
			</form>

			<aside class="space-y-5 lg:sticky lg:top-32">
				<div class="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6" aria-live="polite">
					<p class="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Live estimate</p>
					<div class="mt-5 flex items-end justify-between gap-3">
						<span class="font-display text-5xl font-semibold tracking-tight">{score}</span>
						<span class="pb-1 text-sm text-muted-foreground">/ 100</span>
					</div>
					<div class="mt-4 h-3 overflow-hidden rounded-full bg-muted">
						<div class="h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-rose-500 transition-[width] duration-300" style={`width: ${score}%`}></div>
					</div>
					<p class="mt-4 text-sm text-muted-foreground">Current profile</p>
					<p class="mt-1 text-lg font-semibold text-brand">{category}</p>
				</div>

				<div class="rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6">
					<p class="text-sm font-semibold">How the score works</p>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						Each answer contributes to a score from 0 to 100. Higher scores indicate greater comfort with investment risk.
					</p>
				</div>
			</aside>
		</div>

		{#if showResult}
			<section class="mt-10 rounded-3xl border border-primary/30 bg-card p-6 shadow-xl sm:p-10" aria-labelledby="result-heading">
				<div class="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
					<div>
						<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.16em]">Your result</p>
						<h2 id="result-heading" class="font-display mt-3 text-3xl font-semibold sm:text-4xl">Your profile is {category}.</h2>
						<div class={`mt-5 inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${categoryTone}`}>
							Score {score} out of 100
						</div>
					</div>
					<div>
						<p class="text-base leading-relaxed text-muted-foreground sm:text-lg">{categoryDescription}</p>
						<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
							This result is a conversation starter, not a recommendation. Your goals, time horizon, income, and wider financial position should all be considered before making investment decisions.
						</p>
						<div class="mt-7 flex flex-col gap-3 sm:flex-row">
							<a
								href="/booking"
								class="btn-gold-gradient inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-95"
							>
								Talk through your result <span class="ml-2" aria-hidden="true">→</span>
							</a>
							<button
								type="button"
								onclick={resetCalculator}
								class="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent/30"
							>
								Retake calculator
							</button>
						</div>
					</div>
				</div>
			</section>
		{/if}
	</div>
</section>

<section class="border-y border-border/70 bg-card/30 py-12 sm:py-16">
	<div class="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
		<div>
			<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.16em]">01</p>
			<h2 class="font-display mt-3 text-xl font-semibold">Answer honestly</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">There are no right or wrong answers. Choose the response that best reflects how you actually feel.</p>
		</div>
		<div>
			<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.16em]">02</p>
			<h2 class="font-display mt-3 text-xl font-semibold">Understand your range</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">Your score gives you language for discussing risk, volatility, and the balance between growth and stability.</p>
		</div>
		<div>
			<p class="text-gradient-primary text-xs font-bold uppercase tracking-[0.16em]">03</p>
			<h2 class="font-display mt-3 text-xl font-semibold">Plan with context</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">Use the result as a starting point for a proper review of your goals and financial position.</p>
		</div>
	</div>
</section>
