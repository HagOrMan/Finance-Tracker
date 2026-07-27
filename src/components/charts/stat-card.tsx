import { Card, CardContent, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="gap-1 p-4">
      <CardTitle>{label}</CardTitle>
      <CardContent className="p-0 text-2xl font-semibold text-foreground tabular-nums">
        {value}
      </CardContent>
    </Card>
  );
}
