import { afterEach, describe, expect, it, vi } from "vitest"
import { lockOverlayScroll } from "./overlay-scroll"
afterEach(()=>vi.unstubAllGlobals())
describe("stacked overlay scrolling",()=>{
 it("keeps the page locked when a parent closes before its child",()=>{
  const style={overflow:"auto"};vi.stubGlobal("document",{body:{style}})
  const releaseParent=lockOverlayScroll(),releaseChild=lockOverlayScroll()
  releaseParent();expect(style.overflow).toBe("hidden")
  releaseChild();expect(style.overflow).toBe("auto")
 })
 it("tolerates duplicate cleanup without releasing another dialog's lock",()=>{
  const style={overflow:""};vi.stubGlobal("document",{body:{style}})
  const first=lockOverlayScroll(),second=lockOverlayScroll()
  first();first();expect(style.overflow).toBe("hidden")
  second();expect(style.overflow).toBe("")
 })
})
