<script lang="ts">
 const acceptanceLabels = { submit: 'Submit manifest', approve: 'Approve manifest', activate: 'Activate pricing model' };
 const confidenceLabels = { high: 'High', good: 'Good', preliminary: 'Preliminary' };
 const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
 function formatRange({ minCents, maxCents }: { minCents: number; maxCents: number }) {
  return `${money.format(minCents / 100)} – ${money.format(maxCents / 100)}`;
 }
 let {data,form}=$props();
 let errorField=$derived(form && "field" in form ? form.field : undefined);
 let errorMessage=$derived(form && "fieldMessage" in form ? form.fieldMessage : undefined);
 let indexedFields=$derived(data.fields.map((field,index)=>({...field,index})));
 let confidenceFields=$derived(indexedFields.filter(field=>field.path[0]==='confidenceThresholds'));
 let ruleGroups=$derived(data.draft.rules.map((rule,index)=>({rule,fields:indexedFields.filter(field=>field.path[0]==='rules' && field.path[1]===index)})));
</script>
<svelte:head><title>Pricing {data.draft.model.version} | Goat Accounting staff</title></svelte:head>
<section>
 <a href="/admin/pricing" class="text-sm underline focus-visible:outline-2 focus-visible:outline-ring">Back to pricing models</a>
 <h1 class="font-display mt-4 min-w-0 break-words text-3xl font-semibold tracking-tight">Pricing model</h1>
 <p class="mt-2 min-w-0 break-words text-sm">Version: {data.draft.model.version}</p>
 <p class="mt-2 text-sm text-muted-foreground">State: {data.draft.model.state}</p>
 <p class="mt-1 text-sm text-muted-foreground">Created: {new Date(data.draft.createdAt).toLocaleString('en-ZA')}{#if data.draft.activatedAt}<br />Activated: {new Date(data.draft.activatedAt).toLocaleString('en-ZA')}{/if}{#if data.draft.retiredAt}<br />Retired: {new Date(data.draft.retiredAt).toLocaleString('en-ZA')}{/if}</p>
 {#if data.draft.checksum}<p class="mt-1 break-all text-sm text-muted-foreground">Checksum: {data.draft.checksum}</p>{/if}
 {#if form?.message}<p role="alert" class="mt-4 rounded border border-border p-3 text-sm">{form.message}</p>{/if}
 <section aria-labelledby="acceptance-heading" class="mt-6 min-w-0 rounded-lg border border-border bg-card p-5">
  <h2 id="acceptance-heading" class="text-lg font-semibold">Pricing acceptance</h2>
  {#if data.acceptance.summary}
   <p class="mt-2 break-all text-sm">Manifest {data.acceptance.summary.revision}</p>
   <p class="mt-1 break-all text-sm text-muted-foreground">Fingerprint {data.acceptance.summary.fingerprint}</p>
   <p class="mt-1 text-sm">Approval status: {data.acceptance.summary.state}</p>
   {#if data.acceptance.summary.approvedAt}
    <p class="mt-1 text-sm text-muted-foreground">Approved {new Date(data.acceptance.summary.approvedAt).toLocaleString('en-ZA')}</p>
   {/if}
  {:else}
   <p class="mt-2 text-sm">Approval status: pending submission</p>
  {/if}
  {#if data.acceptance.report}
   {#if data.acceptance.report.manifestRevision !== data.acceptance.summary?.revision}
    <p class="mt-1 break-all text-sm">Candidate manifest {data.acceptance.report.manifestRevision}</p>
   {/if}
   <details class="mt-3 text-sm">
    <summary class="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
     {data.acceptance.report.passed ? 'All ' + data.acceptance.report.scenarios.length + ' acceptance scenarios passed' : 'Acceptance scenarios failed'}
    </summary>
    <ul class="mt-2 divide-y divide-border">
     {#each data.acceptance.reviewScenarios ?? [] as scenario (scenario.id)}
      <li class="py-2">
       <details>
        <summary class="cursor-pointer break-words focus-visible:outline-2 focus-visible:outline-ring">
         {scenario.id}: {scenario.passed ? 'Passed' : 'Failed'}
        </summary>
        {#if !scenario.passed}
         <p class="mt-2 break-words">Failed checks: {scenario.failures.join(', ')}</p>
        {/if}
        <dl aria-label="Expected outcomes" class="mt-2 grid gap-x-4 gap-y-2 rounded-md bg-muted p-3 sm:grid-cols-2">
         <div><dt class="font-medium">Once-off catch-up</dt><dd>{formatRange(scenario.expected.catchup)}</dd></div>
         <div><dt class="font-medium">Monthly ongoing</dt><dd>{formatRange(scenario.expected.ongoing)}</dd></div>
         <div><dt class="font-medium">Expected confidence</dt><dd>{confidenceLabels[scenario.expected.confidence]}</dd></div>
         <div><dt class="font-medium">Expected manual review</dt><dd>{scenario.expected.manualReviewRequired ? 'Required' : 'Not required'}</dd></div>
         {#if scenario.expected.reviewFlagCodes.length}
          <div class="min-w-0 sm:col-span-2">
           <dt class="font-medium">Expected review flags</dt>
           <dd class="break-words">{scenario.expected.reviewFlagCodes.join(', ')}</dd>
          </div>
         {/if}
         <div class="min-w-0 sm:col-span-2">
          <dt class="font-medium">Expected pricing rules</dt>
          <dd class="break-words">{scenario.expected.ruleCodes.join(', ') || 'None'}</dd>
         </div>
        </dl>
       </details>
      </li>
     {/each}
    </ul>
   </details>
  {/if}
  {#if data.draft.model.state === 'DRAFT'}
   {#if data.acceptance.action === 'activate'}
    <p class="mt-3 text-sm">Activation is available. Activating this draft replaces the current active pricing model.</p>
   {:else if data.acceptance.action}
    <p class="mt-3 text-sm text-muted-foreground">Activation is available after approval of this manifest.</p>
   {:else}
    <p class="mt-3 text-sm text-muted-foreground">Activation requires the reviewed V1 draft and a passing, approved manifest. Changed prices need a new reviewed release.</p>
   {/if}
   {#if data.acceptance.action}
    <form method="POST" action={`?/${data.acceptance.action}`} class="mt-3">
     <input type="hidden" name="revision" value={data.draft.revision} />
     <input type="hidden" name="fingerprint" value={data.fingerprint} />
     <input type="hidden" name="manifestId" value={data.acceptance.summary?.state === 'INVALIDATED' ? '' : data.acceptance.summary?.id ?? ''} />
     <button class="min-h-11 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px motion-reduce:active:translate-y-0">
      {acceptanceLabels[data.acceptance.action]}
     </button>
    </form>
   {/if}
  {/if}
 </section>
 {#if data.draft.model.state==='DRAFT'}
  <p class="mt-2 break-all text-sm text-muted-foreground">Draft fingerprint: {data.fingerprint}</p>
  <p class="mt-1 break-all text-sm text-muted-foreground">Model ID: {data.draft.model.id}</p>
  <form method="POST" action="?/save" class="mt-6 space-y-6">
   <input type="hidden" name="revision" value={data.draft.revision} />
   <div class="min-w-0 rounded-lg border border-border bg-card p-5"><h2 class="font-semibold">Enabled rules</h2><fieldset class="min-w-0 pt-3"><legend class="sr-only">Enabled rules</legend>
    <p class="mb-3 text-sm text-muted-foreground">Required pricing and review safeguards must remain enabled.</p>
    <div class="grid gap-3 sm:grid-cols-2">{#each data.draft.rules as rule,index (rule.id)}<label class="flex items-start gap-2 text-sm"><input type="checkbox" name={`enabled.${index}`} checked={rule.enabled} class="mt-1 rounded border-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /><span>{rule.rule.label} <span class="block text-xs text-muted-foreground">{rule.rule.code}</span></span></label>{/each}</div>
   </fieldset></div>
   <div class="min-w-0 rounded-lg border border-border bg-card p-5"><h2 class="font-semibold">Commercial values</h2><fieldset class="min-w-0 pt-3"><legend class="sr-only">Commercial values</legend>
    <p class="mb-4 text-sm text-muted-foreground">Enter amounts as whole cents. Rule conditions and identifiers cannot be edited.</p>
    <div class="grid gap-4 sm:grid-cols-2">{#each confidenceFields as field}<label class="block min-w-0 break-words text-sm font-medium">{field.label}<input required type="number" min="0" step="1" name={`field.${field.index}`} value={field.value} aria-invalid={errorField===field.index?'true':undefined} aria-describedby={errorField===field.index?`field-error-${field.index}`:undefined} class="mt-1 block min-w-0 w-full rounded-md border border-foreground/60 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" />{#if errorField===field.index}<span id={`field-error-${field.index}`} class="mt-1 block text-sm">{errorMessage}</span>{/if}</label>{/each}</div>
    <div class="mt-4 divide-y divide-border">{#each ruleGroups as group (group.rule.id)}<details open={group.fields.some(field=>field.index===errorField)} class="py-3"><summary class="cursor-pointer break-words text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">{group.rule.rule.label} <span class="text-muted-foreground">({group.rule.rule.code})</span></summary><div class="mt-3 grid gap-4 sm:grid-cols-2">{#each group.fields as field}<label class="block min-w-0 break-words text-sm font-medium">{field.label}<input required type={field.kind==='number'?'number':'text'} min={field.kind==='number'?0:undefined} step={field.kind==='number'?1:undefined} name={`field.${field.index}`} value={field.value} aria-invalid={errorField===field.index?'true':undefined} aria-describedby={errorField===field.index?`field-error-${field.index}`:undefined} class="mt-1 block min-w-0 w-full rounded-md border border-foreground/60 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" />{#if errorField===field.index}<span id={`field-error-${field.index}`} class="mt-1 block text-sm">{errorMessage}</span>{/if}</label>{/each}</div></details>{/each}</div>
   </fieldset></div>
   <button class="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">Save draft</button>
  </form>
  <section class="mt-8 rounded-lg border border-border bg-card p-5" aria-labelledby="scenario-heading">
   <h2 id="scenario-heading" class="text-lg font-semibold">Test candidate scenarios</h2>
   <p class="mt-2 text-sm text-muted-foreground">Paste independently authored expectations for every required scenario case. This report does not approve or activate prices.</p>
   <details class="mt-3 text-sm"><summary class="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Manifest fields</summary><p class="mt-2">Use modelId, definitionFingerprint, revision and scenarios. Include business, personal and combined answers. Each scenario needs an id, answers and expected catchup and ongoing ranges in cents, ruleCodes, confidence, manualReviewRequired and reviewFlagCodes.</p></details>
   <form method="POST" action="?/test" class="mt-4"><label class="block text-sm font-medium">Scenario manifest (JSON)<textarea name="manifest" required maxlength="131072" rows="8" class="mt-1 block min-w-0 w-full rounded-md border border-foreground/60 bg-background px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-ring"></textarea></label><button class="mt-3 min-h-11 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">Run scenarios</button></form>
   {#if form?.report}<div class="mt-4" aria-live="polite"><h3 class="font-semibold">{form.report.passed?'All scenarios passed':'Some scenarios failed'}</h3><p class="mt-1 break-all text-sm">Manifest {form.report.manifestRevision}, {form.report.requiredScenarioCount} required cases, fingerprint {form.report.fingerprint}</p><ul class="mt-2 list-disc pl-5 text-sm">{#each form.report.scenarios as scenario}<li>{scenario.id}: {scenario.passed?'Passed':scenario.failures.join(', ')}</li>{/each}</ul></div>{/if}
  </section>
 {:else}
  <h2 class="mt-6 text-lg font-semibold">Rules</h2><ul class="mt-3 divide-y divide-border rounded-lg border border-border bg-card">{#each data.draft.rules as rule (rule.id)}<li class="p-3 text-sm">{rule.rule.label} <span class="text-muted-foreground">({rule.rule.code}, {rule.enabled?'enabled':'disabled'})</span></li>{/each}</ul>
  <h2 class="mt-6 text-lg font-semibold">Commercial values</h2><dl class="mt-3 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">{#each data.fields as field}<div><dt class="text-sm text-muted-foreground">{field.label}</dt><dd class="break-words text-sm">{field.value}</dd></div>{/each}</dl>
 {/if}
</section>
