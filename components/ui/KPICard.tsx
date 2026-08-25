interface KPICardProps{label:string;value:string|number;sub?:string;color?:string}
export default function KPICard({label,value,sub,color="#0D2744"}:KPICardProps){
  return <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4"><div className="text-xs text-[#64748B] font-medium">{label}</div><div style={{color}} className="text-3xl font-extrabold mt-1.5 mb-0.5 leading-none">{value}</div>{sub&&<div className="text-xs text-[#64748B]">{sub}</div>}</div>
}