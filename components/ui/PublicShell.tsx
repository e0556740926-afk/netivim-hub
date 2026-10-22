import Image from "next/image"
export default function PublicShell({children,eyebrow="נתיבים · ממשיכים בדרך שלך",title="הדרך הבאה שלך\nמתחילה כאן.",description="חיבור אישי, אנשים טובים והזדמנויות להתקדם. אנחנו כאן כדי לעזור למצוא את הדרך המתאימה.",owner}:{children:React.ReactNode;eyebrow?:string;title?:string;description?:string;owner?:React.ReactNode}){
 return <main className="ui-public" dir="rtl"><div className="ui-public-shell">
  <aside className="ui-public-story"><Image src="/netivim-logo.png" alt="נתיבים" width={140} height={45} priority className="brightness-0 invert"/>
   <div className="ui-public-story-copy"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>{owner&&<div className="ui-public-owner">{owner}</div>}</div>
   <footer>נתיבים · אנשים, קהילה ודרך</footer>
  </aside>
  <section className="ui-public-content">{children}</section>
 </div></main>
}
