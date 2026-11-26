import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { ESTIMATE_DISCLAIMER } from '../../src/lib/domain/estimator/estimate-disclaimer';
import { TEST_PRICING_MODEL } from '../../src/lib/domain/pricing/test-corpus';
import { cookiesForSession, createStaffFixture, dashboardOrigins, sql } from './dashboard-authenticated.support';

test('saves a real estimate, replays safely, and serves its result, PDF and staff record', async ({ page, context }) => {
	const { enabled, defaultOff } = dashboardOrigins();
	const admin = await createStaffFixture('admin');
	// Seed the complete synthetic model so all production V1 validation stays enabled.
	const modelId = '93000000-0000-4000-8000-000000000020';
	const rules = TEST_PRICING_MODEL.rules.map((rule) => rule.code === 'PERSONAL-BASE-CATCHUP'
		? { ...rule, range: { minCents: 125000, maxCents: 275000 } }
		: rule);
	const rulesJson = JSON.stringify(rules).replaceAll("'", "''");
	sql(`
		BEGIN;
		INSERT INTO estimator.pricing_models (
			id, version, name, engine_contract_version, confidence_high_max_points, confidence_good_max_points, created_by
		) VALUES ('${modelId}', '1.0.0-test', 'Disposable estimate fixture', '1.0.0', 0, 1, '${admin.userId}');
		INSERT INTO estimator.pricing_rules (
			pricing_model_id, code, label, scope, category, rule_type, input_key,
			explanation, conditions, parameters, sort_order
		)
		SELECT '${modelId}', lower(replace(rule->>'code', '-', '_')), rule->>'label',
			(rule->>'scope')::estimator.pricing_rule_scope, (rule->>'category')::estimator.pricing_rule_category,
			(rule->>'type')::estimator.pricing_rule_type, rule->>'inputKey', rule->>'explanation',
			jsonb_strip_nulls(jsonb_build_object('when', rule->'when', 'condition', rule->'condition')),
			rule - ARRAY['type','code','label','scope','category','inputKey','explanation','when','condition'],
			position::integer - 1
		FROM jsonb_array_elements('${rulesJson}'::jsonb) WITH ORDINALITY AS fixture(rule, position);
		SELECT estimator.activate_pricing_model(
			'${modelId}', '${admin.userId}', estimator.pricing_model_activation_projection('${modelId}')
		);
		COMMIT;
	`);
	await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1'
		? route.continue() : route.abort());
	await page.setViewportSize({ width: 375, height: 844 });
	await page.goto(`${enabled}/estimate`);
	for (const answer of ['Personal tax', 'Current', 'Salary/remuneration', 'Normal filing only', 'Annual personal tax return']) {
		await page.getByLabel(answer, { exact: true }).check();
		await page.getByRole('button', { name: 'Continue', exact: true }).click();
	}
	await page.getByLabel('No urgent deadline', { exact: true }).check();
	const savedResponse = page.waitForResponse((response) => response.url() === `${enabled}/api/estimates`);
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	const saved = await savedResponse;
	expect(saved.status()).toBe(201);
	await expect(page).toHaveURL(/\/estimate\/[a-f0-9]{32}$/);
	const publicRef = new URL(page.url()).pathname.split('/').at(-1)!;
	expect(publicRef).toMatch(/^[a-f0-9]{32}$/);
	await expect(page.getByRole('heading', { name: 'Your personal tax estimate' })).toBeVisible();
	await expect(page.getByLabel('Estimate disclaimer')).toHaveText(ESTIMATE_DISCLAIMER);
	await expect(page.getByText(/R\s*1\s*250.*R\s*2\s*750/).first()).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	const readSnapshot = () => JSON.parse(sql(`
		SELECT row_to_json(estimate) FROM (
			SELECT id, public_ref, pricing_model_id, pricing_model_version, engine_version,
				catchup_min_cents, catchup_max_cents, answers_snapshot, calculation_snapshot
			FROM estimator.estimates WHERE public_ref = '${publicRef}'
		) estimate;
	`));
	const snapshot = readSnapshot();
	expect(snapshot).toMatchObject({
		public_ref: publicRef,
		pricing_model_id: modelId,
		pricing_model_version: '1.0.0-test',
		engine_version: '1.0.0',
		catchup_min_cents: 125000,
		catchup_max_cents: 275000,
		answers_snapshot: { calculatorType: 'personal' },
		calculation_snapshot: { catchup: { minCents: 125000, maxCents: 275000 } }
	});

	const original = saved.request();
	const key = original.headers()['idempotency-key'];
	expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
	const replay = await context.request.post(original.url(), {
		data: original.postDataJSON(), headers: { 'idempotency-key': key }
	});
	expect(replay.status()).toBe(201);
	expect(await replay.json()).toEqual(await saved.json());
	expect(JSON.stringify(await saved.json())).not.toContain(snapshot.id);
	expect(JSON.stringify(await saved.json())).not.toContain(modelId);
	expect((await context.request.post(`${defaultOff}/api/estimates`, {
		data: original.postDataJSON(), headers: { 'idempotency-key': key }
	})).status()).toBe(503);
	expect(readSnapshot()).toEqual(snapshot);
	expect(sql('SELECT count(*) FROM estimator.estimates')).toBe('1');

	const pdf = await context.request.get(`${enabled}/api/estimates/${publicRef}/pdf`);
	expect(pdf.headers()).toMatchObject({ 'content-type': 'application/pdf', 'cache-control': 'private, no-store' });
	expect(pdf.headers()['content-disposition']).toContain('attachment');
	const document = await PDFDocument.load(await pdf.body());
	expect(document.getTitle()).toContain(publicRef);
	expect(document.getSubject()).toContain('R 1,250 - R 2,750');
	expect((await context.request.get(`${defaultOff}/api/estimates/${publicRef}/pdf`)).status()).toBe(503);

	const adminPath = `${enabled}/admin/estimates/${snapshot.id}`;
	const anonymous = await context.request.get(adminPath, { maxRedirects: 0 });
	expect(anonymous.headers().location).toBe('/admin/login');
	await context.addCookies(cookiesForSession(admin.aal1, enabled));
	const passwordOnly = await context.request.get(adminPath, { maxRedirects: 0 });
	expect(passwordOnly.headers().location).toBe('/admin/login/mfa');
	await context.clearCookies();
	await context.addCookies(cookiesForSession(admin.aal2, enabled));
	await page.goto(adminPath);
	await expect(page.getByRole('heading', { name: 'Estimate details' })).toBeVisible();
	await expect(page.getByText(publicRef, { exact: true })).toBeVisible();
	await page.getByText('Stored estimate snapshot', { exact: true }).click();
	await expect(page.getByText('1.0.0-test', { exact: true })).toBeVisible();
});
