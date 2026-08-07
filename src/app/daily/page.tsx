import { redirect } from "next/navigation";

/**
 * The daily breakdown *is* the landing page now — see `src/app/page.tsx`.
 *
 * The route stays as a redirect rather than being deleted: `/daily` is what a
 * year of bookmarks and the docs point at, and a permanent redirect costs one
 * file against a 404.
 */
export default function DailyRedirect() {
  redirect("/");
}
