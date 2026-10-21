import { redirect } from "next/navigation"

// The ad-hoc audience sender was replaced by the messaging center, which
// adds consent/suppression checks, unsubscribe links and background sending.
export default function OldAudiencesPage() {
  redirect("/admin/messaging?tab=audiences")
}
