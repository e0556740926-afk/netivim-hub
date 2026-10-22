import {beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'
const mocks=vi.hoisted(()=>({sql:vi.fn(),scope:vi.fn(),column:vi.fn()}))
vi.mock('@/lib/db',()=>({default:mocks.sql}))
vi.mock('@/lib/event-access',()=>({canTouchEvent:mocks.scope}))
vi.mock('@/lib/schema',()=>({hasColumn:mocks.column}))
import {GET as publicGet,POST as publicPost} from '../app/api/event-registration/[slug]/route'
import {PUT as saveForm} from '../app/api/events/[id]/registration/route'
import {defaultRegistration} from './event-registration'
const cfg={...defaultRegistration('בדיקה'),id:4,name:'בדיקה',enabled:true,version:1,status:'approved'}
const publicCtx={params:Promise.resolve({slug:'test-event'})},privateCtx={params:Promise.resolve({id:'4'})}
const valid={key:'00000000-0000-4000-8000-000000000001',version:1,answers:{name:'בדיקה',phone:'0500000000'}}
const request=(body:unknown,path='/api/event-registration/test-event',method='POST')=>new NextRequest('https://example.test'+path,{method,body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})
beforeEach(()=>{vi.clearAllMocks();mocks.column.mockResolvedValue(true);mocks.scope.mockResolvedValue({ok:true,scope:{me:{id:1,role:'admin'}}})})
describe('Public registration boundary',()=>{
 it('returns only public event and form fields',async()=>{mocks.sql.mockResolvedValueOnce([{...cfg,coordinator_id:2,budget_planned:500,phone:'private'}]);const res=await publicGet(new NextRequest('https://example.test'),publicCtx),d=await res.json();expect(d.event.id).toBeUndefined();expect(d.event.budget_planned).toBeUndefined();expect(d.event.phone).toBeUndefined();expect(d.form.enabled).toBe(true)})
 it('rejects required fields before any insert',async()=>{mocks.sql.mockResolvedValueOnce([cfg]);const res=await publicPost(request({...valid,answers:{name:'בדיקה'}}),publicCtx);expect(res.status).toBe(400);expect(mocks.sql).toHaveBeenCalledTimes(1)})
 it('rejects a stale form version',async()=>{mocks.sql.mockResolvedValueOnce([{...cfg,version:2}]);const res=await publicPost(request(valid),publicCtx);expect(res.status).toBe(409);expect(mocks.sql).toHaveBeenCalledTimes(1)})
 it('rejects closed registration before insert',async()=>{mocks.sql.mockResolvedValueOnce([{...cfg,enabled:false}]);expect((await publicPost(request(valid),publicCtx)).status).toBe(409);expect(mocks.sql).toHaveBeenCalledTimes(1)})
 it('passes validated answers to the atomic registration and returns no attendee identity',async()=>{mocks.sql.mockResolvedValueOnce([cfg]).mockResolvedValueOnce([{attendee_id:123,is_waitlisted:true,already_registered:false}]);const res=await publicPost(request(valid),publicCtx);expect(await res.json()).toEqual({ok:true,waitlisted:true});expect(mocks.sql.mock.calls[1]).toContain('0500000000')})
 it('does not store honeypot spam',async()=>{expect((await publicPost(request({...valid,website:'spam'}),publicCtx)).status).toBe(200);expect(mocks.sql).not.toHaveBeenCalled()})
 it('fails safely before migration',async()=>{mocks.column.mockResolvedValue(false);expect((await publicGet(new NextRequest('https://example.test'),publicCtx)).status).toBe(503);expect(mocks.sql).not.toHaveBeenCalled()})
})
describe('Builder access and conflict handling',()=>{
 it('rejects an anonymous writer without touching event data',async()=>{mocks.scope.mockResolvedValue({ok:true,scope:{me:null}});expect((await saveForm(request(defaultRegistration('x'),'/api/events/4/registration','PUT'),privateCtx)).status).toBe(401);expect(mocks.sql).not.toHaveBeenCalled()})
 it('rejects read-only roles',async()=>{mocks.scope.mockResolvedValue({ok:true,scope:{me:{id:1,role:'viewer'}}});expect((await saveForm(request(defaultRegistration('x'),'/api/events/4/registration','PUT'),privateCtx)).status).toBe(403)})
 it('rejects another coordinator event',async()=>{mocks.scope.mockResolvedValue({ok:false,scope:{me:{id:1,role:'coordinator'}}});expect((await saveForm(request(defaultRegistration('x'),'/api/events/4/registration','PUT'),privateCtx)).status).toBe(403)})
 it('returns a conflict if someone else saved first',async()=>{mocks.sql.mockResolvedValueOnce([{id:4,name:'x',slug:'test',status:'approved'}]).mockResolvedValueOnce([]);const res=await saveForm(request(defaultRegistration('x'),'/api/events/4/registration','PUT'),privateCtx);expect(res.status).toBe(409)})
})
