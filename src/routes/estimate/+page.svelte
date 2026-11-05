<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import ChoiceOptions from '$lib/components/estimator/ChoiceOptions.svelte';
	import {
		ANSWER_OPTION_VALUES,
		BUSINESS_COMPLEXITY_QUESTION,
		BUSINESS_QUESTIONS,
		URGENCY_QUESTION,
		type EstimatorOption,
		type EstimatorQuestion
	} from '$lib/domain/estimator/questions';
	import {
		CanonicalEstimatorAnswersSchema,
		type BusinessAnswers
	} from '$lib/domain/estimator/answer-schema';

	const DRAFT_KEY = 'goat-accounting:business-estimator:v1';
	const DRAFT_VERSION = 1;
	const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
	type OptionQuestion = Extract<EstimatorQuestion, { type: 'single' | 'multi' }>;
	const QUESTIONS: readonly OptionQuestion[] = [
		...BUSINESS_QUESTIONS,
		BUSINESS_COMPLEXITY_QUESTION,
		URGENCY_QUESTION
	];
	const STEP_COUNT = QUESTIONS.length;

	const statementOptions: readonly EstimatorOption[] = ANSWER_OPTION_VALUES[
		'business.bankStatementsAvailableForFullPeriod'
	].map((value) => ({
		value,
		label: value === 'yes' ? 'Yes, for the full period' : value === 'no' ? 'No, statements are not available for the full period' : 'I’m not sure'
	}));

	const complianceAreaLabels: Record<string, string> = {
		company_income_tax: 'Company income tax',
		personal_income_tax: 'Personal income tax',
		vat: 'VAT',
		payroll: 'Payroll',
		cipc: 'CIPC/company compliance',
		other: 'Other compliance area'
	};
	const complianceAreaOptions: readonly EstimatorOption[] = ANSWER_OPTION_VALUES[
		'business.outstandingComplianceAreas'
	].map((value) => ({ value, label: complianceAreaLabels[value] }));

	type DraftState = Readonly<{
		version: number;
		status: 'IN_PROGRESS';
		createdAt: number;
		updatedAt: number;
		expiresAt: number;
		stepIndex: number;
		answers: Partial<BusinessAnswers>;
		urgency?: string;
		freeText: string;
		idempotencyKey?: string;
		idempotencyPayloadSnapshot?: string;
	}>;

	let answers = $state<Partial<BusinessAnswers>>({});
	let urgency = $state<string | undefined>();
	let freeText = $state('');
	let stepIndex = $state(0);
	let createdAt = $state(Date.now());
	let expiresAt = $state(0);
	let idempotencyKey = $state<string | undefined>();
	let idempotencyPayloadSnapshot = $state<string | undefined>();
	let errorMessage = $state('');
	let storageMessage = $state('');
	let isSubmitting = $state(false);
	let questionHeading: HTMLHeadingElement;
	let activeQuestion = $derived(QUESTIONS[stepIndex]);
	let questionTitle = $derived(activeQuestion.question);
	let progressValue = $derived(Math.round(((stepIndex + 1) / STEP_COUNT) * 100));
	let submitButtonLabel = $derived(isSubmitting ? 'Saving…' : 'View estimate');

	function isRecord(value: unknown): value is Record<string, unknown> {
		return value !== null && typeof value === 'object' && !Array.isArray(value);
	}

	function removeOptionalAnswer(key: keyof BusinessAnswers): void {
		const next = { ...answers };
		delete next[key];
		answers = next;
	}

	function readStringArray(key: keyof BusinessAnswers): string[] {
		const value = answers[key];
		if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
		return typeof value === 'string' ? [value] : [];
	}

	function selectedFor(question: OptionQuestion): string[] {
		switch (question.id) {
			case 'B1': return readStringArray('entityType');
			case 'B2': return readStringArray('booksStatus');
			case 'B3': return readStringArray('recordCondition');
			case 'B4': return readStringArray('monthlyTransactionVolume');
			case 'B5': return readStringArray('financialAccounts');
			case 'B6': return readStringArray('employeeCount');
			case 'B7': return readStringArray('taxPosition');
			case 'B8': return readStringArray('ongoingServices');
			case 'COMPLEXITY': return readStringArray('complexityFactors');
			case 'URGENCY': return urgency ? [urgency] : [];
			default: return [];
		}
	}

	function needsStatementAvailability(): boolean {
		return (
			answers.booksStatus !== undefined &&
			answers.booksStatus !== 'current_and_reconciled' &&
			(answers.recordCondition === 'bank_statements_only' || answers.recordCondition === 'incomplete_or_messy')
		);
	}

	function allowsComplianceAreas(): boolean {
		return answers.taxPosition === 'some_submissions_outstanding' ||
			answers.taxPosition === 'multiple_periods_outstanding' ||
			answers.taxPosition === 'sars_issue';
	}

	function saveDraft(): void {
		const now = Date.now();
		if (!createdAt) createdAt = now;
		if (!expiresAt || expiresAt <= now) expiresAt = createdAt + DRAFT_TTL_MS;
		const draft: DraftState = {
			version: DRAFT_VERSION,
			status: 'IN_PROGRESS',
			createdAt,
			updatedAt: now,
			expiresAt,
			stepIndex,
			answers,
			urgency,
			freeText,
			idempotencyKey,
			idempotencyPayloadSnapshot
		};
		try {
			sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
			storageMessage = '';
		} catch {
			storageMessage = 'This browser could not save a draft for this tab.';
		}
	}

	function restoreDraft(): void {
		const url = new URL(window.location.href);
		if (url.searchParams.get('new') === '1') {
			sessionStorage.removeItem(DRAFT_KEY);
			url.searchParams.delete('new');
			window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
			return;
		}

		const raw = sessionStorage.getItem(DRAFT_KEY);
		if (!raw) return;
		try {
			const stored: unknown = JSON.parse(raw);
			if (!isRecord(stored)) throw new Error('Invalid draft.');
			const now = Date.now();
			if (
				stored.version !== DRAFT_VERSION ||
				stored.status !== 'IN_PROGRESS' ||
				typeof stored.expiresAt !== 'number' || stored.expiresAt <= now ||
				typeof stored.createdAt !== 'number' ||
				typeof stored.stepIndex !== 'number' || stored.stepIndex < 0 || stored.stepIndex >= STEP_COUNT ||
				!isRecord(stored.answers) || typeof stored.freeText !== 'string'
				) {
				if (typeof stored.expiresAt === 'number' && stored.expiresAt <= now) {
					storageMessage = 'Your saved draft expired. You can start a new estimate below.';
				}
				sessionStorage.removeItem(DRAFT_KEY);
				return;
			}
			answers = stored.answers as Partial<BusinessAnswers>;
			urgency = typeof stored.urgency === 'string' ? stored.urgency : undefined;
			freeText = stored.freeText.slice(0, 2000);
			stepIndex = stored.stepIndex;
			createdAt = stored.createdAt;
			expiresAt = stored.expiresAt;
			idempotencyKey = typeof stored.idempotencyKey === 'string' ? stored.idempotencyKey : undefined;
			idempotencyPayloadSnapshot = typeof stored.idempotencyPayloadSnapshot === 'string'
				? stored.idempotencyPayloadSnapshot
				: undefined;
		} catch {
			sessionStorage.removeItem(DRAFT_KEY);
		}
	}

	function setSingleAnswer(value: string): void {
		errorMessage = '';
		switch (activeQuestion.id) {
			case 'B1':
				answers = { ...answers, entityType: value as BusinessAnswers['entityType'] };
				if (value !== 'multiple_entities') removeOptionalAnswer('entityCount');
				break;
			case 'B2':
				{
					const booksStatus = value as BusinessAnswers['booksStatus'];
					answers = { ...answers, booksStatus };
					const monthRange: readonly [number, number] | undefined = booksStatus === '1_to_2_years'
						? [13, 24]
						: booksStatus === 'over_2_years' ? [25, 100] : undefined;
					if (!monthRange || !isNumberInRange(answers.outstandingMonths, monthRange[0], monthRange[1])) {
						removeOptionalAnswer('outstandingMonths');
					}
					if (booksStatus === 'current_and_reconciled') removeOptionalAnswer('bankStatementsAvailableForFullPeriod');
				}
				break;
			case 'B3':
				answers = { ...answers, recordCondition: value as BusinessAnswers['recordCondition'] };
				if (!needsStatementAvailability()) removeOptionalAnswer('bankStatementsAvailableForFullPeriod');
				break;
			case 'B4': answers = { ...answers, monthlyTransactionVolume: value as BusinessAnswers['monthlyTransactionVolume'] }; break;
			case 'B5': answers = { ...answers, financialAccounts: value as BusinessAnswers['financialAccounts'] }; break;
			case 'B6': answers = { ...answers, employeeCount: value as BusinessAnswers['employeeCount'] }; break;
			case 'B7':
				answers = { ...answers, taxPosition: value as BusinessAnswers['taxPosition'] };
				if (!allowsComplianceAreas()) removeOptionalAnswer('outstandingComplianceAreas');
				break;
			case 'URGENCY': urgency = value;
				break;
		}
		saveDraft();
	}

	function toggleMultiAnswer(field: 'ongoingServices' | 'complexityFactors', value: string): void {
		const current = readStringArray(field);
		let next: string[];
		if (field === 'complexityFactors') {
			const exclusive = value === 'none' || value === 'not_sure';
			if (exclusive) {
				next = current.includes(value) ? [] : [value];
			} else {
				next = current.filter((item) => item !== 'none' && item !== 'not_sure');
				next = next.includes(value) ? next.filter((item) => item !== value) : [...next, value];
			}
		} else {
			next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
		}
		answers = { ...answers, [field]: next };
		errorMessage = '';
		saveDraft();
	}

	function setStatementAvailability(value: string): void {
		answers = {
			...answers,
			bankStatementsAvailableForFullPeriod: value as BusinessAnswers['bankStatementsAvailableForFullPeriod']
		};
		errorMessage = '';
		saveDraft();
	}

	function toggleComplianceArea(value: string): void {
		const current = readStringArray('outstandingComplianceAreas');
		const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
		answers = { ...answers, outstandingComplianceAreas: next as BusinessAnswers['outstandingComplianceAreas'] };
		errorMessage = '';
		saveDraft();
	}

	function setNumericAnswer(key: 'entityCount' | 'outstandingMonths', rawValue: string): void {
		const next = { ...answers };
		if (rawValue === '') delete next[key];
		else next[key] = Number(rawValue);
		answers = next;
		errorMessage = '';
		saveDraft();
	}

	function setFreeText(value: string): void {
		freeText = value.slice(0, 2000);
		saveDraft();
	}

	function isNumberInRange(value: number | undefined, min: number, max: number): boolean {
		return value === undefined || (Number.isInteger(value) && value >= min && value <= max);
	}

	function validateCurrentStep(): boolean {
		errorMessage = '';
		switch (activeQuestion.id) {
			case 'B1':
				if (!answers.entityType) errorMessage = 'Choose the business or entity type to continue.';
				else if (answers.entityCount !== undefined && !isNumberInRange(answers.entityCount, 2, 1000)) {
					errorMessage = 'Enter a whole number of entities from 2 to 1,000, or leave this optional field blank.';
				}
				break;
			case 'B2':
				if (!answers.booksStatus) errorMessage = 'Choose how up to date your books are to continue.';
				else if (answers.booksStatus === '1_to_2_years' && !isNumberInRange(answers.outstandingMonths, 13, 24)) {
					errorMessage = 'Enter a whole number from 13 to 24 months, or leave this optional field blank.';
				} else if (answers.booksStatus === 'over_2_years' && !isNumberInRange(answers.outstandingMonths, 25, 100)) {
					errorMessage = 'Enter a whole number from 25 to 100 months, or leave this optional field blank.';
				}
				break;
			case 'B3':
				if (!answers.recordCondition) errorMessage = 'Choose the condition of your existing records to continue.';
				else if (needsStatementAvailability() && !answers.bankStatementsAvailableForFullPeriod) {
					errorMessage = 'Let us know whether statements are available for the full period.';
				}
				break;
			case 'B4': if (!answers.monthlyTransactionVolume) errorMessage = 'Choose a monthly transaction range to continue.'; break;
			case 'B5': if (!answers.financialAccounts) errorMessage = 'Choose the number of accounts to continue.'; break;
			case 'B6': if (!answers.employeeCount) errorMessage = 'Choose an employee range to continue.'; break;
			case 'B7':
				if (!answers.taxPosition) errorMessage = 'Choose your current tax/compliance position to continue.';
				else if (
					(answers.taxPosition === 'some_submissions_outstanding' || answers.taxPosition === 'multiple_periods_outstanding') &&
					readStringArray('outstandingComplianceAreas').length === 0
				) {
					errorMessage = 'Select at least one outstanding compliance area to continue.';
				}
				break;
			case 'B8': if (readStringArray('ongoingServices').length === 0) errorMessage = 'Choose at least one service to continue.'; break;
			case 'COMPLEXITY':
				if (readStringArray('complexityFactors').length === 0) errorMessage = 'Choose at least one option, including “None of these” if it applies.';
				break;
			case 'URGENCY': if (!urgency) errorMessage = 'Choose how soon you need help to continue.'; break;
		}
		return errorMessage.length === 0;
	}

	async function advanceStep(): Promise<void> {
		if (!validateCurrentStep()) return;
		if (stepIndex < STEP_COUNT - 1) {
			stepIndex += 1;
			saveDraft();
			await tick();
			questionHeading?.focus();
		}
	}

	async function goBack(): Promise<void> {
		if (stepIndex === 0) return;
		stepIndex -= 1;
		errorMessage = '';
		saveDraft();
		await tick();
		questionHeading?.focus();
	}

	function createIdempotencyKey(): string {
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	}

	function canonicalAnswers(): unknown {
		const business: Record<string, unknown> = {
			entityType: answers.entityType,
			booksStatus: answers.booksStatus,
			recordCondition: answers.recordCondition,
			monthlyTransactionVolume: answers.monthlyTransactionVolume,
			financialAccounts: answers.financialAccounts,
			employeeCount: answers.employeeCount,
			taxPosition: answers.taxPosition,
			ongoingServices: answers.ongoingServices,
			complexityFactors: answers.complexityFactors
		};
		for (const key of [
			'entityCount',
			'outstandingMonths',
			'bankStatementsAvailableForFullPeriod',
			'outstandingComplianceAreas'
		] as const) {
			if (answers[key] !== undefined) business[key] = answers[key];
		}
		return CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business',
			urgency,
			business
		});
	}

	async function submitEstimate(): Promise<void> {
		if (isSubmitting || !validateCurrentStep()) return;
		let canonical: unknown;
		try {
			canonical = canonicalAnswers();
		} catch {
			errorMessage = 'Check the answers and conditional details, then try again.';
			return;
		}

		const note = freeText.trim();
		const payload = {
			calculatorType: 'business',
			answers: canonical,
			...(note ? { freeText: note } : {})
		};
		const payloadSnapshot = JSON.stringify(payload);
		if (!idempotencyKey || idempotencyPayloadSnapshot !== payloadSnapshot) {
			idempotencyKey = createIdempotencyKey();
			idempotencyPayloadSnapshot = payloadSnapshot;
		}
		saveDraft();
		isSubmitting = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/estimates', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'idempotency-key': idempotencyKey
				},
				body: JSON.stringify(payload)
			});
			if (!response.ok) throw new Error('Estimate request failed.');
			const result: unknown = await response.json();
			if (!isRecord(result) || !isRecord(result.estimate) || typeof result.estimate.publicRef !== 'string' || !/^[a-f0-9]{32}$/.test(result.estimate.publicRef)) {
				throw new Error('The saved estimate reference was invalid.');
			}
			await goto(`/estimate/${result.estimate.publicRef}`);
		} catch {
			errorMessage = 'The estimate could not be saved right now. Your answers are saved in this tab. Please try again.';
			isSubmitting = false;
			saveDraft();
		}
	}

	onMount(() => {
		try {
			restoreDraft();
			saveDraft();
		} catch {
			storageMessage = 'Draft recovery is unavailable in this browser tab.';
		}
	});
