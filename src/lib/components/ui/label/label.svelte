<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLLabelAttributes } from "svelte/elements";

	export type LabelProps = WithElementRef<HTMLLabelAttributes>;
</script>

<script lang="ts">
	let {
		class: className,
		ref = $bindable(null),
		children,
		...restProps
	}: LabelProps = $props();
</script>

<label
	bind:this={ref}
	data-slot="label"
	class={cn(
		"flex items-center gap-2 text-sm font-medium leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</label>
