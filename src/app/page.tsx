import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";

export default async function IndexPage() {
  const user = await verifySession();
  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
