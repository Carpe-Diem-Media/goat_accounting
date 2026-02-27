import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		const name = data.get('name')?.toString().trim() ?? '';
		const email = data.get('email')?.toString().trim() ?? '';
		const service = data.get('service')?.toString().trim() ?? '';
		const date = data.get('date')?.toString().trim() ?? '';
		const message = data.get('message')?.toString().trim() ?? '';

		const errors: Record<string, string> = {};

		if (!name) {
			errors.name = 'Please enter your name.';
		}

		if (!email) {
			errors.email = 'Please enter your email address.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errors.email = 'Please enter a valid email address.';
		}

		if (!message) {
			errors.message = 'Please include a message.';
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, {
				errors,
				values: { name, email, service, date, message },
			});
		}

		// Log to server console (email integration can be added later)
		console.log('[Contact Form Submission]', { name, email, service, date, message });

		return { success: true };
	},
} satisfies Actions;
