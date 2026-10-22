import {describe,expect,it} from "vitest"
import {isValidIsraeliId} from "./israeli-id"

describe("Israeli ID check digit (synthetic test numbers)",()=>{
  it.each(["123456782","000000018","000123455"])("accepts a valid check digit and keeps leading zeros: %s",value=>{
    expect(isValidIsraeliId(value)).toBe(true)
  })
  it.each(["123456781","123456783","000000000","12345678","1234567820","12345678a"," 123456782","123-456782","",null,undefined,123456782])("rejects an invalid value: %s",value=>{
    expect(isValidIsraeliId(value)).toBe(false)
  })
  it("rejects every single-digit typo in a valid number",()=>{
    const original="123456782"
    for(let index=0;index<9;index++)for(let digit=0;digit<10;digit++){
      if(String(digit)===original[index])continue
      expect(isValidIsraeliId(original.slice(0,index)+digit+original.slice(index+1))).toBe(false)
    }
  })
})
