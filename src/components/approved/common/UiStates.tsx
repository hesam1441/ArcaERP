import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, FolderSearch, RefreshCw, X } from 'lucide-react';

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="arca-panel overflow-hidden" aria-busy="true" aria-label="در حال بارگذاری">
      <div className="divide-y divide-[var(--arca-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 animate-pulse">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-4 w-28 rounded bg-[var(--arca-surface-hover)] shrink-0" />
              <div className="h-4 w-20 rounded bg-[var(--arca-surface-hover)] hidden sm:block shrink-0" />
              <div className="h-4 w-44 rounded bg-[var(--arca-surface-hover)] flex-1 max-w-xs" />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="h-4 w-24 rounded bg-[var(--arca-surface-hover)]" />
              <div className="h-6 w-11 rounded-full bg-[var(--arca-surface-hover)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="arca-panel p-8 text-center flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[var(--arca-navy-soft)] text-[var(--arca-navy)] flex items-center justify-center">
        <FolderSearch className="w-5 h-5" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-sm font-semibold text-[var(--arca-text-primary)]">{title}</h3>
        <p className="text-xs text-[var(--arca-text-muted)] leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="arca-control arca-control-touch mt-1 px-4 py-2 text-xs font-medium rounded-lg bg-[var(--arca-purple)] text-white hover:bg-[var(--arca-purple-hover)] transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const ErrorBanner: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--arca-rose)]/30 bg-[var(--arca-rose-soft)] text-[var(--arca-text-primary)]"
    >
      <div className="flex items-center gap-2.5 text-xs">
        <AlertTriangle className="w-4 h-4 text-[var(--arca-rose)] shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="arca-control inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--arca-surface-solid)] border border-[var(--arca-border-strong)] hover:bg-[var(--arca-surface-hover)] transition-colors whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تلاش مجدد</span>
        </button>
      )}
    </div>
  );
};

export const UnsavedConfirmDialog: React.FC<{
  open: boolean;
  onDiscard: () => void;
  onSaveAndLeave: () => void;
  onStay: () => void;
}> = ({ open, onDiscard, onSaveAndLeave, onStay }) => {
  const dialog=useRef<HTMLDivElement>(null);
  const stay=useRef(onStay);stay.current=onStay;
  useEffect(() => {
    if(!open)return;
    const before=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();stay.current();}
      if(event.key==='Tab'){
        const controls=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',onKey,true);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',onKey,true);if(before?.isConnected)before.focus();};
  },[open]);
  if (!open) return null;

  return createPortal(
    <div ref={dialog} dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--arca-border-strong)] bg-[var(--arca-surface-solid)] p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--arca-amber-soft)] text-[var(--arca-amber)] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 id="unsaved-dialog-title" className="text-sm font-semibold text-[var(--arca-text-primary)]">
                تغییرات ذخیره‌نشده وجود دارد
              </h3>
              <p className="text-xs text-[var(--arca-text-muted)] mt-0.5">
                پیش از بازگشت، تغییرات خود را ذخیره یا لغو کنید.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStay}
            aria-label="بستن"
            className="p-1.5 rounded-lg text-[var(--arca-text-muted)] hover:bg-[var(--arca-surface-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--arca-border)]">
          <button
            type="button"
            onClick={onStay}
            className="arca-control arca-control-touch px-3.5 py-2 text-xs font-medium rounded-lg border border-[var(--arca-border-strong)] text-[var(--arca-text-secondary)] hover:bg-[var(--arca-surface-hover)] whitespace-nowrap"
          >
            ادامه ویرایش
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="arca-control arca-control-touch px-3.5 py-2 text-xs font-medium rounded-lg text-[var(--arca-rose)] bg-[var(--arca-rose-soft)] hover:opacity-90 whitespace-nowrap"
          >
            خروج بدون ذخیره
          </button>
          <button
            type="button"
            onClick={onSaveAndLeave}
            className="arca-control arca-control-touch px-4 py-2 text-xs font-medium rounded-lg bg-[var(--arca-purple)] text-white hover:bg-[var(--arca-purple-hover)] whitespace-nowrap"
          >
            ذخیره و بازگشت
          </button>
        </div>
      </div>
    </div>
  , document.body);
};

export interface ToastNotice {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export const FeedbackToast: React.FC<{
  notice: ToastNotice | null;
  onDismiss: () => void;
}> = ({ notice, onDismiss }) => {
  if (!notice) return null;

  const toneClass =
    notice.type === 'success'
      ? 'border-[var(--arca-teal)]/40 text-[var(--arca-teal)]'
      : notice.type === 'error'
      ? 'border-[var(--arca-rose)]/40 text-[var(--arca-rose)]'
      : 'border-[var(--arca-purple)]/40 text-[var(--arca-purple)]';

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm">
      <div
        role="status"
        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--arca-surface-solid)] border shadow-lg ${toneClass}`}
      >
        {notice.type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <span className="text-xs font-medium text-[var(--arca-text-primary)]">{notice.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="بستن اعلان"
          className="p-1 rounded text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
