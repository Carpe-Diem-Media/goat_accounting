export const MEETING_DURATION_MINUTES = 60;
export const BUFFER_MINUTES = 15;
export const MINIMUM_NOTICE_HOURS = 24;
export const WORK_DAY_START_HOUR = 9; // SAST
export const WORK_DAY_END_HOUR = 16; // SAST

const SAST_OFFSET = '+02:00';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60 * 1000;
const SLOT_DURATION_MS = MEETING_DURATION_MINUTES * MINUTE_MS;
const BUFFER_MS = BUFFER_MINUTES * MINUTE_MS;
const NOTICE_MS = MINIMUM_NOTICE_HOURS * 60 * MINUTE_MS;
const SLOT_STEP_MS = (MEETING_DURATION_MINUTES + BUFFER_MINUTES) * MINUTE_MS;

export type BusyWindow = { start: string; end: string };

function formatSastIso(ms: number): string {
	const sastMs = ms + 2 * 60 * 60 * 1000;
	const d = new Date(sastMs);
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	const hh = String(d.getUTCHours()).padStart(2, '0');
	const mi = String(d.getUTCMinutes()).padStart(2, '0');
	const ss = String(d.getUTCSeconds()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${SAST_OFFSET}`;
}

function buildSastMs(dateString: string, hour: number, minute: number): number {
	return Date.parse(
		`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${SAST_OFFSET}`
	);
}

function parseIsoMs(iso: string): number {
	return Date.parse(iso);
}

export function generateBaseSlots(dateString: string): string[] {
	if (!DATE_REGEX.test(dateString)) return [];

	const dayStartMs = buildSastMs(dateString, WORK_DAY_START_HOUR, 0);
	const dayEndMs = buildSastMs(dateString, WORK_DAY_END_HOUR, 0);
	if (Number.isNaN(dayStartMs) || Number.isNaN(dayEndMs) || dayEndMs <= dayStartMs) return [];

	const slots: string[] = [];
	for (let startMs = dayStartMs; startMs + SLOT_DURATION_MS <= dayEndMs; startMs += SLOT_STEP_MS) {
		slots.push(formatSastIso(startMs));
	}

	return slots;
}

export function enforceNoticePeriod(slots: string[], nowUtc: Date = new Date()): string[] {
	const nowMs = nowUtc.getTime();
	if (Number.isNaN(nowMs)) return [];

	return slots.filter((slot) => {
		const slotMs = parseIsoMs(slot);
		if (Number.isNaN(slotMs)) return false;
		return slotMs - nowMs >= NOTICE_MS;
	});
}

export function removeBusySlots(availableSlots: string[], busyWindows: BusyWindow[]): string[] {
	const normalizedBusyWindows = busyWindows
		.map((window) => ({
			startMs: parseIsoMs(window.start),
			endMs: parseIsoMs(window.end)
		}))
		.filter((window) => !Number.isNaN(window.startMs) && !Number.isNaN(window.endMs) && window.endMs > window.startMs);

	return availableSlots.filter((slotIso) => {
		const slotStartMs = parseIsoMs(slotIso);
		if (Number.isNaN(slotStartMs)) return false;

		const slotEndMs = slotStartMs + SLOT_DURATION_MS;
		const conflicts = normalizedBusyWindows.some((busy) => {
			const blockedStartMs = busy.startMs - BUFFER_MS;
			const blockedEndMs = busy.endMs + BUFFER_MS;
			return slotStartMs < blockedEndMs && slotEndMs > blockedStartMs;
		});

		return !conflicts;
	});
}
