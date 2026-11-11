import { z } from 'zod';
import { CanonicalEstimatorAnswersSchema } from '../../domain/estimator/answer-schema';
import { calculateConfidence } from '../../domain/estimator/confidence';
import { calculateReviewFlags } from '../../domain/estimator/review-flags';
import { evaluateDraftPricingRules } from '../../domain/pricing/engine';
import { validatePricingModel } from '../../domain/pricing/model';
import { MoneyRangeSchema } from '../../domain/pricing/rule-schema';

const codes=z.array(z.string().min(1).max(100)).max(256).refine(values=>new Set(values).size===values.length);
const manifestSchema=z.object({
 modelId:z.string().min(1).max(100), definitionFingerprint:z.string().regex(/^[0-9a-f]{64}$/), revision:z.string().min(1).max(80),
 scenarios:z.array(z.object({id:z.string().min(1).max(100),answers:CanonicalEstimatorAnswersSchema,expected:z.object({
  catchup:MoneyRangeSchema,ongoing:MoneyRangeSchema,ruleCodes:codes,confidence:z.enum(['high','good','preliminary']),
  manualReviewRequired:z.boolean(),reviewFlagCodes:codes
 }).strict()}).strict()).min(1).max(128)
}).strict().refine(value=>new Set(value.scenarios.map(s=>s.id)).size===value.scenarios.length)
 .refine(value=>['business','personal','both'].every(type=>value.scenarios.some(s=>s.answers.calculatorType===type)), 'Scenarios must cover business, personal and combined estimates.');

function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
export async function fingerprintDraft(input: unknown, enabled?: readonly boolean[]): Promise<string> {
 const model=validatePricingModel(input);
 if(model.state!=='DRAFT') throw new Error('Candidate must be a draft.');
 const flags=enabled ?? model.rules.map(()=>true);
 if(flags.length!==model.rules.length || !flags.every(value=>typeof value==='boolean')) throw new Error('Invalid rule selection.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({model,enabled:flags})));
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function runPricingCorpus(input: unknown, inputManifest: unknown, enabled?: readonly boolean[]) {
 const draft=validatePricingModel(input);
 const fingerprint=await fingerprintDraft(draft,enabled);
 const flags=enabled ?? draft.rules.map(()=>true);
 const model=validatePricingModel({...draft,rules:draft.rules.filter((_rule,index)=>flags[index])});
 const manifest=manifestSchema.parse(inputManifest);
 if(manifest.modelId!==model.id || manifest.definitionFingerprint!==fingerprint) throw new Error('Manifest does not match the draft.');
 const sorted=(values:readonly string[])=>[...values].sort();
 const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
 const results=manifest.scenarios.map(scenario=>{
  const evaluate=()=>{
   const pricing=evaluateDraftPricingRules(scenario.answers,model);
   const flags=calculateReviewFlags(scenario.answers,model);
   const confidence=calculateConfidence(scenario.answers,model,flags);
   return {catchup:{minCents:pricing.catchup.minCents,maxCents:pricing.catchup.maxCents},ongoing:{minCents:pricing.ongoing.minCents,maxCents:pricing.ongoing.maxCents},ruleCodes:sorted([...new Set([...pricing.catchup.lineItems,...pricing.ongoing.lineItems].map(line=>line.ruleCode))]),confidence:confidence.confidence,manualReviewRequired:flags.length>0,reviewFlagCodes:sorted(flags.map(flag=>flag.code))};
  };
  try {
   const actual=evaluate(); const failures:string[]=[];
   if(!same(actual,evaluate())) failures.push('determinism');
   for(const key of ['catchup','ongoing','confidence','manualReviewRequired'] as const) if(!same(actual[key],scenario.expected[key])) failures.push(key);
   if(!same(actual.ruleCodes,sorted(scenario.expected.ruleCodes))) failures.push('ruleCodes');
   if(!same(actual.reviewFlagCodes,sorted(scenario.expected.reviewFlagCodes))) failures.push('reviewFlagCodes');
   return {id:scenario.id,passed:failures.length===0,failures};
  } catch {return {id:scenario.id,passed:false,failures:['evaluation']};}
 });
 return {modelId:model.id,modelVersion:model.version,fingerprint,manifestRevision:manifest.revision,passed:results.every(result=>result.passed),scenarios:results};
}
