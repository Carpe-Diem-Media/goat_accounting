import type { PricingModel } from '../../domain/pricing/model';
import { editableFields } from '../../domain/pricing/editable-fields';

export class DraftFieldError extends Error {
 constructor(readonly field: number, message: string) { super(message); }
}
export function parseDraftForm(model: PricingModel, form: FormData) {
 const draft=structuredClone(model); const descriptors=editableFields(model); const allowed=new Set(['revision']);
 descriptors.forEach((field,index)=>{
  const name=`field.${index}`; allowed.add(name); const values=form.getAll(name);
  if(values.length!==1 || typeof values[0]!=='string') throw new DraftFieldError(index, 'Enter a value.');
  const raw=values[0]; let value:string|number=raw;
  if(field.kind==='number') {if(!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new DraftFieldError(index, 'Enter a nonnegative whole number.'); value=Number(raw);}
  let parent: any=draft; for(const part of field.path.slice(0,-1)) parent=parent[part]; parent[field.path[field.path.length-1]]=value;
 });
 const enabled=model.rules.map((_rule,index)=>{const name=`enabled.${index}`;allowed.add(name);const values=form.getAll(name);if(values.length>1 || (values.length===1 && values[0]!=='on')) throw new Error('Invalid rule state.');return values.length===1;});
 for(const name of form.keys()) if(!allowed.has(name)) throw new Error('Unknown draft field.');
 return {model:draft,enabled};
}
