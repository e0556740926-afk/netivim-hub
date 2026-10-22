"use client"
interface ErrorStateProps { message?: string; retry?: () => void }
export default function ErrorState({ message = "אירעה שגיאה בטעינת הנתונים", retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[#faeeed] flex items-center justify-center text-2xl mb-4">⚠️</div>
      <div className="text-[#193d33] font-semibold mb-1">{message}</div>
      <div className="text-sm text-[#63756b] mb-4">בדוק את החיבור לאינטרנט ונסה שוב</div>
      {retry && <button onClick={retry} className="px-4 py-2 bg-[#193d33] text-white rounded-[9px] text-sm font-semibold hover:bg-[#28634e] transition-colors">נסה שוב</button>}
    </div>
  )
}