</script>

<svelte:head>
	<title>Business estimate | Goat Accounting</title>
	<meta name="description" content="Get an indicative estimate for your business accounting support." />
	<meta property="og:title" content="Business estimate | Goat Accounting" />
</svelte:head>

<section aria-labelledby="estimate-title" class="space-y-7">
	<header class="space-y-2">
		<h1 id="estimate-title" class="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
			Estimate your business accounting support
		</h1>
		<p class="max-w-2xl text-base leading-7 text-muted-foreground">
			Answer a few questions to see an indicative catch-up and monthly estimate. You can view it before sharing any contact details.
		</p>
	</header>

	{#if storageMessage}
		<p class="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground" role="status">{storageMessage}</p>
	{/if}

	<section aria-label="Questionnaire progress" class="space-y-2">
		<div class="flex items-center justify-between gap-4 text-sm">
			<p class="font-medium text-foreground">Step {stepIndex + 1} of {STEP_COUNT}</p>
			<p class="tabular-nums text-muted-foreground">{progressValue}%</p>
		</div>
		<div
			role="progressbar"
			aria-label="Questionnaire progress"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={progressValue}
			class="grid h-1.5 grid-cols-10 gap-1 overflow-hidden rounded-full"
		>
			{#each QUESTIONS as _, index (index)}
				<span class={index <= stepIndex ? 'rounded-full bg-primary' : 'rounded-full bg-secondary'}></span>
			{/each}
		</div>
	</section>

	<section id="questionnaire" aria-labelledby="question-title" class="space-y-6">
		<div class="space-y-6">
			<div class="space-y-2">
				<h2
					id="question-title"
					bind:this={questionHeading}
					tabindex="-1"
					class="min-w-0 [overflow-wrap:break-word] text-balance font-display text-2xl font-medium leading-snug text-foreground focus:outline-none sm:text-3xl"
				>
					{questionTitle}
				</h2>
				{#if 'helperText' in activeQuestion && activeQuestion.helperText}
					<p id="question-helper" class="max-w-2xl text-sm leading-6 text-muted-foreground">{activeQuestion.helperText}</p>
				{/if}
			</div>

			<div class="space-y-5">
				<ChoiceOptions
					groupId={`question-${activeQuestion.id}`}
					legend={activeQuestion.question}
					mode={activeQuestion.type}
					options={activeQuestion.options}
					selected={selectedFor(activeQuestion)}
					describedBy={'helperText' in activeQuestion && activeQuestion.helperText ? 'question-helper' : undefined}
					onSelect={(value) => {
						if (activeQuestion.type === 'single') setSingleAnswer(value);
						else if (activeQuestion.id === 'B8') toggleMultiAnswer('ongoingServices', value);
						else if (activeQuestion.id === 'COMPLEXITY') toggleMultiAnswer('complexityFactors', value);
					}}
				/>

				{#if activeQuestion.id === 'B1' && answers.entityType === 'multiple_entities'}
					<div class="space-y-2 border-t border-border pt-5">
						<label for="entity-count" class="block text-sm font-medium text-foreground">Number of entities (optional)</label>
						<p id="entity-count-hint" class="text-sm leading-6 text-muted-foreground">A whole number from 2 to 1,000, if you know it.</p>
						<input
							id="entity-count"
							name="entityCount"
						type="number"
						min="2"
						max="1000"
						step="1"
						inputmode="numeric"
						value={answers.entityCount ?? ''}
						aria-describedby="entity-count-hint"
						oninput={(event) => setNumericAnswer('entityCount', event.currentTarget.value)}
						class="min-h-12 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						placeholder="Leave blank if unsure"
					/>
					</div>
				{/if}

				{#if activeQuestion.id === 'B2' && (answers.booksStatus === '1_to_2_years' || answers.booksStatus === 'over_2_years')}
					<div class="space-y-2 border-t border-border pt-5">
						<label for="outstanding-months" class="block text-sm font-medium text-foreground">Approximate months outstanding (optional)</label>
						<p id="outstanding-months-hint" class="text-sm leading-6 text-muted-foreground">
							{answers.booksStatus === '1_to_2_years' ? 'Enter 13 to 24 months if you know the count.' : 'Enter 25 to 100 months if you know the count.'}
						</p>
						<input
							id="outstanding-months"
							name="outstandingMonths"
						type="number"
							min={answers.booksStatus === '1_to_2_years' ? 13 : 25}
							max={answers.booksStatus === '1_to_2_years' ? 24 : 100}
							step="1"
							inputmode="numeric"
							value={answers.outstandingMonths ?? ''}
							aria-describedby="outstanding-months-hint"
							oninput={(event) => setNumericAnswer('outstandingMonths', event.currentTarget.value)}
							class="min-h-12 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							placeholder="Leave blank if unsure"
						/>
					</div>
				{/if}

				{#if activeQuestion.id === 'B3' && needsStatementAvailability()}
					<div class="space-y-3 border-t border-border pt-5">
						<p class="text-sm font-medium text-foreground">Are bank statements available for the full period?</p>
						<ChoiceOptions
							groupId="statement-availability"
							legend="Are bank statements available for the full period?"
							mode="single"
							options={statementOptions}
							selected={readStringArray('bankStatementsAvailableForFullPeriod')}
							onSelect={setStatementAvailability}
						/>
					</div>
				{/if}

				{#if activeQuestion.id === 'B7' && allowsComplianceAreas()}
					<div class="space-y-3 border-t border-border pt-5">
						<p class="text-sm font-medium text-foreground">
							Which compliance areas are involved?
							{#if answers.taxPosition === 'sars_issue'}<span class="font-normal text-muted-foreground">(optional)</span>{/if}
						</p>
						<ChoiceOptions
							groupId="outstanding-compliance-areas"
							legend="Which compliance areas are involved?"
							mode="multi"
							options={complianceAreaOptions}
							selected={readStringArray('outstandingComplianceAreas')}
							onSelect={toggleComplianceArea}
						/>
					</div>
				{/if}

				{#if activeQuestion.id === 'URGENCY'}
					<div class="space-y-3 border-t border-border pt-5">
						<label for="free-text" class="block text-sm font-medium text-foreground">Anything else we should know? <span class="font-normal text-muted-foreground">(optional)</span></label>
						<textarea
							id="free-text"
							name="freeText"
							maxlength="2000"
							rows="4"
							value={freeText}
							oninput={(event) => setFreeText(event.currentTarget.value)}
							aria-describedby="free-text-count"
							class="block w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-base leading-6 text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							placeholder="Share any context that may help us understand your request."
						></textarea>
						<p id="free-text-count" class="text-right text-xs tabular-nums text-muted-foreground">{freeText.length} / 2,000 characters</p>
						<p class="text-sm leading-6 text-muted-foreground">This note is optional and is not used to calculate your estimate.</p>
					</div>
				{/if}
			</div>

			{#if errorMessage}
				<p role="alert" class="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive">{errorMessage}</p>
			{/if}

			<div class="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
				{#if stepIndex > 0}
					<button
						type="button"
						onclick={goBack}
						disabled={isSubmitting}
						class="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
					>
						Back
					</button>
				{:else}
					<span></span>
				{/if}
				{#if stepIndex < STEP_COUNT - 1}
					<button
						type="button"
						onclick={advanceStep}
						disabled={isSubmitting}
						class="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
					>
						Continue
					</button>
				{:else}
					<button
						type="button"
						onclick={submitEstimate}
						disabled={isSubmitting}
						class="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70"
					>
						{submitButtonLabel}
					</button>
				{/if}
			</div>
		</div>
	</section>

	<p class="px-1 text-sm leading-6 text-muted-foreground">
		Your answers are used to create this estimate. This is an indicative range, not a final quote.
	</p>
</section>
