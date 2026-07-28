/**
 * Shared email chrome — the document shell, the escaping, and the handful of
 * markup primitives both templates use (ARCHITECTURE.md).
 *
 * Everything here exists because **the target is Gmail, on a phone and on a
 * desktop**, and Gmail's mobile app strips `<head>` styles for accounts it
 * doesn't host. That single fact forces most of what follows:
 *
 * - Every style is inline on the element. No `<style>` block, no classes.
 * - Layout is tables with `role="presentation"`, not flexbox or grid.
 * - No media queries — they are pointless where `<style>` is stripped. The
 *   layout is fluid instead: `width="100%"` capped by `max-width:600px`, one
 *   column throughout, which fills a 390px phone and caps on a desktop with no
 *   breakpoint anywhere.
 * - No external anything: no web fonts, no CDN, no remote images. A bar chart
 *   made of images is invisible until images load, which for many recipients is
 *   never — so bars are colored table cells.
 * - `color` and `background-color` are always set **together** on any element
 *   carrying text. Gmail applies its own dark-mode inversion, and its failure
 *   mode is always the same one: it inverts the text color and leaves an
 *   explicitly-set background, producing white on white.
 */

/**
 * Email-only color tokens.
 *
 * Hard-coded hexes rather than the app's CSS variables because an email has no
 * stylesheet to resolve them against. Derived from `globals.css`'s light theme
 * so the two surfaces look like the same product: `#00D1B0` is lush-500,
 * `#00A892` lush-600, and the text tones are the light-mode `--foreground` /
 * `--muted-foreground` converted out of HSL.
 */
export const EMAIL_COLORS = {
  pageBg: "#f2f7f8",
  cardBg: "#ffffff",
  text: "#151f28",
  muted: "#547383",
  faint: "#7a8f99",
  border: "#dce7e8",
  /** Bar track. Light enough to read as "empty", dark enough to be visible. */
  track: "#e6edee",
  accent: "#00d1b0",
  accentDeep: "#00a892",
  /**
   * Fill for the *baseline* bars in the comparison strip. Deliberately a
   * neutral grey rather than a second brand hue: the current window is the
   * subject of that chart, and the baselines are the backdrop it's read
   * against.
   */
  baselineBar: "#b9c7cb",
  /** More spending. Darkened from the palette red so it passes contrast on white. */
  up: "#c0362f",
  /** Less spending. The palette's green, which already passes on white. */
  down: "#008300",
} as const;

export const EMAIL_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Cap the content column. Fluid below it; no breakpoint involved. */
export const EMAIL_MAX_WIDTH = 600;

/**
 * Escapes for element content and double-quoted attributes.
 *
 * Category, store and entity names are free text, and this is the boundary
 * where they stop being data and start being markup. Note `'` is deliberately
 * not escaped — nothing is ever interpolated into a single-quoted attribute in
 * either template, and keeping that true is cheaper than escaping apostrophes
 * out of every store name.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A horizontal bar: a **two-cell table**, not a div with a percentage width.
 *
 * Percentage widths on divs inside table cells are the least portable thing in
 * email, and the two-cell version costs nothing. `font-size:0;line-height:0`
 * plus the `&nbsp;` is what stops the cell collapsing to zero height in clients
 * that ignore the `height` attribute.
 *
 * `fillPercent` must already be an integer — the track is derived as
 * `100 - fill` rather than rounded independently, so the two can never sum to
 * 99 and leave a seam.
 */
export function barHtml(
  fillPercent: number,
  fillColor: string,
  trackColor: string = EMAIL_COLORS.track,
): string {
  const fill = Math.max(0, Math.min(100, Math.round(fillPercent)));
  const cells: string[] = [];
  if (fill > 0) {
    // A full bar rounds on both ends; a partial one only on the left, so the
    // fill and the track meet flush rather than with a notch between them.
    const radius = fill === 100 ? "3px" : "3px 0 0 3px";
    cells.push(
      `<td width="${fill}%" height="10" style="background-color:${fillColor};font-size:0;line-height:0;border-radius:${radius};">&nbsp;</td>`,
    );
  }
  if (fill < 100) {
    cells.push(
      `<td width="${100 - fill}%" height="10" style="background-color:${trackColor};font-size:0;line-height:0;border-radius:${fill > 0 ? "0 3px 3px 0" : "3px"};">&nbsp;</td>`,
    );
  }
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;">`,
    `<tr>${cells.join("")}</tr>`,
    `</table>`,
  ].join("");
}

/** A titled block on a white card — the repeating unit of both templates. */
export function sectionHtml(heading: string | null, inner: string): string {
  const headingHtml = heading
    ? `<div style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_COLORS.muted};background-color:${EMAIL_COLORS.cardBg};">${escapeHtml(heading)}</div>`
    : "";
  return [
    `<tr><td style="padding:20px;background-color:${EMAIL_COLORS.cardBg};border-bottom:1px solid ${EMAIL_COLORS.border};">`,
    headingHtml,
    inner,
    `</td></tr>`,
  ].join("");
}

/**
 * Wraps section rows in the full document.
 *
 * `preheader` is the inbox preview line. The trailing run of zero-width
 * non-joiners is the standard padding trick: without it the client pulls the
 * next visible text ("Finance Tracker") into the preview and wastes it.
 */
export function emailShell({
  title,
  preheader,
  sections,
}: {
  title: string;
  preheader: string;
  /** Pre-built `<tr>` rows, normally from `sectionHtml`. */
  sections: string;
}): string {
  const { pageBg, cardBg, text, border } = EMAIL_COLORS;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${pageBg};color:${text};font-family:${EMAIL_FONT};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${pageBg};">${escapeHtml(preheader)}${"&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${pageBg};">
<tr>
<td align="center" style="padding:16px 12px;background-color:${pageBg};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:${EMAIL_MAX_WIDTH}px;background-color:${cardBg};border:1px solid ${border};border-radius:10px;overflow:hidden;">
${sections}
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
