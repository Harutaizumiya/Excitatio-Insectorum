import { useSearchParams } from "react-router-dom";

import { InviteSurface } from "./invite-surface";

export function InviteQuerySurface(): React.ReactElement {
  const [searchParams] = useSearchParams();
  return <InviteSurface token={searchParams.get("token")?.trim() ?? ""} />;
}
