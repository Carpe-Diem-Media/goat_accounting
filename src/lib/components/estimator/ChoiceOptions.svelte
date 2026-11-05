<script lang="ts">
	type Choice = Readonly<{ value: string; label: string }>;
	type Props = Readonly<{
		groupId: string;
		legend: string;
		mode: 'single' | 'multi';
		options: readonly Choice[];
		selected: readonly string[];
		describedBy?: string;
		onSelect: (value: string) => void;
	}>;

	let { groupId, legend, mode, options, selected, describedBy, onSelect }: Props = $props();
</script>

<fieldset class="min-w-0" aria-describedby={describedBy}>
	<legend class="sr-only">{legend}</legend>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		{#each options as option (option.value)}
			<label
				for={`${groupId}-${option.value}`}
				class="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm leading-5 transition-colors hover:border-primary/60 active:scale-[0.995] has-[:checked]:border-primary has-[:checked]:bg-accent/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
			>
				<input
					id={`${groupId}-${option.value}`}
					name={groupId}
					type={mode === 'single' ? 'radio' : 'checkbox'}
					value={option.value}
					checked={selected.includes(option.value)}
					onchange={() => onSelect(option.value)}
					class="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<span class="text-foreground">{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>
