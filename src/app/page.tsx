import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/routes";

/**
 * The app opens on the prayer checklist — that is the screen with something to
 * do on it. Entry analytics live at /dashboard.
 */
export default function RootPage() {
  redirect(HOME_PATH);
}
