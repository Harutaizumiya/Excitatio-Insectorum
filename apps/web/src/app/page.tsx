import { redirect } from "next/navigation";
import { HomeRedirect } from "@/features/classroom/home-redirect";

export default function Home() {
  if (process.env.NEXT_OUTPUT_MODE !== "export") {
    redirect("/login");
  }

  return <HomeRedirect />;
}
