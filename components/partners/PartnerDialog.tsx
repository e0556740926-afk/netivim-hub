"use client"
import { ReactNode, useEffect, useRef } from "react"

/** Native modal supplies focus containment, inert background and Escape support. */
export default function PartnerDialog({title, subtitle, children, onClose, wide=false, footer}: {title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean;footer?:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  const close=useRef(onClose); close.current=onClose
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    const overflow=document.body.style.overflow
    document.body.style.overflow="hidden"
    ref.current?.showModal()
    return ()=>{document.body.style.overflow=overflow;previous?.focus()}
  },[])
  return <dialog ref={ref} className={`partner-dialog ${wide?'partner-dialog-wide':''}`} dir="rtl" aria-label={title}
    onCancel={e=>{e.preventDefault();close.current()}}
    onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close.current()}}}>
    <header className="partner-dialog-head"><div><span className="partner-eyebrow">נתיבים / סביבת השותפויות</span><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="partner-icon-button" aria-label="סגור חלון" onClick={onClose}>×</button></header>
    <div className="partner-dialog-body">{children}</div>
    {footer&&<footer className="partner-dialog-footer">{footer}</footer>}
  </dialog>
}
