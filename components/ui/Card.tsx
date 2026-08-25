interface CardProps{children:React.ReactNode;className?:string;style?:React.CSSProperties;onClick?:()=>void}
export default function Card({children,className="",style,onClick}:CardProps){
  return <div onClick={onClick} style={style} className={`bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden ${onClick?"cursor-pointer hover:border-[#00488D] transition-colors":""} ${className}`}>{children}</div>
}