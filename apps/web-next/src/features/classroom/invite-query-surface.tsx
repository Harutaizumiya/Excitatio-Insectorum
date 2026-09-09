"use client";

import { useSearchParams } from "next/navigation";

import { InviteSurface } from "./invite-surface";

export function InviteQuerySurface(): React.ReactElement {
  const searchParams = useSearchParams();
  return <InviteSurface token={searchParams.get("token")?.trim() ?? ""} />;
}
