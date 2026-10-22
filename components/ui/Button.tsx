interface ButtonProps {
  children: React.ReactNode; onClick?: () => void
  variant?: "primary" | "secondary" | "danger" | "success"
  size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean
  type?: "button" | "submit"; fullWidth?: boolean; form?:string
}
export default function Button({children,onClick,variant="primary",size="md",className="",disabled,type="button",fullWidth,form}:ButtonProps) {
  const variants = {primary:"ui-btn-primary",secondary:"",danger:"ui-btn-danger",success:"ui-btn-success"}
  return <button form={form} type={type} onClick={onClick} disabled={disabled}
    className={`ui-btn ${variants[variant]} ${size==="md"?"":`ui-btn-${size}`} ${fullWidth?"w-full":""} ${className}`}>{children}</button>
}
