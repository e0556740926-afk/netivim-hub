"use client"
import {leadColor} from "@/lib/utils"
interface SpeedometerProps{actual:number;target:number;size?:number;dark?:boolean}
export default function Speedometer({actual,target,size=160,dark=false}:SpeedometerProps){
  const p=target>0?Math.min(Math.round(actual/target*100),100):0
  const col=leadColor(p)
  const grad=`conic-gradient(${col} ${p}%, ${dark?"rgba(255,255,255,.16)":"#DBEAFE"} 0)`
  const inner=Math.round(size*.775)
  return <div style={{width:size,height:size,borderRadius:"50%",background:grad,display:"flex",alignItems:"center",justifyContent:"center",transition:"background .8s ease",flexShrink:0}}>
    <div style={{width:inner,height:inner,borderRadius:"50%",background:dark?"#0D2744":"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:size*.2,fontWeight:800,lineHeight:1,color:dark?"#fff":"#0D2744"}}>{actual}</div>
      <div style={{fontSize:size*.073,color:dark?"rgba(255,255,255,.7)":"#64748B"}}>מתוך {target}</div>
      <div style={{fontSize:size*.085,fontWeight:700,color:col,marginTop:3}}>{p}%</div>
    </div>
  </div>
}