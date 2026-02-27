<script lang="ts">
  import { LeadSchema, type PrimaryInterest } from "$lib/domain/lead_schema";

  type FocusSelection =
    | "Wealth & Investments"
    | "Tax Consulting"
    | "Financial Statements"
    | "General/Full Review";

  type FieldErrors = {
    client_name?: string;
    client_email?: string;
    client_phone?: string;
    focus_selection?: string;
  };

  const focusOptions: FocusSelection[] = [
    "Wealth & Investments",
    "Tax Consulting",
    "Financial Statements",
    "General/Full Review",
  ];

  const availability = buildMockAvailability();
  const availableDates = Object.keys(availability);

  let selectedDate = $state(availableDates[0] ?? "");
  let selectedTime = $state("");
  let focusSelection = $state<FocusSelection>("Wealth & Investments");
  let errors = $state<FieldErrors>({});
  let statusMessage = $state("");
  let statusType = $state<"success" | "error" | "idle">("idle");

  let form = $state(blankForm());
  const availableTimes = $derived(selectedDate ? availability[selectedDate] ?? [] : []);

  $effect(() => {
    if (!availableTimes.includes(selectedTime)) {
      selectedTime = availableTimes[0] ?? "";
    }
  });

  function blankForm() {
    return {
      client_name: "",
      client_email: "",
      client_phone: "",
    };
  }

  function mapFocusToPrimaryInterest(focus: FocusSelection): PrimaryInterest {
    if (focus === "Wealth & Investments") return "Investments";
    return "General";
  }

  function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function buildMockAvailability(): Record<string, string[]> {
    const slots: Record<string, string[]> = {};
    const now = new Date();

    for (let i = 1; i <= 18; i += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const day = date.getDay();

      if (day === 0 || day === 6) continue;

      const key = toDateKey(date);
      slots[key] = ["09:00", "10:30", "13:00", "15:30"];
      if (Object.keys(slots).length >= 10) break;
    }

    return slots;
  }

  function buildAppointmentIso(date: string, time: string): string {
    return `${date}T${time}:00+02:00`;
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    statusMessage = "";
    statusType = "idle";
    errors = {};

    const payload = {
      ...form,
      primary_interest: mapFocusToPrimaryInterest(focusSelection),
      appointment_start_iso: buildAppointmentIso(selectedDate, selectedTime),
    };

    const validated = LeadSchema.safeParse(payload);
    if (!validated.success) {
      const flattened = validated.error.flatten().fieldErrors;
      errors = {
        client_name: flattened.client_name?.[0],
        client_email: flattened.client_email?.[0],
        client_phone: flattened.client_phone?.[0],
        focus_selection: flattened.primary_interest?.[0],
      };
      if (flattened.appointment_start_iso?.[0]) {
        statusType = "error";
        statusMessage = flattened.appointment_start_iso[0];
      }
      return;
    }

    statusType = "success";
    statusMessage = "Booking request captured. Next step: connect this form to your booking API endpoint.";
    form = blankForm();
    selectedTime = availableTimes[0] ?? "";
  }
</script>

<form onsubmit={onSubmit} class="space-y-5">
  <div>
    <label for="date" class="mb-1 block text-sm font-medium text-foreground">Preferred date</label>
    <select
      id="date"
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      bind:value={selectedDate}
      required
    >
      {#each availableDates as date}
        <option value={date}>{date}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="time" class="mb-1 block text-sm font-medium text-foreground">Preferred time (SAST)</label>
    <select
      id="time"
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      bind:value={selectedTime}
      required
    >
      {#if availableTimes.length === 0}
        <option value="">No mock slots available</option>
      {:else}
        {#each availableTimes as slot}
          <option value={slot}>{slot}</option>
        {/each}
      {/if}
    </select>
  </div>

  <div>
    <label for="name" class="mb-1 block text-sm font-medium text-foreground">Name</label>
    <input
      id="name"
      type="text"
      bind:value={form.client_name}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      placeholder="Your full name"
      required
    />
    {#if errors.client_name}
      <p class="mt-1 text-xs text-destructive">{errors.client_name}</p>
    {/if}
  </div>

  <div>
    <label for="email" class="mb-1 block text-sm font-medium text-foreground">Email</label>
    <input
      id="email"
      type="email"
      bind:value={form.client_email}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      placeholder="name@email.com"
      required
    />
    {#if errors.client_email}
      <p class="mt-1 text-xs text-destructive">{errors.client_email}</p>
    {/if}
  </div>

  <div>
    <label for="phone" class="mb-1 block text-sm font-medium text-foreground">Mobile (South Africa)</label>
    <input
      id="phone"
      type="tel"
      bind:value={form.client_phone}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      placeholder="+27 82 123 4567"
      required
    />
    {#if errors.client_phone}
      <p class="mt-1 text-xs text-destructive">{errors.client_phone}</p>
    {/if}
  </div>

  <div>
    <label for="focus" class="mb-1 block text-sm font-medium text-foreground">What is your primary focus today?</label>
    <select
      id="focus"
      bind:value={focusSelection}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:border-ring focus:ring-2 focus:ring-ring/30"
      required
    >
      {#each focusOptions as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
    {#if errors.focus_selection}
      <p class="mt-1 text-xs text-destructive">{errors.focus_selection}</p>
    {/if}
  </div>

  <button
    type="submit"
    class="inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
    disabled={!selectedDate || !selectedTime}
  >
    Confirm Booking
  </button>

  {#if statusType === "success"}
    <p class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
      {statusMessage}
    </p>
  {:else if statusType === "error"}
    <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {statusMessage}
    </p>
  {/if}
</form>
