import {describe,expect,it} from 'vitest'
import {defaultRegistration,duplicateRegistrationField,parseRegistrationForm,validateRegistrationAnswers,RegistrationField} from './event-registration'
const base=()=>defaultRegistration('ערב היכרות')
const answers={name:'נרשם לבדיקה',phone:'050-0000000',email:''}
describe('Duplicating a registration field',()=>{
 it('inserts an independent copy directly after a select field and retains its options and required state',()=>{
  const fields=[...base().fields,{id:'track',label:'מסלול',type:'select' as const,required:true,options:['לימודים','הכשרה']}]
  const result=duplicateRegistrationField(fields,3,'field_copy')
  expect(result[4]).toEqual({id:'field_copy',label:'מסלול (עותק)',type:'select',required:true,options:['לימודים','הכשרה']})
  result[4].options!.push('חדש');expect(fields[3].options).toEqual(['לימודים','הכשרה']);expect(fields).toHaveLength(4)
  expect(()=>parseRegistrationForm({...base(),fields:result})).not.toThrow()
 })
 it('can copy a base field without duplicating its identity key',()=>{const fields=duplicateRegistrationField(base().fields,0,'field_name');expect(fields[0].id).toBe('name');expect(fields[1].id).toBe('field_name');expect(fields[1].required).toBe(true)})
 it('rejects a copy when the form already has 20 fields',()=>{const fields=Array.from({length:20},(_,i)=>({id:'field_'+i,label:'שדה',type:'text' as const,required:false}));expect(()=>duplicateRegistrationField(fields,0,'field_copy')).toThrow('20')})
 it('rejects a reused field ID',()=>{expect(()=>duplicateRegistrationField(base().fields,0,'phone')).toThrow()})
 it('rejects an index that no longer exists',()=>{expect(()=>duplicateRegistrationField(base().fields,9,'field_copy')).toThrow()})
})
describe('Event registration schema',()=>{
 it('starts closed and requires name and phone',()=>{const f=parseRegistrationForm(base());expect(f.enabled).toBe(false);expect(f.fields.filter(x=>x.required).map(x=>x.id)).toEqual(['name','phone'])})
 it('keeps form defaults independent',()=>{const a=base();a.fields[0].label='changed';expect(base().fields[0].label).toBe('שם מלא')})
 it.each(['name','phone'])('does not allow removing the registration identity field %s',id=>{const f=base();f.fields=f.fields.filter(x=>x.id!==id);expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects duplicate field IDs',()=>{const f=base();f.fields.push({...f.fields[0]});expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects a prototype key',()=>{const f=base();f.fields.push({id:'__proto__',label:'x',type:'text',required:false});expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects an active SVG logo',()=>{const f=base();f.logo='data:image/svg+xml;base64,PHN2Zz4=';expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects an oversized logo',()=>{const f=base();f.logo='data:image/png;base64,'+'A'.repeat(280001);expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects too many fields',()=>{const f=base();for(let i=0;i<20;i++)f.fields.push({id:'field_'+i,label:'x',type:'text',required:false});expect(()=>parseRegistrationForm(f)).toThrow()})
 it('rejects missing and duplicate select options',()=>{for(const options of [[],['א','א']]){const f=base();f.fields.push({id:'track',label:'מסלול',type:'select',required:true,options});expect(()=>parseRegistrationForm(f)).toThrow()}})
 it('trims titles and options',()=>{const f=base();f.title=' כנס ';f.fields.push({id:'track',label:' מסלול ',type:'select',required:false,options:[' א ']});expect(parseRegistrationForm(f).fields[3].options).toEqual(['א'])})
})
describe('Event registration answers',()=>{
 it('normalizes phone formatting and preserves Hebrew',()=>{expect(validateRegistrationAnswers(base().fields,answers)).toEqual({...answers,phone:'0500000000'})})
 it.each(['name','phone'])('enforces required field %s on the server',id=>{expect(()=>validateRegistrationAnswers(base().fields,{...answers,[id]:''})).toThrow()})
 it('rejects fields removed from the current form',()=>{expect(()=>validateRegistrationAnswers(base().fields,{...answers,removed:'old'})).toThrow('הטופס השתנה')})
 it('rejects a non-object request',()=>{expect(()=>validateRegistrationAnswers(base().fields,[])).toThrow()})
 it('rejects an invalid email when optional but supplied',()=>{expect(()=>validateRegistrationAnswers(base().fields,{...answers,email:'invalid'})).toThrow()})
 it.each(['number','email','select','id'] as const)('validates the %s field type',type=>{const f:RegistrationField={id:'custom',label:'בדיקה',type,required:true,options:['אפשרות']};expect(()=>validateRegistrationAnswers([f],{custom:type==='id'?'123456781':'not-valid'})).toThrow()})
 it('validates ID check digits and preserves zero prefixes',()=>{const f:RegistrationField={id:'identity',label:'תז',type:'id',required:true};expect(validateRegistrationAnswers([f],{identity:'000123455'})).toEqual({identity:'000123455'})})
 it('requires an affirmative required checkbox',()=>{const f:RegistrationField={id:'agree',label:'אישור',type:'checkbox',required:true};expect(()=>validateRegistrationAnswers([f],{agree:false})).toThrow();expect(()=>validateRegistrationAnswers([f],{agree:'true'})).toThrow();expect(validateRegistrationAnswers([f],{agree:true})).toEqual({agree:true})})
 it('rejects overlong answers',()=>{expect(()=>validateRegistrationAnswers(base().fields,{...answers,name:'א'.repeat(501)})).toThrow()})
})
