"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

const shortcuts = [
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["n"], description: "Create new task" },
  { keys: ["Esc"], description: "Close panels / dialogs" },
  { keys: ["Cmd", "K"], description: "Command palette (coming soon)" },
];

export function HelpModal({ open, onClose, onStartTour }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" maxWidth="sm:max-w-sm">
      <div className="space-y-3">
        {shortcuts.map((s) => (
          <div key={s.description} className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">{s.description}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="px-2 py-1 rounded-md bg-surface-tertiary text-text-primary text-xs font-mono border border-border">
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      {onStartTour && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              onClose();
              onStartTour();
            }}
          >
            Take the tour
          </Button>
        </div>
      )}
    </Modal>
  );
}
