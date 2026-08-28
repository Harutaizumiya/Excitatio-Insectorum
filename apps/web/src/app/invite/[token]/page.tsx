import { InviteSurface } from "@/features/classroom/invite-surface"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }): Promise<React.ReactElement> {
  const { token } = await params
  return <InviteSurface token={token} />
}

