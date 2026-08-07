import type { MetadataRoute } from "next";

import { IS_DEMO } from "@/lib/demo/flag";

/**
 * A blocking `robots.txt` for the demo, and nothing else.
 *
 * Two reasons the demo must not be indexed: it would compete in search results
 * with anything real, and a visitor arriving cold from a search result has none
 * of the context the banner gives someone who followed a link — they would be
 * reading generated numbers as somebody's actual finances.
 *
 * Paired with `robots: { index: false, follow: false }` on the demo's metadata
 * in `src/app/layout.tsx`. Both are needed: `robots.txt` asks crawlers not to
 * fetch, the meta tag asks them not to index what they fetched anyway.
 *
 * The production branch is `Allow: /`, which is exactly what an absent
 * `robots.txt` already meant — this file changes nothing for the real app.
 */
export default function robots(): MetadataRoute.Robots {
  if (IS_DEMO) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return { rules: { userAgent: "*", allow: "/" } };
}
