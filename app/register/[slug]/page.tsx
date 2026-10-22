import PublicEventRegistration from '@/components/events/PublicEventRegistration'
export default async function EventRegistrationPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <PublicEventRegistration slug={slug}/>}
