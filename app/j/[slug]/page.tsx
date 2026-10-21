"use client"
import {use} from "react"
import PublicReferralForm from "@/components/partners/PublicReferralForm"
export default function PublicForm({params}:{params:Promise<{slug:string}>}){const {slug}=use(params);return <PublicReferralForm slug={slug}/>}
