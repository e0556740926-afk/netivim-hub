import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import SessionWrapper from "@/components/SessionWrapper"

export const metadata: Metadata = {
  title: "נתיבים שטח",
  description: "מערכת ניהול שטח לרכזי נתיבים",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="manifest" href="/manifest.json"/>
        <meta name="theme-color" content="#0D2744"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="נתיבים שטח"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800&display=swap" rel="stylesheet"/>
      </head>
      <body>
        <SessionWrapper>
          <AuthProvider>{children}</AuthProvider>
        </SessionWrapper>
      </body>
    </html>
  )
}
