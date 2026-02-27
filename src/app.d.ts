type BookingStateKV = {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
};

declare global {
	namespace App {
		interface Platform {
			env: {
				BOOKING_STATE: BookingStateKV;
				CALENDAR_PROVIDER?: 'google' | 'microsoft' | string;
				CALENDAR_ID?: string;
				CALENDAR_ACCESS_TOKEN?: string;
				CALENDAR_API_KEY?: string;
				GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
				GOOGLE_CALENDAR_ID?: string;
				MS_GRAPH_ACCESS_TOKEN?: string;
				MS_GRAPH_SCHEDULE_ID?: string;
				MS_GRAPH_USER_ID?: string;
				CALENDAR_EVENT_DURATION_MINUTES?: string;
				RESEND_API_KEY?: string;
				RESEND_FROM_EMAIL?: string;
				ADVISOR_EMAIL?: string;
			};
		}
	}
}

export {};
