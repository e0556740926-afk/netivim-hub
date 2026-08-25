export type UserRole = 'admin' | 'coordinator' | 'viewer'

export interface User {
  id: number
  name: string
  email: string
  password: string
  role: UserRole
  status: 'active' | 'inactive'
  phone?: string
  area?: string
  slug?: string // for public lead form
}

export interface Coordinator {
  id: number
  user_id: number
  name: string
  role: string
  area: string
  email: string
  phone: string
  slug: string
}

export interface Lead {
  id: number
  coordinator_id: number
  name: string
  phone: string
  age?: number
  city?: string
  interest?: string
  source: 'link' | 'event' | 'manual'
  status: 'new' | 'contacted' | 'advanced' | 'irrelevant'
  created_at: string
}

export interface Contact {
  id: number
  coordinator_id?: number
  name: string
  org: string
  role: string
  phone: string
  email: string
  type: 'partner' | 'authority' | 'vendor' | 'lead'
  status: 'active' | 'initial' | 'meeting' | 'cold' | 'irrelevant'
  potential: 1 | 2 | 3
  last_contact?: string
  notes?: string
  owner: string
}

export interface Interaction {
  id: number
  contact_id: number
  coordinator_id: number
  date: string
  type: 'call' | 'meeting' | 'whatsapp' | 'email' | 'other'
  summary: string
  next_step?: string
}

export interface Event {
  id: number
  name: string
  date: string
  time: string
  location: string
  status: 'planning' | 'pending_approval' | 'approved' | 'marketing' | 'done' | 'cancelled'
  budget_planned: number
  budget_actual?: number
  partner_contact_id?: number
  target_attendees: number
  actual_attendees?: number
  leads_collected?: number
  summary?: string
  approved: boolean
  coordinator_id: number
  created_at: string
}

export interface Task {
  id: number
  title: string
  details?: string
  type: 'call' | 'meeting' | 'materials' | 'backoffice'
  assignees: string[]
  due_date?: string
  status: 'todo' | 'inprogress' | 'waiting' | 'done'
  contact_id?: number
  event_id?: number
  meeting_id?: number
  coordinator_id?: number
  created_at: string
}

export interface WeeklyReport {
  id: number
  coordinator_id: number
  week_start: string
  achievements: string
  challenges: string
  leads_count: number
  next_week_plan: string
  submitted_at: string
}

export interface Meeting {
  id: number
  coordinator_id: number
  manager_id: number
  date: string
  type: 'regular' | 'urgent' | 'goal'
  agenda?: string
  summary?: string
  next_meeting_date?: string
  created_at: string
}

export interface Expense {
  id: number
  event_id?: number
  description: string
  vendor: string
  amount: number
  date: string
  status: 'paid' | 'pending' | 'cancelled'
  category: 'equipment' | 'marketing' | 'catering' | 'venue' | 'other'
}

export interface MonthlyTarget {
  id: number
  coordinator_id: number
  month: number
  year: number
  target_leads: number
  actual_leads?: number
}
