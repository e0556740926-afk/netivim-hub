"use client"
import { use } from "react"
import PublicCaptureForm from "@/components/leads/PublicCaptureForm"
export default function PublicSourceForm({params}:{params:Promise<{slug:string}>}){const{slug}=use(params);return <PublicCaptureForm slug={slug} kind="source"/>}
