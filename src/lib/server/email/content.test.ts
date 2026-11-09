import { describe, expect, test } from 'bun:test';
import { loadEmailContent } from './content';

const complete = {
	disclaimer: 'TEST-ONLY disclaimer', contactName: 'TEST-ONLY name', contactEmail: 'test@example.test',
	title: 'TEST-ONLY title', publicOrigin: 'https://example.test', approvalReference: 'TEST-ONLY approval'
};

describe('loadEmailContent', () => {
	test('requires explicit approval and bounded valid content', () => {
		expect(loadEmailContent(JSON.stringify({ ...complete, approvalReference: undefined }))).toBeNull();
		expect(loadEmailContent(JSON.stringify(complete))).toEqual(complete);
		expect(loadEmailContent('{broken json')).toBeNull();
	});

	test('normalizes an approved origin before building links', () => {
		expect(loadEmailContent({ ...complete, publicOrigin: 'https://example.test/' })?.publicOrigin).toBe('https://example.test');
	});

	test('rejects non-HTTPS origins, credentials, paths and oversized fields', () => {
		for (const publicOrigin of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path']) {
			expect(loadEmailContent({ ...complete, publicOrigin })).toBeNull();
		}
		expect(loadEmailContent({ ...complete, disclaimer: 'x'.repeat(501) })).toBeNull();
		expect(loadEmailContent({ ...complete, contactEmail: 'bad' })).toBeNull();
	});
});
