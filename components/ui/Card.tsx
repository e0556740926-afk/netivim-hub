interface CardProps{children:React.ReactNode;className?:string;style?:React.CSSProperties;onClick?:()=>void}
export default function Card({children,className="",style,onClick}:CardProps){
  return <div onClick={onClick} style={style} className={`bg-white border border-[#e1e8df] rounded-[14px] overflow-hidden ${onClick?"cursor-pointer hover:border-[#28634e] transition-colors":""} ${className}`}>{children}</div>
}