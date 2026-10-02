import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";

export function Modal({
  open,
  title,
  onClose,
  children,
  id,
  className = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (dialog.showModal) dialog.showModal();
    else {
      dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>("button, input, select, textarea, a[href]")?.focus();
    }
    return () => {
      if (dialog.open) {
        if (dialog.close) dialog.close();
        else dialog.removeAttribute("open");
      }
      trigger?.focus();
    };
  }, [open]);

  return (
    <dialog
      id={id}
      ref={ref}
      className={`site-modal ${className}`.trim()}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}>
          <Icon icon={X} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
