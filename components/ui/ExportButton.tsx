interface ExportButtonProps { type: string; label?: string; params?: Record<string,string|number> }
export default function ExportButton({ type, label, params }: ExportButtonProps) {
  function doExport() {
    const qs = new URLSearchParams({ type, ...(params||{} as any) }).toString()
    window.open(`/api/export?${qs}`, "_blank")
  }
  return (
    <button onClick={doExport}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e1e8df] bg-white text-[#63756b] rounded-[9px] text-sm hover:bg-[#edf4eb] hover:border-[#c8dac7] hover:text-[#28634e] transition-colors">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      {label || "ייצוא CSV"}
    </button>
  )
}
