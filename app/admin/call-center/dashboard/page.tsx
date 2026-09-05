export default function CallCenterDashboardPlaceholder() {
  return (
    <div dir="rtl" className="p-8 max-w-2xl mx-auto text-center">
      <div className="text-4xl mb-4">📊</div>
      <h1 className="text-xl font-bold mb-2">דשבורד מוקד</h1>
      <p className="text-gray-500">
        אותה חסימה כמו &quot;ניהול מוקד&quot; — אין עדיין נתוני שיחות במערכת. ברגע שיש אינטגרציית Aspire,
        זה יכול להתחבר ישירות ל-<code>/api/dashboards/summary</code> שכבר בנוי לקבל את זה (השדה <code>call_center_qc</code> כבר מוגדר שם כ-null).
      </p>
    </div>
  )
}
