export function fd(d?: string | null): string {
  if (!d) return '—'
  const p = d.split('-')
  if (p.length !== 3) return d
  return `${p[2]}.${p[1]}.${p[0]}`
}

export function ds(d?: string | null): number {
  if (!d) return 999
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export function tod(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ini(name: string): string {
  return name.split(' ').map(w => w[0]).join('')
}

export function pct(actual: number, target: number): number {
  if (!target) return 0
  return Math.round(actual / target * 100)
}

export function conicGradient(pct: number, color: string): string {
  const turn = `${Math.min(pct, 100)}%`
  return `conic-gradient(${color} ${turn}, #DBEAFE 0)`
}

export function leadColor(pct: number): string {
  if (pct >= 100) return '#166534'
  if (pct >= 60) return '#00488D'
  if (pct >= 30) return '#B45309'
  return '#960010'
}

export const MONTH_HE = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ']

export function currentMonth(): number { return new Date().getMonth() + 1 }
export function currentYear(): number { return new Date().getFullYear() }

export function contactStatusLabel(s: string): string {
  const m: Record<string, string> = {
    active: 'שותף פעיל', initial: 'נוצר קשר', meeting: 'פגישה', cold: 'ליד קר', irrelevant: 'לא רלוונטי'
  }
  return m[s] || s
}

export function taskStatusLabel(s: string): string {
  const m: Record<string, string> = {
    todo: 'לביצוע', inprogress: 'בתהליך', waiting: 'ממתין לתשובה', done: 'בוצע'
  }
  return m[s] || s
}

export function eventStatusLabel(s: string): string {
  const m: Record<string, string> = {
    planning: 'תכנון ראשוני', pending_approval: 'ממתין לאישור',
    approved: 'מאושר', marketing: 'בפרסום', done: 'בוצע', cancelled: 'בוטל'
  }
  return m[s] || s
}

export const COLORS = {
  navy: '#0D2744',
  blue: '#00488D',
  lightBlue: '#DBEAFE',
  green: '#166534',
  lightGreen: '#DCFCE7',
  amber: '#B45309',
  lightAmber: '#FEF3C7',
  red: '#960010',
  lightRed: '#FEE2E2',
  gray: '#64748B',
  lightGray: '#E2E8F0',
  bg: '#F0F4F8',
  purple: '#5B21B6',
  lightPurple: '#EDE9FE',
}
