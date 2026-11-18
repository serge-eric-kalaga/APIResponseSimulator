import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import s from "./editor.module.css";

export function EditorTabs<T extends string>({
  tabs,
  value,
  select,
  label,
  compact = false,
}: {
  tabs: readonly { id: T; label: string; icon?: ReactNode }[];
  value: T;
  select: (id: T) => void;
  label: string;
  compact?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      className={compact ? s.switches : s.tabs}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={"tab-" + tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          aria-controls={"panel-" + tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => select(tab.id)}
          onKeyDown={(event) => {
            const positions: Record<string, number> = {
              Home: 0,
              End: tabs.length - 1,
              ArrowRight: (index + 1) % tabs.length,
              ArrowLeft: (index + tabs.length - 1) % tabs.length,
            };
            const next = positions[event.key];
            if (next === undefined) return;
            event.preventDefault();
            select(tabs[next].id);
            refs.current[next]?.focus();
          }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EditorPanel({
  id,
  selected,
  children,
}: {
  id: string;
  selected: string;
  children: ReactNode;
}) {
  return (
    <section
      id={"panel-" + id}
      role="tabpanel"
      aria-labelledby={"tab-" + id}
      hidden={selected !== id}
    >
      {children}
    </section>
  );
}

/** The browser traps focus, handles Escape and restores focus to the opener. */
export function EditorDialog({
  title,
  sheet,
  close,
  children,
}: {
  title: string;
  sheet?: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={sheet ? s.sheet : s.dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className={s.sectionHead}>
        <h2>{title}</h2>
        <button
          type="button"
          className="iconBtn"
          aria-label="Fermer"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
