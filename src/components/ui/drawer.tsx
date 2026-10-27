"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/**
 * `repositionInputs` off: vaul's own keyboard handling left the sheet where it
 * was on iOS, with the keyboard covering its bottom and the lower fields
 * unreachable. `DrawerContent` does that job instead — see `useKeyboardInset`.
 * Leaving vaul's on as well would have two handlers writing the same styles.
 */
function Drawer({
  repositionInputs = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      repositionInputs={repositionInputs}
      {...props}
    />
  );
}

/**
 * Below this, a gap between the layout and visual viewports is browser chrome
 * or rounding, not a keyboard — the iOS keyboard is ~300px.
 */
const MIN_KEYBOARD_PX = 80;

/** Space kept between a revealed field and the edge of the drawer body. */
const REVEAL_MARGIN_PX = 16;

function isTextEntry(el: unknown): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["checkbox", "radio", "button", "submit", "reset", "range"].includes(
    el.type,
  );
}

/**
 * Scrolls the field into view within its `DrawerBody` only.
 *
 * Not `scrollIntoView`: that scrolls every scrollable ancestor, including the
 * page behind the overlay, and on iOS a page scroll pans the visual viewport —
 * which fires the listener in `useKeyboardInset` again.
 */
function revealInDrawerBody(el: HTMLElement) {
  const body = el.closest<HTMLElement>('[data-slot="drawer-body"]');
  if (!body) return;
  const bodyRect = body.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  if (rect.bottom > bodyRect.bottom - REVEAL_MARGIN_PX) {
    body.scrollTop += rect.bottom - bodyRect.bottom + REVEAL_MARGIN_PX;
  } else if (rect.top < bodyRect.top + REVEAL_MARGIN_PX) {
    body.scrollTop -= bodyRect.top + REVEAL_MARGIN_PX - rect.top;
  }
}

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport, and
 * the visible height left above it — or `null` while no keyboard is up.
 *
 * `position: fixed` is laid out against the layout viewport, but the keyboard
 * shrinks only the *visual* one, and iOS may also pan the visual viewport down
 * (`offsetTop`) to reach a low field. Both have to come off, which is why this
 * listens to `scroll` as well as `resize`.
 */
function useKeyboardInset(): { inset: number; visibleHeight: number } | null {
  const [keyboard, setKeyboard] = React.useState<{
    inset: number;
    visibleHeight: number;
  } | null>(null);

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // Coalesced to one read per frame: iOS fires a burst of events while the
      // keyboard animates in.
      frame = requestAnimationFrame(() => {
        const inset = window.innerHeight - viewport.height - viewport.offsetTop;
        setKeyboard((prev) => {
          if (inset < MIN_KEYBOARD_PX) return prev === null ? prev : null;
          const next = {
            inset: Math.round(inset),
            visibleHeight: Math.round(viewport.height),
          };
          return prev &&
            prev.inset === next.inset &&
            prev.visibleHeight === next.visibleHeight
            ? prev
            : next;
        });
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  // Once the sheet has been lifted, bring the focused field above the
  // keyboard. A frame later so the new `bottom`/`max-height` has been laid out.
  React.useEffect(() => {
    if (!keyboard) return;
    const frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      if (isTextEntry(el)) revealInDrawerBody(el);
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboard]);

  return keyboard;
}

function DrawerTrigger(
  props: React.ComponentProps<typeof DrawerPrimitive.Trigger>,
) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal(
  props: React.ComponentProps<typeof DrawerPrimitive.Portal>,
) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose(
  props: React.ComponentProps<typeof DrawerPrimitive.Close>,
) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  style,
  onFocus,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const keyboard = useKeyboardInset();

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col border border-border",
          // `svh`, not `vh`: mobile Safari measures `vh` against the viewport
          // with the browser chrome *retracted*, so the old 85vh sheet was
          // taller than the visible page and its last field sat under the
          // toolbar with no way to reach it.
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:max-h-[90svh] data-[vaul-drawer-direction=bottom]:rounded-t-lg",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:max-h-[90svh] data-[vaul-drawer-direction=top]:rounded-b-lg",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:max-w-sm data-[vaul-drawer-direction=right]:rounded-l-lg",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:max-w-sm data-[vaul-drawer-direction=left]:rounded-r-lg",
          className,
        )}
        // Inline so it beats the `max-h-[90svh]` class while the keyboard is
        // up: `svh` is measured without the keyboard, so 90svh would run
        // straight back underneath it.
        style={
          keyboard
            ? {
                ...style,
                bottom: keyboard.inset,
                maxHeight: Math.round(keyboard.visibleHeight * 0.9),
              }
            : style
        }
        onFocus={(event) => {
          onFocus?.(event);
          // Moving between fields with the keyboard already up changes no
          // viewport size, so `useKeyboardInset` won't fire for it.
          if (keyboard && isTextEntry(event.target)) {
            const target = event.target;
            requestAnimationFrame(() => revealInDrawerBody(target));
          }
        }}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-25 shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex shrink-0 flex-col gap-1.5 p-4 pb-2", className)}
      {...props}
    />
  );
}

/**
 * The scrollable middle of a drawer. **Any content taller than the sheet must
 * be wrapped in this**, not in a plain `<div>`.
 *
 * vaul decides between "the user is scrolling" and "the user is dragging the
 * sheet closed" by walking up from the touch target looking for a scrollable
 * ancestor. With no scroll container in between, every downward drag on a
 * too-tall form reads as dismiss — the sheet gets pulled out from under you and
 * the overflowing fields are unreachable. This gives it one to find.
 *
 * `overscroll-contain` stops a scroll that reaches the end here from chaining
 * into the page behind the overlay, and the safe-area padding keeps the last
 * field clear of the iOS home indicator.
 */
function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn(
        // `min-h-0` is load-bearing: a flex item defaults to `min-height: auto`,
        // which refuses to shrink below its content, so `flex-1 overflow-y-auto`
        // alone would size to the form and never actually scroll.
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2",
        "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
