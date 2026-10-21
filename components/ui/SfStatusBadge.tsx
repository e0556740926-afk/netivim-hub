/**
 * Salesforce process status for a lead (sf_* columns, filled by the
 * Salesforce status sync). Renders nothing until the lead is linked.
 */
const COLORS: Record<string, { bg: string; fg: string }> = {
  "חדש": { bg: "#DBEAFE", fg: "#1E40AF" },
  "בתהליך ייעוץ": { bg: "#FEF3C7", fg: "#92400E" },
  "לא פעיל / מושהה": { bg: "#F3F4F6", fg: "#4B5563" },
  "הופנה למסגרת": { bg: "#EDE9FE", fg: "#5B21B6" },
  "התקבל למסגרת": { bg: "#DCFCE7", fg: "#166534" },
  "נכנס למסגרת": { bg: "#BBF7D0", fg: "#14532D" },
}

export default function SfStatusBadge({ lead, detailed = false }: { lead: any; detailed?: boolean }) {
  if (!lead?.sf_status) return null
  const c = COLORS[lead.sf_status] || { bg: "#F1F5F9", fg: "#334155" }
  const extra = [lead.sf_sub_status, lead.sf_framework || lead.sf_referral_destination, lead.sf_inactive_reason]
    .filter(Boolean).join(" · ")
  const title = [`סילפרוס: ${lead.sf_status}`, extra, lead.sf_advisor && `יועץ: ${lead.sf_advisor}`].filter(Boolean).join("\n")
  if (!detailed) {
    return (
      <span title={title} style={{ background: c.bg, color: c.fg }}
        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap">
        ☁ {lead.sf_status}
      </span>
    )
  }
  return (
    <div className="text-sm space-y-0.5">
      <span style={{ background: c.bg, color: c.fg }} className="px-2 py-0.5 rounded-full text-xs font-semibold">{lead.sf_status}</span>
      {extra && <div className="text-xs text-[#475569]">{extra}</div>}
      {lead.sf_advisor && <div className="text-xs text-[#475569]">יועץ: {lead.sf_advisor}</div>}
      {lead.sf_updated_at && <div className="text-[10px] text-[#94A3B8]">עודכן בסילפרוס {new Date(lead.sf_updated_at).toLocaleDateString("he-IL")}</div>}
    </div>
  )
}
