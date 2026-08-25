interface BadgeProps { text: string; color?: string; bg?: string }
const P: Record<string, {bg:string;color:string}> = {
  "שותף פעיל":{bg:"#DCFCE7",color:"#166534"}, "נוצר קשר":{bg:"#DBEAFE",color:"#1E40AF"},
  "ליד קר":{bg:"#F3F4F6",color:"#374151"}, "לא רלוונטי":{bg:"#FEE2E2",color:"#991B1B"},
  "בוצע":{bg:"#DCFCE7",color:"#166534"}, "בתהליך":{bg:"#DBEAFE",color:"#1E40AF"},
  "ממתין לתשובה":{bg:"#FEF9C3",color:"#854D0E"}, "לביצוע":{bg:"#F3F4F6",color:"#374151"},
  "ממתין לאישור":{bg:"#FEF3C7",color:"#B45309"}, "בפרסום":{bg:"#DBEAFE",color:"#1E40AF"},
  "שולם":{bg:"#DCFCE7",color:"#166534"}, "ממתין":{bg:"#FEF3C7",color:"#B45309"},
  "בוטל":{bg:"#FEE2E2",color:"#991B1B"}, "מאושר":{bg:"#DCFCE7",color:"#166534"},
}
export default function Badge({text,color,bg}:BadgeProps){
  const p=P[text];const c=color||p?.color||"#374151";const b=bg||p?.bg||"#F3F4F6"
  return <span style={{background:b,color:c}} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">{text}</span>
}