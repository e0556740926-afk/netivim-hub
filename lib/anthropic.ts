// Minimal Anthropic Messages API client (fetch, no SDK). No-throw: every
// caller has a non-AI fallback, so a missing key or an outage returns null.
export type ClaudeBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } } | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
export type ClaudeMessage = { role: 'user' | 'assistant'; content: string | ClaudeBlock[] }

export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY
/** Model is configurable without a deploy (Netlify env ANTHROPIC_MODEL). */
export const claudeModel = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'

export async function callClaude(p: { system: string | ClaudeBlock[]; messages: ClaudeMessage[]; maxTokens?: number; timeoutMs?: number; model?: string }): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), p.timeoutMs ?? 20000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: p.model || claudeModel(), max_tokens: p.maxTokens ?? 700, system: p.system, messages: p.messages }),
    })
    const body: any = await res.json().catch(() => null)
    if (!res.ok) { console.error('[anthropic]', res.status, body?.error?.type || ''); return null }
    const text = (body?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('').trim()
    return text || null
  } catch (e) {
    console.error('[anthropic] request failed', e instanceof Error ? e.name : 'error')
    return null
  } finally { clearTimeout(timer) }
}
