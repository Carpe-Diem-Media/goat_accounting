<script lang="ts">
  import type { PrimaryInterest } from "$lib/domain/lead_schema";

  type FormStatus = { type: "success" | "error"; message: string } | null;

  const focusOptions: PrimaryInterest[] = [
    "Retirement",
    "Investments",
    "Risk Cover",
    "General",
  ];

  const minDate = getTomorrowDateString();
  let availabilityRequestId = 0;

  let selectedDate = $state(minDate);
  let selectedTime = $state("");
  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let focus = $state<PrimaryInterest>("Investments");
  let availableSlots = $state<string[]>([]);
  let isLoadingSlots = $state(false);
  let isSubmitting = $state(false);
  let formStatus = $state<FormStatus>(null);

  $effect(() => {
    const date = selectedDate;
    selectedTime = "";
    availableSlots = [];

    if (!date) {
      isLoadingSlots = false;
      return;
    }

    void fetchAvailability(date);
  });

  function getTomorrowDateString(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatSlotLabel(slot: string): string {
    const parsed = new Date(slot);
    if (Number.isNaN(parsed.getTime())) return slot;

    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  async function fetchAvailability(date: string) {
    const requestId = ++availabilityRequestId;
    isLoadingSlots = true;

    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
      const data = (await response.json()) as { open_slots?: string[]; error?: unknown };

      if (requestId !== availabilityRequestId) return;

      if (response.ok && Array.isArray(data.open_slots)) {
        availableSlots = data.open_slots;
      } else {
        availableSlots = [];
      }
    } catch {
      if (requestId !== availabilityRequestId) return;
      availableSlots = [];
    } finally {
      if (requestId === availabilityRequestId) {
        isLoadingSlots = false;
      }
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    formStatus = null;

    if (!selectedTime) {
      formStatus = { type: "error", message: "Please select an available time slot." };
      return;
    }

    isSubmitting = true;

    try {
      const payload = {
        client_name: name,
        client_email: email,
        client_phone: phone,
        primary_interest: focus,
        appointment_start_iso: selectedTime,
        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        formStatus = {
          type: "error",
          message: "This slot was just booked by someone else. Please select another time.",
        };
        selectedTime = "";
        await fetchAvailability(selectedDate);
        return;
      }

      if (response.ok) {
        formStatus = {
          type: "success",
          message: "Booking confirmed! Check your email for details.",
        };
        name = "";
        email = "";
        phone = "";
        focus = "Investments";
        selectedTime = "";
        return;
      }

      formStatus = {
        type: "error",
        message: "Unable to confirm your booking right now. Please try again.",
      };
    } catch {
      formStatus = {
        type: "error",
        message: "Unable to submit right now. Please check your connection and try again.",
      };
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-5">
  <div>
    <label for="date" class="mb-1 block text-sm font-medium text-foreground">Preferred date</label>
    <input
      id="date"
      type="date"
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      min={minDate}
      bind:value={selectedDate}
      required
    />
  </div>

  <div>
    <label for="time" class="mb-1 block text-sm font-medium text-foreground">Preferred time (SAST)</label>
    <select
      id="time"
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      bind:value={selectedTime}
      disabled={isLoadingSlots || availableSlots.length === 0}
      required
    >
      <option value="" disabled>
        {#if isLoadingSlots}
          Loading available slots...
        {:else if availableSlots.length === 0}
          No available slots for this date
        {:else}
          Select a time
        {/if}
      </option>
      {#if availableSlots.length > 0}
        {#each availableSlots as slot}
          <option value={slot}>{formatSlotLabel(slot)}</option>
        {/each}
      {/if}
    </select>
  </div>

  <div>
    <label for="name" class="mb-1 block text-sm font-medium text-foreground">Name</label>
    <input
      id="name"
      type="text"
      bind:value={name}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      placeholder="Your full name"
      required
    />
  </div>

  <div>
    <label for="email" class="mb-1 block text-sm font-medium text-foreground">Email</label>
    <input
      id="email"
      type="email"
      bind:value={email}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      placeholder="name@email.com"
      required
    />
  </div>

  <div>
    <label for="phone" class="mb-1 block text-sm font-medium text-foreground">Mobile (South Africa)</label>
    <input
      id="phone"
      type="tel"
      bind:value={phone}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      placeholder="+27 82 123 4567"
      required
    />
  </div>

  <div>
    <label for="focus" class="mb-1 block text-sm font-medium text-foreground">What is your primary focus today?</label>
    <select
      id="focus"
      bind:value={focus}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-colors duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      required
    >
      {#each focusOptions as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </div>

  <button
    type="submit"
    class="btn-gold-gradient inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={isSubmitting || !selectedDate || !selectedTime}
  >
    {#if isSubmitting}
      Confirming...
    {:else}
      Confirm Booking
    {/if}
  </button>

  {#if formStatus?.type === "success"}
    <p class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
      {formStatus.message}
    </p>
  {:else if formStatus?.type === "error"}
    <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {formStatus.message}
    </p>
  {/if}
</form>
