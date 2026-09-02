import Image from "next/image"

export default function UnsubscribedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>
      <div className="text-center px-6 max-w-sm" dir="rtl">
        <div className="mb-6 flex justify-center"><Image src="/netivim-logo.png" alt="נתיבים" width={120} height={40} className="brightness-0 invert opacity-80" priority/></div>
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-4xl mx-auto mb-6">👋</div>
        <div className="text-2xl font-extrabold text-white mb-3">הוסרת בהצלחה</div>
        <div className="text-white/70 text-sm leading-relaxed">לא תקבל/י יותר עדכונים מהניוזלטר של נתיבים. מתחרטים? אפשר להירשם שוב בכל עת.</div>
      </div>
    </div>
  )
}
