import Link from "next/link"

export default function WorkspaceHeader({title,description,parent,actions}:{
  title:string; description?:string; parent?:{label:string;href:string}; actions?:React.ReactNode
}) {
  return <header className="ui-header">
    <div><div className="ui-eyebrow">{parent?<><Link href={parent.href}>{parent.label}</Link><span aria-hidden="true">/</span></>:<span>נתיבים · ניהול שטח</span>}</div>
      <h1>{title}</h1>{description&&<p>{description}</p>}
    </div>
    {actions&&<div className="ui-actions">{actions}</div>}
  </header>
}
