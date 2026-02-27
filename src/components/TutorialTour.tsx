import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { TutorialStep, getTutorialStepById } from "@/config/tutorialSteps";

interface TutorialTourProps {
  steps: TutorialStep[];
  currentStepId: TutorialStep["id"] | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const computeRectForStep = (step: TutorialStep | null): Rect | null => {
  if (!step) return null;
  if (step.target === "center-overlay") return null;
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
};

export const TutorialTour = ({
  steps,
  currentStepId,
  onNext,
  onBack,
  onSkip,
  onComplete,
}: TutorialTourProps) => {
  const step = useMemo(
    () => (currentStepId ? getTutorialStepById(currentStepId) : null),
    [currentStepId],
  );

  const [targetRect, setTargetRect] = useState<Rect | null>(() =>
    computeRectForStep(step),
  );

  useLayoutEffect(() => {
    setTargetRect(computeRectForStep(step));
  }, [step]);

  useEffect(() => {
    if (!step || step.target === "center-overlay") return;
    const handle = () => {
      setTargetRect(computeRectForStep(step));
    };
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    const interval = setInterval(handle, 500);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      clearInterval(interval);
    };
  }, [step]);

  if (!step || !currentStepId) return null;
  if (typeof document === "undefined") return null;

  const totalSteps = steps.length;
  const index = steps.findIndex((s) => s.id === step.id);
  const isFirst = index <= 0;
  const isLast = index === totalSteps - 1;
  const hasAdvanceOn = !!step.advanceOn;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const PAD = 8;

  let cardTop = viewportHeight / 2;
  let cardLeft = viewportWidth / 2;
  let useCenteredLayout = !targetRect || step.target === "center-overlay";

  if (targetRect && !useCenteredLayout) {
    const spacing = 16;
    const estimatedCardHeight = 220;
    const belowSpace = viewportHeight - (targetRect.top + targetRect.height);
    const aboveSpace = targetRect.top;

    const canPlaceAbove = aboveSpace >= estimatedCardHeight + spacing;
    const canPlaceBelow = belowSpace >= estimatedCardHeight + spacing;

    if (canPlaceAbove || (!canPlaceBelow && aboveSpace >= belowSpace)) {
      cardTop = Math.max(spacing, targetRect.top - estimatedCardHeight - spacing);
    } else {
      cardTop = targetRect.top + targetRect.height + spacing;
    }
    cardLeft = Math.min(
      Math.max(targetRect.left, spacing),
      viewportWidth - 320 - spacing,
    );
    useCenteredLayout = false;
  } else {
    cardTop = viewportHeight / 2;
    cardLeft = viewportWidth / 2;
  }

  const handlePrimary = () => {
    if (isLast) {
      onComplete();
    } else {
      onNext();
    }
  };

  const body = typeof step.body === "string" ? step.body : step.body;

  const content = (
    <>
      {/* Backdrop quadrants — four rects around the highlighted element so the
          element itself remains clickable (pointer-events pass through). */}
      {targetRect && !useCenteredLayout ? (
        <div className="fixed inset-0 z-40 pointer-events-none" role="presentation">
          {/* top */}
          <div className="pointer-events-auto absolute bg-slate-900/65" style={{ top: 0, left: 0, right: 0, height: Math.max(0, targetRect.top - PAD) }} />
          {/* bottom */}
          <div className="pointer-events-auto absolute bg-slate-900/65" style={{ top: targetRect.top + targetRect.height + PAD, left: 0, right: 0, bottom: 0 }} />
          {/* left */}
          <div className="pointer-events-auto absolute bg-slate-900/65" style={{ top: Math.max(0, targetRect.top - PAD), left: 0, width: Math.max(0, targetRect.left - PAD), height: targetRect.height + PAD * 2 }} />
          {/* right */}
          <div className="pointer-events-auto absolute bg-slate-900/65" style={{ top: Math.max(0, targetRect.top - PAD), left: targetRect.left + targetRect.width + PAD, right: 0, height: targetRect.height + PAD * 2 }} />
          {/* highlight border */}
          <div
            className="pointer-events-none absolute rounded-lg border-2 border-primary/80"
            style={{
              top: targetRect.top - PAD,
              left: targetRect.left - PAD,
              width: targetRect.width + PAD * 2,
              height: targetRect.height + PAD * 2,
            }}
          />
        </div>
      ) : (
        <div className="fixed inset-0 z-40 bg-slate-900/65 pointer-events-auto" role="presentation" />
      )}

      {/* Tooltip card */}
      <div
        className="fixed z-50 pointer-events-auto max-w-sm rounded-lg border border-border bg-popover/95 p-4 shadow-lg backdrop-blur-sm"
        role="dialog"
        aria-modal="false"
        aria-label={step.title}
        style={{
          top: useCenteredLayout ? "50%" : cardTop,
          left: useCenteredLayout ? "50%" : cardLeft,
          transform: useCenteredLayout ? "translate(-50%, -50%)" : "none",
        }}
      >
        <div className="mb-2 text-xs text-muted-foreground">
          Step {index + 1} of {totalSteps}
        </div>
        <h2 className="mb-2 text-base font-semibold text-foreground">{step.title}</h2>
        <div className="mb-4 text-sm text-muted-foreground">{body}</div>

        {hasAdvanceOn && (
          <div className="mb-3 text-xs font-medium text-primary animate-pulse">
            Complete the action above to advance, or press Next.
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
            >
              Skip tour
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              disabled={isFirst}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrimary}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
};
