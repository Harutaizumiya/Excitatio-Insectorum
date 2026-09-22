import { Navigate } from "react-router-dom";
import { getUserSession } from "@/lib/session";

export function HomeRedirect(): React.ReactElement {
  const session = getUserSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/admin" replace />;
}
