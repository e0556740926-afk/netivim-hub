/**
 * Required fields for a contact (איש קשר): name, phone and role — nothing
 * else. Shared by the admin and coordinator forms and the API so all three
 * agree. Returns a Hebrew error, or "" when the contact is valid.
 */
export function contactRequiredError(d: { name?: unknown; phone?: unknown; role?: unknown }): string {
  if (!String(d.name ?? "").trim()) return "יש להזין שם איש קשר"
  const phone = String(d.phone ?? "").trim()
  if (!phone) return "יש להזין טלפון"
  if (phone.replace(/\D/g, "").length < 9) return "מספר הטלפון לא תקין"
  if (!String(d.role ?? "").trim()) return "יש להזין תפקיד"
  return ""
}
