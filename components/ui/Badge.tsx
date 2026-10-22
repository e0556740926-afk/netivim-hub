interface BadgeProps { text: string; color?: string; bg?: string }
const P: Record<string, {bg:string;color:string}> = {
  "שותף פעיל":{bg:"#eaf1e7",color:"#28634e"}, "נוצר קשר":{bg:"#eaf1e7",color:"#28634e"},
  "ליד קר":{bg:"#F3F4F6",color:"#193d33"}, "לא רלוונטי":{bg:"#faeeed",color:"#a74450"},
  "בוצע":{bg:"#eaf1e7",color:"#28634e"}, "בתהליך":{bg:"#eaf1e7",color:"#28634e"},
  "ממתין לתשובה":{bg:"#FEF9C3",color:"#854D0E"}, "לביצוע":{bg:"#F3F4F6",color:"#193d33"},
  "ממתין לאישור":{bg:"#faf1e3",color:"#946014"}, "בפרסום":{bg:"#eaf1e7",color:"#28634e"},
  "שולם":{bg:"#eaf1e7",color:"#28634e"}, "ממתין":{bg:"#faf1e3",color:"#946014"},
  "בוטל":{bg:"#faeeed",color:"#a74450"}, "מאושר":{bg:"#eaf1e7",color:"#28634e"},
}
export default function Badge({text,color,bg}:BadgeProps){
  const p=P[text];const c=color||p?.color||"#193d33";const b=bg||p?.bg||"#F3F4F6"
  return <span style={{background:b,color:c}} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">{text}</span>
}