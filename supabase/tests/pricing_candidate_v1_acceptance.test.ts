import { describe, expect, test } from 'bun:test';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../pricing-candidates/goat-accounting-starter-v1';
import {
 GOAT_STARTER_V1_MANIFEST_REVISION,
 GOAT_STARTER_V1_SCENARIOS
} from '../pricing-candidates/goat-accounting-starter-v1-acceptance';
import { fingerprintDraft, runPricingCorpus } from '../../src/lib/server/pricing/run-pricing-corpus';

describe('GOAT starter pricing acceptance expectations', () => {
 test('passes all 21 owner scenarios including combined and VAT frequency cases', async () => {
  expect(GOAT_STARTER_V1_SCENARIOS).toHaveLength(21);
  expect(GOAT_STARTER_V1_SCENARIOS.every((scenario) => scenario.expected !== undefined)).toBe(true);
  const report = await runPricingCorpus(GOAT_ACCOUNTING_STARTER_V1_DRAFT, {
   modelId: GOAT_ACCOUNTING_STARTER_V1_DRAFT.id,
   definitionFingerprint: await fingerprintDraft(GOAT_ACCOUNTING_STARTER_V1_DRAFT),
   revision: GOAT_STARTER_V1_MANIFEST_REVISION,
   scenarios: GOAT_STARTER_V1_SCENARIOS
  });
  expect(report.requiredScenarioCount).toBe(17);
  expect(report.scenarios.filter((scenario) => !scenario.passed)).toEqual([]);
  expect(report.passed).toBe(true);
 });
});
