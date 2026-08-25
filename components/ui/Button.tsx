interface ButtonProps{children:React.ReactNode;onClick?:()=>void;variant?:"primary"|"secondary"|"danger"|"success";size?:"sm"|"md"|"lg";className?:string;disabled?:boolean;type?:"button"|"submit";fullWidth?:boolean}
export default function Button({children,onClick,variant="primary",size="md",className="",disabled,type="button",fullWidth}:ButtonProps){
  const V={primary:"bg-[#00488D] text-white hover:bg-[#005fb8]",secondary:"bg-white text-[#0D2744] border border-[#E2E8F0] hover:bg-[#F8FAFC]",danger:"bg-[#FEE2E2] text-[#960010] hover:bg-[#FECACA]",success:"bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0]"}
  const S={sm:"text-xs px-3 py-1.5",md:"text-sm px-4 py-2",lg:"text-base px-5 py-3"}
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] font-semibold cursor-pointer transition-colors disabled:opacity-50 ${V[variant]} ${S[size]} ${fullWidth?"w-full":""} ${className}`}>{children}</button>
}