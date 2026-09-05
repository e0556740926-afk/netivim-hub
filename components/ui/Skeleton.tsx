export function SkeletonLine({ w = "100%", h = "14px" }: { w?: string; h?: string }) {
  return <div style={{ width: w, height: h }} className="bg-[#E2E8F0] rounded-md animate-pulse"/>
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 space-y-3">
      <SkeletonLine w="60%" h="18px"/>
      {Array.from({length: rows}).map((_,i) => <SkeletonLine key={i} w={i===rows-1?"40%":"90%"}/>)}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden">
      <div className="grid gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]" style={{gridTemplateColumns:`repeat(auto-fit, minmax(90px, 1fr))`}}>
        {Array.from({length:cols}).map((_,i)=><SkeletonLine key={i} h="12px"/>)}
      </div>
      {Array.from({length:rows}).map((_,i)=>(
        <div key={i} className="grid gap-3 px-4 py-3 border-b border-[#F1F5F9] last:border-0" style={{gridTemplateColumns:`repeat(auto-fit, minmax(90px, 1fr))`}}>
          {Array.from({length:cols}).map((_,j)=><SkeletonLine key={j} w={j===0?"70%":"50%"}/>)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonKPI() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {Array.from({length:4}).map((_,i)=>(
        <div key={i} className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 space-y-2">
          <SkeletonLine w="60%" h="12px"/>
          <SkeletonLine w="40%" h="28px"/>
        </div>
      ))}
    </div>
  )
}

export default function PageLoader() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 fade-up">
      <SkeletonLine w="200px" h="28px"/>
      <SkeletonKPI/>
      <SkeletonTable/>
    </div>
  )
}
