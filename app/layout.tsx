import type {Metadata} from "next"
import "./globals.css"
import {AuthProvider} from "@/lib/auth-context"

export const metadata:Metadata={title:"נתיבים Hub",description:"פלטפורמת ניהול לרכזי שטח ומנהלי ארגון נתיבים"}

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="he" dir="rtl">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800&display=swap" rel="stylesheet"/>
    </head>
    <body><AuthProvider>{children}</AuthProvider></body>
  </html>
}