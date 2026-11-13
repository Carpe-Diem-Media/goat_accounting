import { z } from 'zod';
import { CanonicalEstimatorAnswersSchema } from '../../domain/estimator/answer-schema';
import { calculateConfidence } from '../../domain/estimator/confidence';
import { calculateReviewFlags } from '../../domain/estimator/review-flags';
import { evaluateDraftPricingRules } from '../../domain/pricing/engine';
import { validatePricingModel } from '../../domain/pricing/model';
import { MoneyRangeSchema } from '../../domain/pricing/rule-schema';
import type { CanonicalEstimatorAnswers } from '../../domain/estimator/answer-schema';

const codes=z.array(z.string().min(1).max(100)).max(256).refine(values=>new Set(values).size===values.length);
type CoverageCase={id:string;matches:(answers:CanonicalEstimatorAnswers)=>boolean};
const business=(id:string,matches:(answers:Extract<CanonicalEstimatorAnswers,{calculatorType:'business'}>['business'])=>boolean):CoverageCase=>({
 id,matches:answers=>answers.calculatorType==='business'&&matches(answers.business)
});
const personal=(id:string,matches:(answers:Extract<CanonicalEstimatorAnswers,{calculatorType:'personal'}>['personal'])=>boolean):CoverageCase=>({
 id,matches:answers=>answers.calculatorType==='personal'&&matches(answers.personal)
});
/** The full required corpus from the Tech Spec and current canonical scenario contracts; no golden values are included. */
export const REQUIRED_PRICING_SCENARIO_CASES:readonly CoverageCase[]=[
 business('simple-current-sole-proprietor',a=>a.entityType==='sole_proprietor'&&a.booksStatus==='current_and_reconciled'),
 business('current-pty-ltd-with-vat',a=>a.entityType==='pty_ltd'&&a.booksStatus==='current_and_reconciled'&&a.ongoingServices.includes('vat')),
 business('current-sme-ten-employees',a=>a.booksStatus==='current_and_reconciled'&&a.employeeCount==='6_to_15'),
 business('six-months-behind-clean-records',a=>a.booksStatus==='3_to_6_months'&&a.recordCondition==='clean_software'),
 business('unknown-business-backlog-duration',a=>a.booksStatus==='not_sure'),
 business('eighteen-months-incomplete-records',a=>a.booksStatus==='1_to_2_years'&&a.outstandingMonths===18&&a.recordCondition==='incomplete_or_messy'&&a.bankStatementsAvailableForFullPeriod==='no'),
 business('eighteen-months-incomplete-records-statements-available',a=>a.booksStatus==='1_to_2_years'&&a.outstandingMonths===18&&a.recordCondition==='incomplete_or_messy'&&a.bankStatementsAvailableForFullPeriod==='yes'),
 business('ecommerce-multiple-gateways',a=>a.complexityFactors.includes('ecommerce_payment_gateways')),
 business('multiple-entities',a=>a.entityType==='multiple_entities'&&a.entityCount!==undefined),
 business('multiple-entities-unknown-count',a=>a.entityType==='multiple_entities'&&a.entityCount===undefined),
 personal('personal-salaried-taxpayer',a=>a.incomeSources.includes('salary')),
 personal('rental-and-provisional-tax',a=>a.incomeSources.includes('rental_property')&&a.incomeSources.includes('provisional_tax')),
 personal('high-risk-sars-dispute',a=>a.currentStatus==='sars_issue'&&a.sarsPosition==='objection_appeal'),
 business('unknown-transaction-volume',a=>a.monthlyTransactionVolume==='not_sure'&&a.booksStatus==='current_and_reconciled'),
 business('unknown-volume-with-major-backlog',a=>a.monthlyTransactionVolume==='not_sure'&&['6_to_12_months','1_to_2_years','over_2_years'].includes(a.booksStatus)),
 business('moderate-uncertainty-good-confidence',a=>a.monthlyTransactionVolume==='under_50'&&a.financialAccounts==='not_sure'),
 business('high-volume-boundary',a=>a.monthlyTransactionVolume==='over_750'&&a.financialAccounts==='7_plus')
];
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
 const missingCases=REQUIRED_PRICING_SCENARIO_CASES.filter(required=>!manifest.scenarios.some(scenario=>scenario.id===required.id&&required.matches(scenario.answers))).map(required=>required.id);
 if(missingCases.length) throw new Error(`Manifest lacks required scenario coverage: ${missingCases.join(', ')}`);
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
 return {modelId:model.id,modelVersion:model.version,fingerprint,manifestRevision:manifest.revision,requiredScenarioCount:REQUIRED_PRICING_SCENARIO_CASES.length,passed:results.every(result=>result.passed),scenarios:results};
}
