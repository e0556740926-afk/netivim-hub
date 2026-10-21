import {createHmac,timingSafeEqual} from 'node:crypto'

export type ReferralClaims={v:1;coordinatorId:number;contactId:number|null;exp:number}
const audience='netivim-partner-referral-v1:'
function secret(){const key=process.env.REFERRAL_LINK_SECRET||process.env.NEXTAUTH_SECRET;if(!key||key.length<32)throw new Error('REFERRAL_LINK_SECRET must contain at least 32 characters');return key}
function signature(payload:string){return createHmac('sha256',secret()).update(audience+payload).digest()}
export function signReferral(coordinatorId:number,contactId:number|null,now=Date.now()){
  if(!Number.isSafeInteger(coordinatorId)||coordinatorId<=0||(contactId!==null&&(!Number.isSafeInteger(contactId)||contactId<=0)))throw new Error('Invalid referral target')
  const claims:ReferralClaims={v:1,coordinatorId,contactId,exp:Math.floor(now/1000)+180*86400}
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url')
  return payload+'.'+signature(payload).toString('base64url')
}
export function verifyReferral(token:string,now=Date.now()):ReferralClaims|null{
  if(typeof token!=='string'||token.length>1024)return null
  const parts=token.split('.');if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))return null
  const expected=signature(parts[0]),supplied=Buffer.from(parts[1],'base64url')
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return null
  try{const c=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));if(c.v!==1||!Number.isSafeInteger(c.coordinatorId)||c.coordinatorId<=0||(c.contactId!==null&&(!Number.isSafeInteger(c.contactId)||c.contactId<=0))||!Number.isSafeInteger(c.exp)||c.exp<=Math.floor(now/1000))return null;return c}catch{return null}
}
