import { expect, test } from 'bun:test';
import { TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { parseDraftForm } from './draft-form';

test('rejects unknown form fields and missing required values', () => {
 const model={...structuredClone(TEST_PRICING_MODEL),state:'DRAFT' as const};
 const form=new FormData(); form.set('rule.0.condition','forged');
 expect(()=>parseDraftForm(model,form)).toThrow();
});
