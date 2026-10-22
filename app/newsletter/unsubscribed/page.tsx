import Link from "next/link"
import PublicShell from "@/components/ui/PublicShell"
export default function UnsubscribedPage(){return <PublicShell eyebrow="ניוזלטר נתיבים" title={"תודה שהייתם\nחלק מהדרך."} description="אנחנו מכבדים את הבחירה שלכם. הדלת תמיד פתוחה לחזור ולהישאר בקשר."><div className="ui-public-success"><span aria-hidden="true">✓</span><h2>הוסרתם בהצלחה</h2><p className="ui-note">לא תקבלו יותר עדכונים מהניוזלטר של נתיבים. אפשר להירשם שוב בכל עת.</p><Link href="/newsletter" className="ui-btn mt-6">הרשמה מחדש</Link></div></PublicShell>}
