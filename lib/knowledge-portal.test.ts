import {describe,expect,it} from 'vitest'
import {assetSpec,CHUNK_SIZE,parseKnowledge,portalOf} from './knowledge'
const script={title:'בדיקה',kind:'script',sections:[{title:'פתיחה',body:'שלום'}],status:'published'}
const uuid='00000000-0000-4000-8000-000000000001'
const p=()=>portalOf({kind:'script'})
describe('Organizational portal content',()=>{
 it('keeps old scripts and their audience without assigning a new department',()=>{const item=parseKnowledge(script);expect(item.portal.department).toBe('unassigned');expect(item.portal.area).toBe('scripts');expect(item.audience).toBe('all')})
 it('classifies legacy documents as learning',()=>expect(portalOf({kind:'document'}).area).toBe('learning'))
 it('requires area and kind to agree',()=>expect(()=>parseKnowledge({...script,portal:{...p(),area:'learning'}})).toThrow('סוג התוכן'))
 it('rejects a forged department',()=>expect(()=>parseKnowledge({...script,portal:{...p(),department:'admin'}})).toThrow('שיוך'))
 it('rejects inherited area names',()=>expect(()=>parseKnowledge({...script,portal:{...p(),area:'constructor'}})).toThrow('שיוך'))
 it('publishes a campaign goal without forcing a document attachment',()=>{const item=parseKnowledge({...script,sections:[],portal:{...p(),area:'campaigns',department:'community',goal:'חיבור לקהילה'}});expect(item.portal.goal).toBe('חיבור לקהילה')})
 it('requires meaningful content for a campaign',()=>expect(()=>parseKnowledge({...script,sections:[],portal:{...p(),area:'campaigns'}})).toThrow('מטרה'))
 it('accepts a past event album with an image',()=>{const item=parseKnowledge({...script,kind:'document',portal:{...p(),area:'events',event_date:'2025-01-01',media:[{asset_id:uuid,kind:'image',name:'תמונה.jpg',caption:'במפגש'}]}});expect(item.portal.media).toHaveLength(1);expect(item.asset_id).toBeNull()})
 it('does not publish an event without media',()=>expect(()=>parseKnowledge({...script,kind:'document',portal:{...p(),area:'events',event_date:'2025-01-01'}})).toThrow('תמונות'))
 it('does not publish future-event albums',()=>expect(()=>parseKnowledge({...script,kind:'document',portal:{...p(),area:'events',event_date:'2099-01-01',media:[{asset_id:uuid,kind:'video',name:'x',caption:''}]}})).toThrow('התקיימו'))
 it.each(['2026-02-30','2026-99-99','tomorrow'])('rejects malformed calendar date %s',event_date=>expect(()=>parseKnowledge({...script,status:'draft',portal:{...p(),event_date}})).toThrow('תאריך'))
 it('rejects invalid campaign date order',()=>expect(()=>parseKnowledge({...script,portal:{...p(),start_date:'2026-11-03',end_date:'2026-11-01'}})).toThrow('הסיום'))
 it('rejects duplicate media references',()=>{const media={asset_id:uuid,kind:'image',name:'x',caption:''};expect(()=>parseKnowledge({...script,portal:{...p(),media:[media,media]}})).toThrow('יותר מפעם')})
 it('rejects untrusted remote image references',()=>expect(()=>parseKnowledge({...script,portal:{...p(),media:[{asset_id:'https://evil.test/a.jpg',kind:'image'}]}})).toThrow('קובץ'))
 it('bounds galleries to forty attachments',()=>expect(()=>parseKnowledge({...script,portal:{...p(),media:Array(41).fill({asset_id:uuid,kind:'image'})}})).toThrow('40'))
 it('bounds images to a complete protected response',()=>{expect(assetSpec('a.jpg',CHUNK_SIZE).mime).toBe('image/jpeg');expect(()=>assetSpec('a.png',CHUNK_SIZE+1)).toThrow('2MB')})
 it('keeps SVG and active HTML disabled',()=>{expect(()=>assetSpec('a.svg',10)).toThrow();expect(()=>assetSpec('a.html',10)).toThrow()})
})
