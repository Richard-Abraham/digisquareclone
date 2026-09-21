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
  onFinish: () => void;
}

export function ProductTour({ open, onFinish }: ProductTourProps) {
  // Keep the latest onFinish without re-running the effect when the parent
  // re-renders with a new closure.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let driverObj: Driver | null = null;
    let raf2 = 0;

    // Wait a couple of frames before reading the DOM: `open` can flip to true
    // in the same tick the dashboard's own data finishes loading and its
    // board/stat elements are still being painted. Two rAFs let that commit
    // land first without adding a real polling/retry system.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;

        const steps = selectAvailableSteps(
          TOUR_STEPS,
          (id) => !!document.querySelector(`[data-tour="${id}"]`)
        );
        if (steps.length === 0) {
          onFinishRef.current();
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
          onPopoverRender: (popover) => {
            const skipBtn = document.createElement("button");
            skipBtn.type = "button";
            skipBtn.className = "driver-popover-skip-btn";
            skipBtn.textContent = "Skip";
            skipBtn.addEventListener("click", () => obj.destroy());
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

        driverObj = obj;
        obj.drive();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (driverObj && driverObj.isActive()) driverObj.destroy();
    };
  }, [open]);

  return null;
}
