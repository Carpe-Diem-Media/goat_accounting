<script lang="ts">
  import type { PrimaryInterest } from "$lib/domain/lead_schema";

  type FormStatus = { type: "success" | "error"; message: string } | null;

  const focusOptions: PrimaryInterest[] = [
    "Retirement",
    "Investments",
    "Risk Cover",
    "General",
  ];

  const timeSlots = generateTimeSlots();

  const minDate = getTomorrowDateString();

  let selectedDate = $state(minDate);
  let selectedTime = $state("");
  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let focus = $state<PrimaryInterest>("Investments");
  let isSubmitting = $state(false);
  let formStatus = $state<FormStatus>(null);

  function getTomorrowDateString(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function generateTimeSlots(): { value: string; label: string }[] {
    const slots: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 16; hour++) {
      for (const minute of [0, 30]) {
        if (hour === 16 && minute === 30) continue;
        const hh = String(hour).padStart(2, "0");
        const mm = String(minute).padStart(2, "0");
        slots.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
      }
    }
    return slots;
  }

  function buildAppointmentIso(date: string, time: string): string {
    return `${date}T${time}:00+02:00`;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    formStatus = null;

    if (!selectedTime) {
      formStatus = { type: "error", message: "Please select a preferred time." };
      return;
    }

    isSubmitting = true;

    try {
      const payload = {
        client_name: name,
        client_email: email,
        client_phone: phone,
        primary_interest: focus,
        appointment_start_iso: buildAppointmentIso(selectedDate, selectedTime),
      };

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        formStatus = {
          type: "success",
          message: "Request sent! Rossouw will confirm your booking shortly.",
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
        message: "Unable to send your request right now. Please try again.",
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
      required
    >
      <option value="" disabled>Select a time</option>
      {#each timeSlots as slot}
        <option value={slot.value}>{slot.label}</option>
      {/each}
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
