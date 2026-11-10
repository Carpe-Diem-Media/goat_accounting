<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  const metrics = $derived(data.metrics);
  function rand(cents: string, roundUp = false): string {
    const value = BigInt(cents);
    const amount = roundUp ? (value + 99n) / 100n : value / 100n;
    return `R${new Intl.NumberFormat('en-ZA').format(amount)}`;
  }
  function range(min: string, max: string): string { return `${rand(min)} – ${rand(max, true)}`; }
  let conversion = $derived(metrics.completed ? `${(100 * metrics.with_contact / metrics.completed).toFixed(1)}%` : '—');
</script>

<svelte:head><title>Dashboard | Goat Accounting staff</title></svelte:head>
<section aria-labelledby="dashboard-heading" class="space-y-7">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="space-y-2">
      <h1 id="dashboard-heading" class="font-display text-3xl font-semibold text-foreground">Dashboard</h1>
      <p class="max-w-2xl text-sm leading-6 text-muted-foreground">A read-only overview of saved estimates, contact requests and notification failures.</p>
    </div>
    <form method="GET" class="flex items-end gap-2">
      <label class="text-sm font-medium" for="days">Period
        <select id="days" name="days" class="mt-1 block min-h-11 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <option value="7" selected={data.period.days === 7}>Last 7 days</option>
          <option value="30" selected={data.period.days === 30}>Last 30 days</option>
          <option value="90" selected={data.period.days === 90}>Last 90 days</option>
        </select>
      </label>
      <button type="submit" class="min-h-11 rounded-md border border-border px-4 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
    </form>
  </header>
  {#if metrics.completed === 0}
    <p role="status" class="border-l-2 border-primary pl-4 text-sm leading-6">No estimates were saved in this period. Other activity may still appear below.</p>
  {/if}
  <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Completed estimates</dt><dd class="mt-2 text-3xl font-semibold tabular-nums">{metrics.completed}</dd><p class="mt-2 text-sm text-muted-foreground">{metrics.today} today, South African time</p></div>
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Contact conversion</dt><dd class="mt-2 text-3xl font-semibold tabular-nums">{conversion}</dd><p class="mt-2 text-sm text-muted-foreground">{metrics.with_contact} of {metrics.completed} estimates have a saved request.</p></div>
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">New leads</dt><dd class="mt-2 text-3xl font-semibold tabular-nums">{metrics.new_leads}</dd></div>
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Catch-up opportunity</dt><dd class="mt-2 text-2xl font-semibold tabular-nums">{range(metrics.catchup_min_cents, metrics.catchup_max_cents)}</dd></div>
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Monthly opportunity</dt><dd class="mt-2 text-2xl font-semibold tabular-nums">{range(metrics.ongoing_min_cents, metrics.ongoing_max_cents)}</dd></div>
    <div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Manual review</dt><dd class="mt-2 text-3xl font-semibold tabular-nums">{metrics.manual_review}</dd></div>
    {#if metrics.failed_notifications !== null}<div class="rounded-xl border border-border bg-card p-5"><dt class="text-sm text-muted-foreground">Failed notifications</dt><dd class="mt-2 text-3xl font-semibold tabular-nums">{metrics.failed_notifications}</dd></div>{/if}
  </dl>
  <p class="max-w-3xl text-sm leading-6 text-muted-foreground">The period uses a rolling window. Completed estimates include saved historical records. Opportunity ranges and manual review exclude voided and superseded estimates. Contact conversion counts each estimate once when it has a saved request before the end of the period. New leads and failed notifications use their creation dates. Opportunity ranges sum estimates and do not represent guaranteed revenue. Manual review counts flagged estimates in the selected period.</p>
</section>
