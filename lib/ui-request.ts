/** Verify the server result before closing a form or displaying success. */
export async function uiRequest<T = any>(url:string, init?:RequestInit):Promise<T> {
  const response = await fetch(url,init)
  const data = await response.json().catch(()=>null)
  if(!response.ok || data?.error)throw new Error(data?.error || "הפעולה לא הושלמה. אפשר לנסות שוב.")
  return data as T
}
export function uiMutation<T = any>(url:string,method:string,body?:unknown):Promise<T> {
  return uiRequest<T>(url,{method,headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
