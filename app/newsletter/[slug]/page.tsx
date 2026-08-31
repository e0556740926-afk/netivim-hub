"use client"
import { use } from "react"
import NewsletterForm from "@/components/NewsletterForm"

export default function CoordNewsletterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <NewsletterForm slug={slug}/>
}
