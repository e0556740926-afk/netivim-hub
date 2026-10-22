import {NextRequest} from 'next/server'
import {knowledgeRoute} from '@/lib/knowledge-server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
async function handle(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){return knowledgeRoute(req,(await ctx.params).path)}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE}
export async function HEAD(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
 const response=await knowledgeRoute(new NextRequest(req.url,{method:'GET',headers:req.headers}),(await ctx.params).path)
 await response.body?.cancel()
 return new Response(null,{status:response.status,headers:response.headers})
}
