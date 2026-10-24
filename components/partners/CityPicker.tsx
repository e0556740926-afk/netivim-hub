'use client'
import {useId,useMemo,useRef,useState} from 'react'

const norm=(s:string)=>String(s||'').replace(/["״׳']/g,'').replace(/\s+/g,' ').trim()

/**
 * Searchable city dropdown: type to filter the list, pick with mouse or
 * arrows+Enter. A city that isn't in the list can still be added as typed.
 */
export default function CityPicker({value,options,onChange,label='עיר'}:{value:string;options:string[];onChange:(city:string)=>void;label?:string}){
  const [open,setOpen]=useState(false),[text,setText]=useState<string|null>(null),[active,setActive]=useState(0)
  const listId=useId(),blurTimer=useRef<any>(null)
  const query=text??value
  const matches=useMemo(()=>{
    const q=norm(query);const all=[...new Set(options.map(o=>o.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'he'))
    if(!q||(text===null))return all
    const starts=all.filter(c=>norm(c).startsWith(q)),inner=all.filter(c=>!norm(c).startsWith(q)&&norm(c).includes(q))
    return [...starts,...inner]
  },[options,query,text])
  const typed=norm(query),exact=matches.some(c=>norm(c)===typed)
  const items=[...matches,...(typed&&!exact&&text!==null?[`__new__${query.trim()}`]:[])]
  const pick=(c:string)=>{onChange(c);setText(null);setOpen(false)}
  const choose=(item:string)=>pick(item.startsWith('__new__')?item.slice(7):item)
  return <div className="city-picker">
    <label htmlFor={listId+'-in'}>{label}</label>
    <div className="city-picker-box">
      <input id={listId+'-in'} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" placeholder="חיפוש עיר…"
        value={query}
        onFocus={()=>{setOpen(true);setActive(0)}}
        onClick={()=>setOpen(true)}
        onBlur={()=>{blurTimer.current=setTimeout(()=>{setOpen(false);if(text!==null){if(!text.trim())onChange('');setText(null)}},150)}}
        onChange={e=>{setText(e.target.value);setOpen(true);setActive(0)}}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(a=>Math.min(a+1,items.length-1))}
          else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0))}
          else if(e.key==='Enter'&&open&&items[active]){e.preventDefault();choose(items[active])}
          else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);setText(null)}
        }}/>
      {value&&<button type="button" className="city-picker-clear" aria-label="ניקוי עיר" onMouseDown={e=>e.preventDefault()} onClick={()=>{pick('')}}>×</button>}
      <span className="city-picker-caret" aria-hidden>▾</span>
    </div>
    {open&&<ul id={listId} role="listbox" className="city-picker-list" onMouseDown={e=>e.preventDefault()}>
      {items.map((item,i)=>{const isNew=item.startsWith('__new__');const name=isNew?item.slice(7):item
        return <li key={item} role="option" aria-selected={i===active} data-active={i===active} data-current={!isNew&&name===value} onMouseEnter={()=>setActive(i)} onClick={()=>choose(item)}>{isNew?<>הוספת עיר: <b>{name}</b></>:name}</li>})}
      {!items.length&&<li className="city-picker-empty">לא נמצאו ערים</li>}
    </ul>}
  </div>
}
