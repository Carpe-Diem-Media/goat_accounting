<script lang="ts">
 import { onDestroy } from 'svelte';
 import { contactInputSchema } from '$lib/domain/leads/contact';

 let { publicRef, siteKey, showBusinessName = false }: { publicRef: string; siteKey: string; showBusinessName?: boolean } = $props();
 type WidgetApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
 };
 let container = $state<HTMLDivElement>();
 let api: WidgetApi | undefined;
 let widgetId: string | undefined;
 let script: HTMLScriptElement | undefined;
 let disposed = false;
 let fullName = $state('');
 let email = $state('');
 let phone = $state('');
 let businessName = $state('');
 let preferredContactMethod = $state<'email' | 'phone'>('email');
 let requestedContact = $state(false);
 let requestedEstimateEmail = $state(false);
 let contactConsent = $state(false);
 let token = $state('');
 let busy = $state(false);
 let saved = $state(false);
 let error = $state('');
 let verificationMessage = $state('Complete the security check before saving your request.');
 let errors = $state<Record<string, string>>({});
 let errorHeading = $state<HTMLParagraphElement>();
 const inputClass = 'mt-1 min-h-12 w-full rounded-md border border-muted-foreground bg-background px-3 py-2 text-base text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55';
 const checkboxClass = 'size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55';
 const fieldMessages: Record<string, string> = {
  fullName: 'Enter your full name, up to 250 characters.', email: 'Enter a valid email address, up to 320 characters.',
  phone: 'Enter a phone number with 7 to 15 digits, including the country code where needed.',
  businessName: 'Use up to 250 characters for the business name.',
  preferredContactMethod: 'Choose email or phone.', contactConsent: 'Give consent to fulfil the requests you selected.',
  requestedContact: 'Select at least one request.', requestedEstimateEmail: 'Select at least one request.'
 };
 function values() { return { fullName, email, phone, businessName, preferredContactMethod, contactConsent, requestedContact, requestedEstimateEmail }; }
 function validate(field?: string): boolean {
  const result = contactInputSchema.safeParse(values());
  const next: Record<string, string> = {};
  if (!result.success) for (const issue of result.error.issues) {
   const key = String(issue.path[0]);
   next[key] = fieldMessages[key] ?? 'Check this field.';
  }
  errors = field ? { ...errors, [field]: next[field] ?? '' } : next;
  return result.success;
 }
 function renderWidget() {
  if (disposed || widgetId !== undefined || !container) return;
  api = (window as Window & { turnstile?: WidgetApi }).turnstile;
  if (!api) return;
  try {
   widgetId = api.render(container, {
    sitekey: siteKey, action: 'estimate_contact',
    callback: (value: string) => { token = value; verificationMessage = 'Security check complete.'; },
    'expired-callback': () => { token = ''; verificationMessage = 'The security check expired. Complete a fresh check.'; },
    'error-callback': () => { token = ''; verificationMessage = 'The security check is unavailable. Please retry.'; }
   });
  } catch { verificationMessage = 'The security check is unavailable. Please retry.'; }
 }
 function loadWidget() {
  if (disposed) return;
  if ((window as Window & { turnstile?: WidgetApi }).turnstile) { renderWidget(); return; }
  if (script) return;
  script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = renderWidget;
  script.onerror = () => { verificationMessage = 'The security check could not load. Please retry.'; script?.remove(); script = undefined; };
  window.document.head.appendChild(script);
 }
 function resetWidget() {
  token = '';
  verificationMessage = 'Complete a fresh security check before another attempt.';
  if (widgetId !== undefined) {
   try { api?.reset(widgetId); } catch { verificationMessage = 'The security check is unavailable. Please retry.'; }
  } else loadWidget();
 }
 async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (busy || saved) return;
  error = '';
  if (!validate()) { error = 'Check the fields and selections below.'; queueMicrotask(() => errorHeading?.focus()); return; }
  if (!token) { error = 'Complete a fresh security check before saving your request.'; queueMicrotask(() => errorHeading?.focus()); return; }
  const submittedToken = token;
  token = '';
  busy = true;
  try {
   const response = await fetch(`/api/estimates/${publicRef}/contact`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...values(), turnstileToken: submittedToken }), signal: AbortSignal.timeout(15_000)
   });
   const result: unknown = await response.json();
   if (response.ok && result && typeof result === 'object' && 'saved' in result && result.saved === true) {
    saved = true;
    fullName = ''; email = ''; phone = ''; businessName = '';
   } else if (response.status === 409) {
    error = 'A different request has already been saved for this estimate. Its original selections cannot be changed.';
   } else if (response.status === 403) {
    error = 'Complete a fresh security check and try again.';
   } else {
    error = 'Your request could not be confirmed. Complete a fresh security check and retry with the same details and selections.';
   }
  } catch {
   error = 'Your request could not be confirmed. Complete a fresh security check and retry with the same details and selections.';
  } finally {
   busy = false;
   resetWidget();
   if (error) queueMicrotask(() => errorHeading?.focus());
  }
 }
 onDestroy(() => {
  disposed = true;
  if (widgetId !== undefined) api?.remove(widgetId);
  script?.remove();
 });
</script>

