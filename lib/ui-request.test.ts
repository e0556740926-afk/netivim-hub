import { afterEach, describe, expect, it, vi } from "vitest"
import { uiMutation, uiRequest } from "./ui-request"

afterEach(()=>vi.unstubAllGlobals())
describe("UI server confirmation",()=>{
 it("does not treat a legacy 200 response containing an error as success",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:"העדכון נכשל"}),{status:200})))
  await expect(uiMutation("/api/events/1","PATCH",{})).rejects.toThrow("העדכון נכשל")
 })
 it("rejects an unsuccessful write instead of allowing a success state",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:"אין הרשאה"}),{status:403})))
  await expect(uiMutation("/api/events/1","PATCH",{name:"בדיקה"})).rejects.toThrow("אין הרשאה")
 })
 it("handles an upstream HTML error without a JSON parsing crash",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("Unavailable",{status:503})))
  await expect(uiRequest("/api/events")).rejects.toThrow("הפעולה לא הושלמה")
 })
 it("preserves multi-assignee payloads sent to the existing task endpoint",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:1}),{status:201}));vi.stubGlobal("fetch",fetchMock)
  await uiMutation("/api/tasks","POST",{title:"מעקב",assignees:["רכז א","רכז ב"]})
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).assignees).toEqual(["רכז א","רכז ב"])
 })
})
