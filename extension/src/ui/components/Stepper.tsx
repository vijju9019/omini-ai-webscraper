import React from "react";

export type StepId = "collection" | "fields" | "pagination" | "extract" | "export";

interface StepperProps {
  currentStep: StepId;
  onSelectStep: (step: StepId) => void;
  hasCollection: boolean;
  hasRows: boolean;
}

export const Stepper: React.FC<StepperProps> = ({
  currentStep,
  onSelectStep,
  hasCollection,
  hasRows,
}) => {
  const steps: { id: StepId; label: string; num: string }[] = [
    { id: "collection", label: "Collection", num: "1" },
    { id: "fields", label: "Fields", num: "2" },
    { id: "pagination", label: "Pagination", num: "3" },
    { id: "extract", label: "Extract & Preview", num: "4" },
    { id: "export", label: "Export", num: "5" },
  ];

  return (
    <nav className="stepper-nav">
      {steps.map((step) => {
        const isActive = currentStep === step.id;
        const isDisabled =
          (step.id === "fields" || step.id === "pagination") && !hasCollection;

        return (
          <button
            key={step.id}
            className={`step-tab ${isActive ? "active" : ""}`}
            onClick={() => onSelectStep(step.id)}
            disabled={isDisabled}
          >
            <span className="step-badge">{step.num}</span>
            <span>{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
