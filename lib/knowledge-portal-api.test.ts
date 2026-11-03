import {beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'
const m=vi.hoisted(()=>({sql:Object.assign(vi.fn(),{transaction:vi.fn()}),auth:vi.fn(),get:vi.fn()}))
vi.mock('@/lib/db',()=>({default:m.sql}))
vi.mock('@/lib/auth-server',()=>({currentUser:m.auth}))
vi.mock('@netlify/blobs',()=>({getStore:()=>({get:m.get})}))
import {knowledgeRoute} from './knowledge-server'
const id='00000000-0000-4000-8000-000000000001'
const req=(path:string,method='GET',body?:unknown)=>new NextRequest('https://example.test/api/knowledge/'+path,{method,...(body?{body:JSON.stringify(body)}:{})})
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({id:8,role:'coordinator'});m.sql.mockResolvedValue([])})
describe('Department boundaries',()=>{
 it('enforces department membership inside list SQL together with audience',async()=>{await knowledgeRoute(req('items?department=community&page=1'),['items']);const [strings,...params]=m.sql.mock.calls[0],sql=strings.join('');expect(sql).toContain('knowledge_department_members');expect(sql).toContain('ANY(k.audience_ids)');expect(sql).toContain('OFFSET');expect(params).toContain(24);expect(params).toContain(8);expect(params).toContain('community')})
 it('enforces department on direct item links',async()=>{expect((await knowledgeRoute(req('items/'+id),['items',id])).status).toBe(404);expect(m.sql.mock.calls[0][0].join('')).toContain('knowledge_department_members')})
 it('enforces department and gallery membership on file reads',async()=>{m.sql.mockResolvedValueOnce([{id,ready:true,creator_id:1,size:4,mime:'image/jpeg'}]).mockResolvedValueOnce([]);expect((await knowledgeRoute(req('assets/'+id),['assets',id])).status).toBe(404);expect(m.sql.mock.calls[1][0].join('')).toContain("portal->'media'");expect(m.sql.mock.calls[1][0].join('')).toContain('knowledge_department_members');expect(m.get).not.toHaveBeenCalled()})
 it('does not expose the membership directory to readers',async()=>{expect((await knowledgeRoute(req('members'),['members'])).status).toBe(403);expect(m.sql).not.toHaveBeenCalled()})
 it('does not allow readers to grant themselves access',async()=>{expect((await knowledgeRoute(req('members','PUT',{user_id:8,departments:['guidance']}),['members'])).status).toBe(403);expect(m.sql.transaction).not.toHaveBeenCalled()})
 it('rejects invented departments in admin assignments',async()=>{m.auth.mockResolvedValue({id:1,role:'admin'});expect((await knowledgeRoute(req('members','PUT',{user_id:8,departments:['superuser']}),['members'])).status).toBe(400);expect(m.sql).not.toHaveBeenCalled()})
 it('does not return campaign recipients in editor options',async()=>{m.auth.mockResolvedValue({id:1,role:'admin'});await knowledgeRoute(req('options'),['options']);const all=m.sql.mock.calls.map(c=>c[0].join('')).join('\n');expect(all).toContain('SELECT id,name,status FROM msg_campaigns');expect(all).not.toContain('msg_campaign_recipients')})
 it('requires uploaded media to be finalized before publishing',async()=>{m.auth.mockResolvedValue({id:1,role:'admin'});m.sql.mockResolvedValueOnce([{id,creator_id:1,ready:false,mime:'image/jpeg'}]).mockResolvedValueOnce([]);const res=await knowledgeRoute(req('items','POST',{title:'בדיקה',kind:'script',status:'draft',portal:{area:'campaigns',department:'community',media:[{asset_id:id,kind:'image',name:'x',caption:''}]}}),['items']);expect(res.status).toBe(400)})
 it('returns an install instruction when the portal migration is missing',async()=>{m.sql.mockRejectedValue(new Error('column k.portal does not exist'));expect((await knowledgeRoute(req('items'),['items'])).status).toBe(503)})
})
