import type { PricingModel } from './model';
export type EditableField = {path:(string|number)[]; label:string; value:string|number; kind:'text'|'number'};
/** Lists commercial inputs; rule identity and condition types are fixed. */
export function editableFields(model: PricingModel): EditableField[] {
 const fields: EditableField[]=[];
 const add=(path:(string|number)[],label:string,value:string|number,kind:'text'|'number')=>fields.push({path,label,value,kind});
 const money=(path:(string|number)[],label:string,range:{minCents:number;maxCents:number})=>{add([...path,'minCents'],`${label} minimum (cents)`,range.minCents,'number');add([...path,'maxCents'],`${label} maximum (cents)`,range.maxCents,'number');};
 add(['confidenceThresholds','highMaxPoints'],'High confidence maximum points',model.confidenceThresholds.highMaxPoints,'number');
 add(['confidenceThresholds','goodMaxPoints'],'Good confidence maximum points',model.confidenceThresholds.goodMaxPoints,'number');
 model.rules.forEach((rule,i)=>{
  const root:(string|number)[]=['rules',i]; add([...root,'label'],`${rule.code} label`,rule.label,'text');
  if(rule.type==='FIXED_RANGE') money([...root,'range'],rule.code,rule.range);
  if(rule.type==='PER_UNIT_RANGE'||rule.type==='PER_PERIOD_RANGE') {money([...root,'unitRange'],`${rule.code} per unit`,rule.unitRange); if(rule.unknownRange) money([...root,'unknownRange'],`${rule.code} unknown`,rule.unknownRange);}
  if(rule.type==='BAND_RANGE') rule.bands.forEach((band,j)=>money([...root,'bands',j,'range'],`${rule.code}: ${band.value}`,band.range));
  if(rule.type==='SERVICE_ADDON_RANGE') rule.addOns.forEach((option,j)=>{add([...root,'addOns',j,'label'],`${rule.code}: ${option.value} label`,option.label,'text');money([...root,'addOns',j,'range'],`${rule.code}: ${option.value}`,option.range);});
  if(rule.type==='COMPLEXITY_SCORE'||rule.type==='CONFIDENCE_WEIGHT') rule.pointsByValue.forEach((point,j)=>add([...root,'pointsByValue',j,'points'],`${rule.code}: ${point.value} points`,point.points,'number'));
  if(rule.type==='CONFIDENCE_WEIGHT') add([...root,'missingPoints'],`${rule.code} missing points`,rule.missingPoints,'number');
  if(rule.type==='REVIEW_TRIGGER' && rule.condition.type==='NUMERIC_AT_LEAST') add([...root,'condition','value'],`${rule.code} review threshold`,rule.condition.value,'number');
 });
 return fields;
}
