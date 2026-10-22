import {beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'
const m=vi.hoisted(()=>({sql:vi.fn(),auth:vi.fn(),set:vi.fn(),get:vi.fn()}))
vi.mock('@/lib/db',()=>({default:m.sql}))
vi.mock('@/lib/auth-server',()=>({currentUser:m.auth}))
vi.mock('@netlify/blobs',()=>({getStore:()=>({set:m.set,get:m.get})}))
import {knowledgeRoute} from './knowledge-server'
const id='00000000-0000-4000-8000-000000000001'
const input={title:'בדיקה',kind:'script',sections:[{title:'x',body:'y'}],version:1,status:'published'}
function req(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return new NextRequest(`https://example.test/api/knowledge/${path}`,{method,headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})}
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({id:1,role:'admin'});m.sql.mockResolvedValue([])})
describe('Knowledge authorization and writes',()=>{
 it('blocks unauthenticated reads',async()=>{m.auth.mockResolvedValue(null);expect((await knowledgeRoute(req('items'),['items'])).status).toBe(401);expect(m.sql).not.toHaveBeenCalled()})
 it('blocks writes from coordinators before SQL',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});expect((await knowledgeRoute(req('items','POST',input),['items'])).status).toBe(403);expect(m.sql).not.toHaveBeenCalled()})
 it('rejects requests from a different origin',async()=>{expect((await knowledgeRoute(req('items','POST',input,{origin:'https://evil.test'}),['items'])).status).toBe(403);expect(m.sql).not.toHaveBeenCalled()})
 it('never returns out-of-audience content or draft assets',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});expect((await knowledgeRoute(req(`items/${id}`),['items',id])).status).toBe(404);const [strings,...values]=m.sql.mock.calls[0];expect(strings.join('')).toContain("k.status='published'");expect(strings.join('')).toContain('ANY(k.audience_ids)');expect(values).toContain(false);expect(values).toContain(2)})
 it('rejects stale editor version',async()=>{m.sql.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([]);expect((await knowledgeRoute(req(`items/${id}`,'PUT',input),['items',id])).status).toBe(409)})
 it('rejects recipient ids not belonging to coordinators',async()=>{expect((await knowledgeRoute(req('items','POST',{...input,audience:'selected',audience_ids:[9]}),['items'])).status).toBe(400);expect(m.sql).toHaveBeenCalledTimes(1)})
 it('does not save favorites for inaccessible content',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});expect((await knowledgeRoute(req(`items/${id}/favorite`,'PUT',{}),['items',id,'favorite'])).status).toBe(404);expect(m.sql).toHaveBeenCalledTimes(1)})
 it('favorites are scoped to the authenticated user',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});m.sql.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([]);expect((await knowledgeRoute(req(`items/${id}/favorite`,'PUT',{user_id:99}),['items',id,'favorite'])).status).toBe(200);expect(m.sql.mock.calls[1]).toContain(2);expect(m.sql.mock.calls[1]).not.toContain(99)})
})
describe('Private uploads and downloads',()=>{
 const a={id,creator_id:1,ready:false,size:4,parts:1,store_name:'test',mime:'application/pdf',name:'test.pdf'}
 it('blocks non-manager uploads',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});expect((await knowledgeRoute(req('assets','POST',{name:'x.pdf',size:4}),['assets'])).status).toBe(403);expect(m.set).not.toHaveBeenCalled()})
 it('rejects a part with the wrong byte length',async()=>{m.sql.mockResolvedValueOnce([a]);expect((await knowledgeRoute(req(`assets/${id}/parts/0`,'PUT','abc'),['assets',id,'parts','0'])).status).toBe(400);expect(m.set).not.toHaveBeenCalled()})
 it('rejects upload by another admin',async()=>{m.sql.mockResolvedValueOnce([{...a,creator_id:99}]);expect((await knowledgeRoute(req(`assets/${id}/parts/0`,'PUT','abcd'),['assets',id,'parts','0'])).status).toBe(403)})
 it('blocks overwriting finalized assets',async()=>{m.sql.mockResolvedValueOnce([{...a,ready:true}]);expect((await knowledgeRoute(req(`assets/${id}/parts/0`,'PUT','abcd'),['assets',id,'parts','0'])).status).toBe(403)})
 it('does not finalize missing parts',async()=>{m.sql.mockResolvedValueOnce([a]).mockResolvedValueOnce([{count:0,size:0}]);expect((await knowledgeRoute(req(`assets/${id}/complete`,'POST',{}),['assets',id,'complete'])).status).toBe(400);expect(m.sql).toHaveBeenCalledTimes(2)})
 it('does not expose a ready file without item access',async()=>{m.auth.mockResolvedValue({id:2,role:'coordinator'});m.sql.mockResolvedValueOnce([{...a,ready:true}]).mockResolvedValueOnce([]);expect((await knowledgeRoute(req(`assets/${id}`),['assets',id])).status).toBe(404);expect(m.get).not.toHaveBeenCalled()})
 it('serves the exact requested byte range with no public cache',async()=>{m.sql.mockResolvedValueOnce([{...a,ready:true}]).mockResolvedValueOnce([{id}]);m.get.mockResolvedValue(new TextEncoder().encode('abcd').buffer);const res=await knowledgeRoute(req(`assets/${id}`,'GET',undefined,{range:'bytes=1-2'}),['assets',id]);expect(res.status).toBe(206);expect(res.headers.get('content-range')).toBe('bytes 1-2/4');expect(res.headers.get('cache-control')).toContain('no-store');expect(await res.text()).toBe('bc')})
 it('returns 416 for an out-of-bounds request',async()=>{m.sql.mockResolvedValueOnce([{...a,ready:true}]).mockResolvedValueOnce([{id}]);expect((await knowledgeRoute(req(`assets/${id}`,'GET',undefined,{range:'bytes=9-'}),['assets',id])).status).toBe(416)})
 it('bounds even an open-ended video range below the platform payload cap',async()=>{m.sql.mockResolvedValueOnce([{...a,ready:true,size:100*1024*1024,parts:50,mime:'video/mp4'}]).mockResolvedValueOnce([{id}]);m.get.mockResolvedValue(new ArrayBuffer(2097152));const res=await knowledgeRoute(req(`assets/${id}`,'GET',undefined,{range:'bytes=0-'}),['assets',id]);expect(res.status).toBe(206);expect(res.headers.get('content-length')).toBe('2097152');expect(res.headers.get('content-range')).toBe('bytes 0-2097151/104857600');await res.body?.cancel()})
})
