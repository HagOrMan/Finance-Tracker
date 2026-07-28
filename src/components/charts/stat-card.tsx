import { Card, CardContent, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    // `min-w-0` is what stops a long value blowing the whole page out
    // sideways. These sit in a `grid-cols-2` on mobile, and a grid track's
    // automatic minimum is its content's min-content width — for an
    // unbreakable string like "$123,456.78" that's the full number, so the
    // column refuses to shrink and the grid overflows the viewport rather
    // than the text overflowing the card.
    <Card className="min-w-0 gap-1 p-4">
      <CardTitle>{label}</CardTitle>
      {/* 24px only once there's room for it: two of these side by side on a
          390px screen leaves ~140px of card, which a six-figure total
          overruns at `text-2xl`. */}
      <CardContent className="p-0 text-xl font-semibold text-foreground tabular-nums sm:text-2xl">
        {value}
      </CardContent>
    </Card>
  );
}
