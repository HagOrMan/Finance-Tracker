"use client";

import { Button } from "@/components/ui/button";

/**
 * A two-click button: the first click arms it, the second runs it.
 *
 * Used for the store/entity bulk actions, which rewrite dozens of rows at once
 * with no undo (FEATURES.md §4.5 — "every bulk action shows the affected count
 * and requires a confirm click"). The armed label carries the count, so the
 * confirmation states what is about to happen rather than just asking twice.
 *
 * `armed` is owned by the parent and shared across every button in a group, so
 * arming one disarms the others — you can't leave a stale confirmation primed
 * behind a control you then changed your mind about. Parents also clear it
 * whenever an action's inputs change, so a confirm always applies to what the
 * label said when it was armed.
 */
export function ConfirmButton({
  id,
  armed,
  setArmed,
  label,
  confirmLabel,
  disabled,
  onRun,
}: {
  /** Unique within the parent's group of confirmable actions. */
  id: string;
  armed: string | null;
  setArmed: (id: string | null) => void;
  label: string;
  confirmLabel: string;
  disabled?: boolean;
  onRun: () => void | Promise<void>;
}) {
  const isArmed = armed === id;

  return (
    <Button
      type="button"
      size="sm"
      variant={isArmed ? "destructive" : "default"}
      disabled={disabled}
      title={isArmed ? "Click again to apply — this cannot be undone" : label}
      onClick={() => {
        if (!isArmed) {
          setArmed(id);
          return;
        }
        setArmed(null);
        void onRun();
      }}
    >
      {isArmed ? confirmLabel : label}
    </Button>
  );
}
