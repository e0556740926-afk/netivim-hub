let locks = 0
let previous = ""
/** All dialog families share a lock, including when their parents unmount first. */
export function lockOverlayScroll():()=>void {
  if(locks++===0){previous=document.body.style.overflow;document.body.style.overflow="hidden"}
  let released=false
  return ()=>{
    if(released)return
    released=true
    if(--locks===0)document.body.style.overflow=previous
  }
}