<!-- Hallmark · component: contact panel · theme: existing Goat estimator · states: 8 · v2.0.0 -->
<section aria-label="Optional contact" class="border-t border-border pt-6">
 <details ontoggle={(event) => { if (event.currentTarget.open) loadWidget(); }}>
  <summary class="min-h-12 cursor-pointer rounded-md py-3 font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Email estimate or request contact</summary>
  <p class="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">Your estimate is already available. Choose what you would like us to do next.</p>
  {#if saved}
   <div role="status" class="mt-5 border-l-2 border-primary pl-4 text-foreground">
    <p class="font-semibold">Your request has been saved.</p>
    <p class="mt-1 text-sm leading-6">Your selected requests are recorded. This confirmation does not mean an email has been sent.</p>
   </div>
  {:else}
   <form aria-label="Contact request" class="mt-5 space-y-5" novalidate onsubmit={submit}>
    {#if error}<p bind:this={errorHeading} role="alert" tabindex="-1" class="rounded-md border border-destructive p-3 text-sm leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{error}</p>{/if}
    <fieldset disabled={busy} class="space-y-1" aria-describedby="contact-actions-error">
     <legend class="mb-2 text-sm font-semibold text-foreground">Select your requests, at least one required</legend>
     <label class="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-foreground"><input type="checkbox" class={checkboxClass} bind:checked={requestedEstimateEmail} onchange={() => validate('requestedContact')} aria-describedby="contact-actions-error" aria-invalid={!!errors.requestedContact} />Email me this estimate</label>
     <label class="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-foreground"><input type="checkbox" class={checkboxClass} bind:checked={requestedContact} onchange={() => validate('requestedContact')} aria-describedby="contact-actions-error" aria-invalid={!!errors.requestedContact} />Ask Rossouw to contact me</label>
     <p id="contact-actions-error" class="min-h-5 text-sm text-foreground">{errors.requestedContact || 'Once saved, these selections cannot be changed for this estimate.'}</p>
    </fieldset>
    <fieldset disabled={busy} class="grid gap-5 sm:grid-cols-2">
     <legend class="sr-only">Your contact details</legend>
     <div><label for="contact-name" class="text-sm font-medium text-foreground">Full name <span class="font-normal">(required)</span></label><input id="contact-name" name="fullName" autocomplete="name" required maxlength="250" class={inputClass} bind:value={fullName} onblur={() => validate('fullName')} oninput={() => { if (errors.fullName) validate('fullName'); }} aria-invalid={!!errors.fullName} aria-describedby="contact-name-error" /><p id="contact-name-error" class="mt-1 min-h-5 text-sm text-foreground">{errors.fullName || ''}</p></div>
     <div><label for="contact-email" class="text-sm font-medium text-foreground">Email address <span class="font-normal">(required)</span></label><input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="320" class={inputClass} bind:value={email} onblur={() => validate('email')} oninput={() => { if (errors.email) validate('email'); }} aria-invalid={!!errors.email} aria-describedby="contact-email-error" /><p id="contact-email-error" class="mt-1 min-h-5 text-sm text-foreground">{errors.email || ''}</p></div>
     <div><label for="contact-phone" class="text-sm font-medium text-foreground">Phone number (optional)</label><input id="contact-phone" name="phone" type="tel" autocomplete="tel" maxlength="64" required={preferredContactMethod === 'phone'} class={inputClass} bind:value={phone} onblur={() => validate('phone')} aria-invalid={!!errors.phone} aria-describedby="contact-phone-error" /><p id="contact-phone-error" class="mt-1 min-h-5 text-sm text-foreground">{errors.phone || 'Required if you prefer a phone call.'}</p></div>
     {#if showBusinessName}<div><label for="contact-business" class="text-sm font-medium text-foreground">Business name (optional)</label><input id="contact-business" name="businessName" autocomplete="organization" maxlength="250" class={inputClass} bind:value={businessName} onblur={() => validate('businessName')} aria-invalid={!!errors.businessName} aria-describedby="contact-business-error" /><p id="contact-business-error" class="mt-1 min-h-5 text-sm text-foreground">{errors.businessName || ''}</p></div>{/if}
     <div><label for="contact-method" class="text-sm font-medium text-foreground">Preferred contact method</label><select id="contact-method" name="preferredContactMethod" class={inputClass} bind:value={preferredContactMethod} onchange={() => validate('phone')}><option value="email">Email</option><option value="phone">Phone</option></select></div>
    </fieldset>
    <label class="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm leading-6 text-foreground"><input type="checkbox" required class={`${checkboxClass} mt-0.5`} bind:checked={contactConsent} onchange={() => validate('contactConsent')} disabled={busy} aria-invalid={!!errors.contactConsent} aria-describedby="contact-consent-error" />I consent to Goat Accounting using these details to fulfil my selected requests.</label>
    <p id="contact-consent-error" class="min-h-5 text-sm text-foreground">{errors.contactConsent || 'This is service consent. It does not subscribe you to marketing.'}</p>
    <div bind:this={container} class="max-w-full" aria-describedby="contact-verification"></div>
    <p id="contact-verification" role="status" class="text-sm text-muted-foreground">{verificationMessage}</p>
    <noscript><p class="text-sm text-foreground">JavaScript is required for the security check. Your estimate remains available above.</p></noscript>
    <div class="flex flex-wrap gap-3">
     <button type="submit" disabled={busy} class="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55">{busy ? 'Saving your request…' : 'Save my request'}</button>
     <button type="button" disabled={busy} onclick={resetWidget} class="min-h-12 rounded-md px-3 py-2 text-sm text-foreground underline underline-offset-4 hover:text-primary active:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55">Retry security check</button>
    </div>
   </form>
  {/if}
 </details>
</section>
