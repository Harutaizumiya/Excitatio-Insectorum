import { Suspense } from "react";

import { InviteQuerySurface } from "@/features/classroom/invite-query-surface";

export default function InvitePage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <InviteQuerySurface />
    </Suspense>
  );
}
