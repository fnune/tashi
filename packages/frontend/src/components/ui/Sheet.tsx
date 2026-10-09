import { type ReactNode, useEffect, useRef, useState } from "react";
import "./Sheet.css";

const DISMISS_DISTANCE_PX = 80;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;
const TAP_SLOP_PX = 4;

function useDragToDismiss(onDismiss: () => void) {
  const start = useRef<{ y: number; time: number } | null>(null);
  const [offset, setOffset] = useState(0);

  return {
    offset,
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        start.current = { y: e.clientY, time: e.timeStamp };
      },
      onPointerMove(e: React.PointerEvent) {
        if (!start.current) return;
        const distance = e.clientY - start.current.y;
        // Capturing on pointerdown would retarget a plain tap away from the close button.
        if (distance > TAP_SLOP_PX) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setOffset(Math.max(0, distance));
      },
      onPointerUp(e: React.PointerEvent) {
        if (!start.current) return;
        const distance = e.clientY - start.current.y;
        const velocity = distance / (e.timeStamp - start.current.time || 1);
        start.current = null;
        setOffset(0);
        if (
          distance > DISMISS_DISTANCE_PX ||
          velocity > DISMISS_VELOCITY_PX_PER_MS
        ) {
          onDismiss();
        }
      },
      onPointerCancel() {
        start.current = null;
        setOffset(0);
      },
    },
  };
}

// A modal dialog receives its ::backdrop's clicks too, so only the pointer
// position tells a backdrop click from one on the sheet's own padding.
function isOnBackdrop(e: React.MouseEvent<HTMLDialogElement>): boolean {
  if (e.target !== e.currentTarget) return false;
  const rect = e.currentTarget.getBoundingClientRect();
  return (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  );
}

export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useDragToDismiss(onClose);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes a modal dialog natively.
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={title}
      data-dragging={drag.offset > 0 ? "" : undefined}
      style={drag.offset ? { translate: `0 ${drag.offset}px` } : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (isOnBackdrop(e)) onClose();
      }}
    >
      {open && (
        <div className="sheet-body">
          <div className="sheet-header" {...drag.handlers}>
            <button
              type="button"
              className="sheet-grabber"
              aria-label={closeLabel}
              onClick={onClose}
            />
            <h2 className="sheet-title">{title}</h2>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
