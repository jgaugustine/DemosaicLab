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
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [step]);

  if (!step || !currentStepId) return null;
  if (typeof document === "undefined") return null;

  const totalSteps = steps.length;
  const index = steps.findIndex((s) => s.id === step.id);
  const isFirst = index <= 0;
  const isLast = index === totalSteps - 1;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let cardTop = viewportHeight / 2;
  let cardLeft = viewportWidth / 2;
  let useCenteredLayout = !targetRect || step.target === "center-overlay";

  if (targetRect && !useCenteredLayout) {
    const spacing = 16;
    const estimatedCardHeight = 200;
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
    <div
      className="pointer-events-none fixed inset-0 z-40"
      role="dialog"
      aria-modal="false"
      aria-label={step.title}
    >
      {targetRect && !useCenteredLayout && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary/80 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      <div
        className="pointer-events-auto absolute max-w-sm rounded-lg border border-border bg-popover/95 p-4 shadow-lg backdrop-blur-sm"
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
    </div>
  );

  return createPortal(content, document.body);
};
