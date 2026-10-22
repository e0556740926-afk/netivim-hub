/** Constants shared by the admin and coordinator event screens. */
export const STATUS_OPTIONS = [
  { v:"planning", l:"תכנון ראשוני" },
  { v:"pending_approval", l:"ממתין לאישור" },
  { v:"approved", l:"מאושר" },
  { v:"marketing", l:"בפרסום" },
  { v:"done", l:"בוצע" },
  { v:"cancelled", l:"בוטל" },
]
export const ST: Record<string,string> = Object.fromEntries(STATUS_OPTIONS.map(s=>[s.v,s.l]))

/** Statuses a coordinator may set on their own event (approval itself is a manager action). */
export const COORD_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => !["approved","marketing"].includes(s.v))

export const MONTHS_HE = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"]

export const EMPTY_FORM = { name:"", date:"", time:"", location:"", budget_planned:"", target_attendees:"", capacity:"", partner_contact_id:"", status:"planning", approved:false }
export type EventForm = typeof EMPTY_FORM
export const EMPTY_RESULTS = { actual_attendees:"", leads_collected:"", summary:"", follow_up:"" }
export type ResultsForm = typeof EMPTY_RESULTS
export const EMPTY_ATTENDEE = { name:"", phone:"", email:"" }
export const EMPTY_VENDOR = { name:"", category:"other", contact:"", amount:"", deposit_paid:false, notes:"" }
export const VENDOR_CATEGORIES: Record<string,string> = { venue:"אולם/מיקום", catering:"קייטרינג", marketing:"שיווק/פרסום", materials:"חומרים", other:"אחר" }

export const InputClass = "w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"

export function formFromEvent(e: any): EventForm {
  return {
    name: e.name||"", date: e.date?.slice(0,10)||"", time: e.time||"",
    location: e.location||"", budget_planned: e.budget_planned||"",
    target_attendees: e.target_attendees||"", capacity: e.capacity||"",
    partner_contact_id: e.partner_contact_id||"", status: e.status||"planning",
    approved: e.approved||false,
  }
}
export function duplicateForm(e: any): EventForm {
  return { ...formFromEvent(e), name: `${e.name} (עותק)`, date: "", status: "planning", approved: false }
}
export function resultsFromEvent(e: any): ResultsForm {
  return { actual_attendees: e.actual_attendees||"", leads_collected: e.leads_collected||"", summary: e.summary||"", follow_up: "" }
}
/** Serialises the form for POST/PATCH. */
export function formToBody(form: EventForm) {
  return { ...form, budget_planned:+form.budget_planned||0, target_attendees:+form.target_attendees||0,
    capacity: form.capacity?+form.capacity:null, partner_contact_id: form.partner_contact_id?+form.partner_contact_id:null }
}
