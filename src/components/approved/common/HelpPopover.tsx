import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface HelpSectionItem {
  title: string;
  description: string;
}

interface HelpPopoverProps {
  title: string;
  items: HelpSectionItem[];
  buttonLabel?: string;
}

/**
 * Educational explanations live strictly inside this on-demand Help button
 * and only open when explicitly triggered by the user.
 */
export const HelpPopover: React.FC<HelpPopoverProps> = ({
  title,
  items,
  buttonLabel = 'راهنما',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef=useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)&&!popoverRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={title}
        className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-secondary)] hover:text-[var(--arca-text-primary)] hover:border-[var(--arca-border-strong)] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-purple)]"
      >
        <HelpCircle className="w-3.5 h-3.5 text-[var(--arca-purple)]" aria-hidden="true" />
        <span>{buttonLabel}</span>
      </button>

      {open && createPortal(
        <div ref={popoverRef} dir="rtl"
          role="dialog"
          aria-label={title}
          className="fixed inset-x-4 top-16 z-[90] mx-auto max-w-sm max-h-[80dvh] overflow-y-auto p-4 rounded-xl border border-[var(--arca-border-strong)] bg-[var(--arca-surface-solid)] shadow-xl text-right"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[var(--arca-border)]">
            <h4 className="text-sm font-semibold text-[var(--arca-text-primary)]">
              {title}
            </h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="بستن راهنما"
              className="p-1.5 rounded-lg text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)] hover:bg-[var(--arca-surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-3">
            {items.map((item, idx) => (
              <li key={idx} className="text-xs leading-relaxed">
                <div className="font-semibold text-[var(--arca-text-primary)] mb-0.5">
                  {item.title}
                </div>
                <p className="text-[var(--arca-text-secondary)]">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ,document.body)}
    </div>
  );
};
