"use client";
import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_STEPS, selectAvailableSteps, stepCounter } from "@/lib/tour";

// The ONLY file in this app that talks to driver.js or the DOM for the tour.
// Everything else (which steps exist, their copy, ordering) lives in the pure
// src/lib/tour.ts module so the library can be swapped later with a one-file change.

interface ProductTourProps {
  open: boolean;
  /** The user finished or skipped: record it so the tour does not return. */
  onFinish: () => void;
  /** We could not start (no targets in time): close WITHOUT recording, so it retries. */
  onAbort: () => void;
}

export function ProductTour({ open, onFinish, onAbort }: ProductTourProps) {
  // Keep the latest callbacks without re-running the effect when the parent
  // re-renders with a new closure.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onAbortRef = useRef(onAbort);
  onAbortRef.current = onAbort;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let driverObj: Driver | null = null;
    let onSkipClick: ((e: MouseEvent) => void) | null = null;
    let timer = 0;

    // Poll for the tour's targets rather than sampling the DOM once. `open` can flip
    // true while the dashboard is still fetching, and a single snapshot then finds no
    // anchors — which previously counted as "finished" and recorded the tour as seen,
    // losing it permanently for that user. Retry until the board paints, then give up
    // WITHOUT recording so the next visit tries again.
    const deadline = Date.now() + 8000;

    const attempt = () => {
      if (cancelled) return;

      const steps = selectAvailableSteps(
        TOUR_STEPS,
        (id) => !!document.querySelector(`[data-tour="${id}"]`)
      );

      if (steps.length === 0) {
        if (Date.now() < deadline) {
          timer = window.setTimeout(attempt, 200);
          return;
        }
        onAbortRef.current();
        return;
      }

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        onFinishRef.current();
      };

      const obj = driver({
        animate: !reducedMotion,
        smoothScroll: !reducedMotion,
        allowClose: true,
        overlayClickBehavior: "close",
        showProgress: true,
        prevBtnText: "Back",
        nextBtnText: "Next",
        doneBtnText: "Done",
        onPopoverRender: (popover: any) => {
          // Only build the element here. The click is handled by a delegated
          // listener below: driver.js re-renders the popover between steps, and a
          // listener attached directly to this node does not survive that — the
          // button renders but does nothing (verified in a browser).
          const skipBtn = document.createElement("button");
          skipBtn.type = "button";
          skipBtn.className = "driver-popover-skip-btn";
          skipBtn.textContent = "Skip";
          popover.footerButtons.insertBefore(skipBtn, popover.footerButtons.firstChild);
        },
        onDestroyed: finish,
        steps: steps.map((step, idx) => ({
          element: `[data-tour="${step.id}"]`,
          popover: {
            title: step.title,
            description: step.description,
            side: step.side,
            progressText: stepCounter(idx, steps.length),
          },
        })),
      });

      // Delegated so it keeps working across driver.js's popover re-renders.
      onSkipClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.(".driver-popover-skip-btn")) {
          e.preventDefault();
          e.stopPropagation();
          // Call finish() explicitly rather than relying on onDestroyed firing for a
          // programmatic destroy — verified in a browser that Skip otherwise closed
          // the tour without persisting, so it came back on the next load. The
          // `finished` latch makes this safe if onDestroyed fires as well.
          finish();
          obj.destroy();
        }
      };
      document.addEventListener("click", onSkipClick, true);

      driverObj = obj;
      obj.drive();
    };

    timer = window.setTimeout(attempt, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (onSkipClick) document.removeEventListener("click", onSkipClick, true);
      if (driverObj && driverObj.isActive()) driverObj.destroy();
    };
  }, [open]);

  return null;
}
