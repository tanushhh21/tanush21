import { redirect } from "next/navigation";

/** Company knowledge lives in Settings now. */
export default function Brain() {
  redirect("/console/settings/knowledge");
}
