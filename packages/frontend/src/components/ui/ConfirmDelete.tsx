import { Button } from "./Button.js";
import "./ConfirmDelete.css";

export function ConfirmDelete({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-delete" role="alertdialog" aria-label={message}>
      <p>{message}</p>
      <div className="confirm-delete-buttons">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
