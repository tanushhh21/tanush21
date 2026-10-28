import { redirect } from "next/navigation";

/** Replaced by the welcome page, which offers pending invites and creating a company. */
export default function NoAccess() {
  redirect("/console/welcome");
}
