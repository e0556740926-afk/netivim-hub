import {Fragment} from 'react'
import {scriptBlocks} from '@/lib/knowledge'

function Inline({text}:{text:string}){
 const parts=text.split(/(\*\*.+?\*\*)/g)
 return <>{parts.map((p,i)=>p.startsWith('**')&&p.endsWith('**')&&p.length>4?<strong key={i}>{p.slice(2,-2)}</strong>:<Fragment key={i}>{p}</Fragment>)}</>
}

export default function ScriptBody({body}:{body:string}){
 return <div className="kb-script-body">{scriptBlocks(body).map((b,i)=>{
  switch(b.type){
   case 'quote':return <blockquote key={i}><Inline text={b.text}/></blockquote>
   case 'h':return <h4 key={i}><Inline text={b.text}/></h4>
   case 'note':return <aside key={i} className="kb-script-note"><Inline text={b.text}/></aside>
   case 'ul':return <ul key={i}>{b.items.map((t,n)=><li key={n}><Inline text={t}/></li>)}</ul>
   case 'ol':return <ol key={i}>{b.items.map((t,n)=><li key={n}><Inline text={t}/></li>)}</ol>
   case 'table':return <div key={i} className="kb-script-table"><table><thead><tr>{b.head.map((h,n)=><th key={n}><Inline text={h}/></th>)}</tr></thead><tbody>{b.rows.map((r,n)=><tr key={n}>{b.head.map((_,c)=><td key={c} data-label={b.head[c]}><Inline text={r[c]||''}/></td>)}</tr>)}</tbody></table></div>
   default:return <p key={i}><Inline text={b.text}/></p>
  }
 })}</div>
}
