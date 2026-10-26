import {describe,expect,it} from 'vitest'
import {scriptBlocks,scriptPlain,assetSpec,byteRange,CHUNK_SIZE,MAX_ASSET_SIZE,parseKnowledge,videoEmbed} from './knowledge'
const draft={title:'שיחת היכרות',kind:'script',sections:[{title:'פתיחה',body:'שלום!'}],status:'published'}
describe('Knowledge content validation',()=>{
 it('accepts a complete script',()=>expect(parseKnowledge(draft).sections[0].body).toBe('שלום!'))
 it('allows an incomplete draft',()=>expect(parseKnowledge({...draft,status:'draft',sections:[]}).status).toBe('draft'))
 it('rejects an empty published script',()=>expect(()=>parseKnowledge({...draft,sections:[]})).toThrow('תוכן לתסריט'))
 it('rejects empty titles',()=>expect(()=>parseKnowledge({...draft,title:' '})).toThrow('כותרת'))
 it.each(['__proto__','constructor','html'])('rejects unknown type %s',kind=>expect(()=>parseKnowledge({...draft,kind})).toThrow('סוג תוכן'))
 it('requires selected recipients',()=>expect(()=>parseKnowledge({...draft,audience:'selected'})).toThrow('רכז'))
 it('deduplicates valid recipient ids',()=>expect(parseKnowledge({...draft,audience:'selected',audience_ids:[1,1,-1,'2',2]}).audience_ids).toEqual([1,2]))
 it('removes stale audience for all users',()=>expect(parseKnowledge({...draft,audience:'all',audience_ids:[1]}).audience_ids).toEqual([]))
 it('requires an asset to publish a presentation',()=>expect(()=>parseKnowledge({...draft,kind:'presentation'})).toThrow('קובץ'))
 it('requires video or file to publish video',()=>expect(()=>parseKnowledge({...draft,kind:'video'})).toThrow('סרטון'))
 it('strips incompatible fields when changing content type',()=>expect(parseKnowledge({...draft,asset_id:'00000000-0000-4000-8000-000000000001'}).asset_id).toBeNull())
 it('rejects malformed concurrency version',()=>expect(()=>parseKnowledge({...draft,version:-1})).toThrow('גרסה'))
 it('does not interpret script markup as an embed',()=>expect(videoEmbed('<script>alert(1)</script>')).toBeNull())
 it('allows only validated provider ids',()=>{expect(videoEmbed('https://youtu.be/abcdefghijk')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');expect(videoEmbed('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');expect(videoEmbed('https://youtube.com.evil.test/watch?v=abcdefghijk')).toBeNull();expect(videoEmbed('http://youtu.be/abcdefghijk')).toBeNull()})
})
describe('Private file boundaries',()=>{
 it('splits a large permitted file into bounded parts',()=>expect(assetSpec('מצגת.PPTX',MAX_ASSET_SIZE).parts).toBe(50))
 it('rejects oversize or empty uploads',()=>{expect(()=>assetSpec('x.pdf',MAX_ASSET_SIZE+1)).toThrow();expect(()=>assetSpec('x.pdf',0)).toThrow()})
 it('blocks active document types',()=>{expect(()=>assetSpec('x.html',1)).toThrow();expect(()=>assetSpec('x.svg',1)).toThrow();expect(()=>assetSpec('x.pptm',1)).toThrow()})
 it('normalizes filenames',()=>expect(assetSpec('a\r\n/b.pdf',1).name).toBe('a___b.pdf'))
 it('supports initial and suffix ranges',()=>{expect(byteRange(null,10)).toEqual({start:0,end:9,partial:false});expect(byteRange('bytes=-3',10)).toEqual({start:7,end:9,partial:true});expect(byteRange('bytes=3-',10).end).toBe(9)})
 it.each(['bytes=10-','bytes=5-2','bytes=0-1,3-4','bytes=-0','bytes=-','not-a-range'])('rejects invalid range %s',r=>expect(()=>byteRange(r,10)).toThrow())
 it('clips a range to the actual file end',()=>expect(byteRange(`bytes=0-${CHUNK_SIZE}`,4)).toEqual({start:0,end:3,partial:true}))
})

describe('Script formatting',()=>{
 const body='### פתיחה\n> "שלום, מדבר [שם]"\n> המשך\n\n- א\n- ב\n1. אחד\n2. שניים\n| הוא אומר | עונים |\n|---|---|\n| **אתם מגייסים** | לא |\n! הערה\nטקסט רגיל\nשורה שנייה'
 const b=scriptBlocks(body)
 it('parses every block type',()=>expect(b.map(x=>x.type)).toEqual(['h','quote','ul','ol','table','note','p']))
 it('merges consecutive quote lines',()=>expect(b[1]).toEqual({type:'quote',text:'"שלום, מדבר [שם]"\nהמשך'}))
 it('skips table separator rows',()=>expect(b[4]).toEqual({type:'table',head:['הוא אומר','עונים'],rows:[['**אתם מגייסים**','לא']]}))
 it('keeps legacy plain text as one paragraph',()=>expect(scriptBlocks('שורה\nעוד שורה')).toEqual([{type:'p',text:'שורה\nעוד שורה'}]))
 it('copies without markers',()=>expect(scriptPlain('> **שלום**\n| a | b |')).toBe('שלום\n\na — b'))
})
