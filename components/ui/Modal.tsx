"use client"
import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { lockOverlayScroll } from "@/lib/overlay-scroll"

interface ModalProps {
  open:boolean; onClose:()=>void; title:string; subtitle?:string; children:React.ReactNode
  footer?:React.ReactNode; accent?:string; width?:string
}
const dialogs: HTMLElement[] = []
const focusable = 'button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({open,onClose,title,subtitle,children,footer,accent,width="640px"}:ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId(), descriptionId = useId()
  useEffect(()=>{
    if(!open || !panel.current) return
    const element = panel.current
    const opener = document.activeElement as HTMLElement | null
    const releaseScroll=lockOverlayScroll()
    dialogs.push(element)
    element.focus()
    function onKey(e:KeyboardEvent){
      if(dialogs.at(-1)!==element) return
      if(Array.from(document.querySelectorAll('dialog[open]')).some(d=>!element.contains(d)))return
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close.current();return}
      if(e.key!=="Tab") return
      const items=Array.from(element.querySelectorAll<HTMLElement>(focusable)).filter(n=>n.getClientRects().length>0)
      const first=items[0], last=items.at(-1)
      if(!first){e.preventDefault();element.focus();return}
      if(e.shiftKey && (document.activeElement===first || document.activeElement===element)){e.preventDefault();last?.focus()}
      else if(!e.shiftKey && (document.activeElement===last || !element.contains(document.activeElement))){e.preventDefault();first.focus()}
    }
    document.addEventListener("keydown",onKey,true)
    return ()=>{
      document.removeEventListener("keydown",onKey,true)
      const index=dialogs.indexOf(element);if(index>=0)dialogs.splice(index,1)
      releaseScroll()
      if(opener?.isConnected)opener.focus()
    }
  },[open])
  if(!open || typeof document==="undefined")return null
  return createPortal(<div className="ui-dialog-layer" dir="rtl">
    <div className="ui-dialog-backdrop" aria-hidden="true" onClick={()=>{if(dialogs.at(-1)===panel.current)close.current()}}/>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-describedby={subtitle?descriptionId:undefined} className="ui-dialog" style={{maxWidth:width}}>
      <header className="ui-dialog-header">
        <div className="min-w-0"><h2 id={titleId} style={{color:accent||"var(--ui-ink)"}}>{title}</h2>{subtitle&&<p id={descriptionId}>{subtitle}</p>}</div>
        <button type="button" className="ui-dialog-close" onClick={onClose} aria-label="סגור חלון">×</button>
      </header>
      <div className="ui-dialog-body">{children}</div>
      {footer&&<footer className="ui-dialog-footer">{footer}</footer>}
    </div>
  </div>,document.body)
}
