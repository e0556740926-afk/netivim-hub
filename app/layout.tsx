import type { Metadata, Viewport } from "next"
import "@fontsource/heebo/300.css"
import "@fontsource/heebo/400.css"
import "@fontsource/heebo/500.css"
import "@fontsource/heebo/700.css"
import "@fontsource/heebo/800.css"
import "./globals.css"
import "./workspace.css"
import { AuthProvider } from "@/lib/auth-context"
import SessionWrapper from "@/components/SessionWrapper"
import { ToastProvider } from "@/components/ui/Toast"

export const metadata: Metadata = {
  title: "נתיבים שטח",
  description: "מערכת ניהול שטח לרכזי נתיבים",
}

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#143b31",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="manifest" href="/manifest.json"/>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="נתיבים שטח"/>
      </head>
      <body>
        <SessionWrapper>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </SessionWrapper>
      </body>
    </html>
  )
}
