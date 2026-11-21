import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowRight,
  Calculator,
  Check,
  RotateCcw,
  Save,
  Ship,
} from 'lucide-react';
import type { CommercialCase } from './types';
import { LtrToken, MixedText, MoneyValue } from './common/BidiText';
import { HelpPopover } from './common/HelpPopover';
import { UnsavedConfirmDialog } from './common/UiStates';

interface CaseSummaryDraft {
  departureDate: string;
  arrivalDate: string;
  nextAction: string;
  notes: string;
}

interface CaseSummaryPageProps {
  showAccounting?: boolean;
  caseData: CommercialCase;
  onSaveSummary: (caseId: string, patch: CaseSummaryDraft) => void;
  onBackToList?: () => void;
  onDirty?: (dirty:boolean)=>void;
  onEdit?: ()=>void;
  onOpenAccounting: (caseId: string) => void;
  onOpenShipping?: (caseId: string) => void;
  onToggleActive?: (caseId: string, nextIsActive: boolean) => void;
}

const STATUS_LABELS: Record<CommercialCase['status'], string> = {
  open: 'باز',
  in_transit: 'در حال حمل',
  customs: 'در گمرک / ترخیص',
  settling: 'در حال تسویه',
  closed: 'مختومه',
};

export const CaseSummaryPage: React.FC<CaseSummaryPageProps> = ({
  caseData,
  showAccounting = true,
  onSaveSummary,
  onBackToList,
  onOpenAccounting,
  onOpenShipping,
  onToggleActive, onDirty, onEdit,
}) => {
  const [draft, setDraft] = useState<CaseSummaryDraft>({
    departureDate: caseData.departureDate,
    arrivalDate: caseData.arrivalDate,
    nextAction: caseData.nextAction,
    notes: caseData.notes,
  });

  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);
  const [leaveAfterSave,setLeaveAfterSave]=useState(false);
  const routes=useRef({onEdit,onOpenAccounting,onOpenShipping,onBackToList});
  routes.current={onEdit,onOpenAccounting,onOpenShipping,onBackToList};

  const dirtyRef=useRef(false);
  // Sync draft only when switching to a different case ID
  useEffect(() => {
    if(dirtyRef.current)return;
    setDraft({
      departureDate: caseData.departureDate,
      arrivalDate: caseData.arrivalDate,
      nextAction: caseData.nextAction,
        notes: caseData.notes,
    });
  }, [
    caseData.id,
    caseData.departureDate,
    caseData.arrivalDate,
    caseData.nextAction,
    caseData.notes,
  ]);

  const isDirty = useMemo(() => {
    return (
      draft.departureDate !== caseData.departureDate ||
      draft.arrivalDate !== caseData.arrivalDate ||
      draft.nextAction !== caseData.nextAction ||
      draft.notes !== caseData.notes
    );
  }, [draft, caseData]);

  dirtyRef.current=isDirty;
  useEffect(()=>{onDirty?.(isDirty);},[isDirty,onDirty]);
  useEffect(()=>{
    if(isDirty||!leaveAfterSave||!pendingNavAction)return;
    const frame=requestAnimationFrame(()=>{pendingNavAction();setPendingNavAction(null);setLeaveAfterSave(false);});
    return()=>cancelAnimationFrame(frame);
  },[isDirty,leaveAfterSave,pendingNavAction]);
  const handleSave = useCallback(() => {
    onSaveSummary(caseData.id, draft);
  }, [caseData.id, draft, onSaveSummary]);

  const handleReset = useCallback(() => {
    setDraft({
      departureDate: caseData.departureDate,
      arrivalDate: caseData.arrivalDate,
      nextAction: caseData.nextAction,
        notes: caseData.notes,
    });
  }, [caseData]);

  const attemptNavigate = useCallback(
    (action: () => void) => {
      if (isDirty) {
        setPendingNavAction(() => action);
      } else {
        action();
      }
    },
    [isDirty]
  );


  return (
    <div data-approved-case-summary className="space-y-3">
      {/* Compact Action & Context Bar */}
      <div className="arca-panel px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {onBackToList && (          <button
            type="button"
            onClick={() => attemptNavigate(()=>routes.current.onBackToList?.())}
            className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-secondary)] hover:text-[var(--arca-text-primary)] hover:bg-[var(--arca-surface-hover)] transition-colors whitespace-nowrap"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>بازگشت به فهرست</span>
          </button>)}

          <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
            <span className="font-semibold text-[var(--arca-navy)]">
              <LtrToken mono>{caseData.caseNumber}</LtrToken>
            </span>
            <span aria-hidden="true" className="text-[var(--arca-text-muted)]">·</span>
            <span className="text-[var(--arca-text-secondary)] truncate max-w-[200px] sm:max-w-xs">
              <MixedText text={caseData.customerShortName} />
            </span>
            <span aria-hidden="true" className="text-[var(--arca-text-muted)] hidden sm:inline">·</span>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                caseData.isActive ? 'text-[var(--arca-teal)]' : 'text-[var(--arca-text-muted)]'
              }`}
            >
              {caseData.isActive ? 'فعال' : 'غیرفعال'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          {isDirty && (
            <span className="text-xs font-medium text-[var(--arca-amber)] px-2 py-1 rounded-md bg-[var(--arca-amber-soft)] whitespace-nowrap">
              تغییرات ذخیره‌نشده
            </span>
          )}

          {onEdit&&<button type="button" onClick={()=>attemptNavigate(()=>routes.current.onEdit?.())} className="arca-control arca-control-touch rounded-lg border border-[var(--arca-border)] px-3 text-xs">ویرایش مشخصات و کالا</button>}
          {onToggleActive && (
            <button
              type="button"
              disabled={isDirty}
              onClick={() => onToggleActive(caseData.id, !caseData.isActive)}
              className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-secondary)] hover:text-[var(--arca-text-primary)] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <span>{caseData.isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}</span>
            </button>
          )}

          {onOpenShipping && (
            <button
              type="button"
              onClick={() => attemptNavigate(() => routes.current.onOpenShipping?.(caseData.id))}
              className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-primary)] hover:border-[var(--arca-purple)] transition-colors whitespace-nowrap"
            >
              <Ship className="w-3.5 h-3.5 text-[var(--arca-purple)]" />
              <span>مدارک و حمل</span>
            </button>
          )}

          {showAccounting&&(          <button
            type="button"
            onClick={() => attemptNavigate(() => routes.current.onOpenAccounting(caseData.id))}
            className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-primary)] hover:border-[var(--arca-teal)] transition-colors whitespace-nowrap"
          >
            <Calculator className="w-3.5 h-3.5 text-[var(--arca-teal)]" />
            <span>حسابداری پرونده</span>
          </button>)}

          <HelpPopover
            title="راهنمای خلاصه پرونده"
            items={[
              {
                title: 'مشخصات و جدول کالاها',
                description:
                  'اطلاعات کوتاه معامله در بالای ستون اصلی به صورت فشرده چیده شده‌اند تا فضای بیشتری به نام کامل شرکت و جدول اقلام سفارش اختصاص یابد.',
              },
              {
                title: 'ویرایش پیگیری و تاریخ‌ها',
                description:
                  'فیلدهای تاریخ خروج، تاریخ ورود، اقدام بعدی و یادداشت در ستون کناری قابل ویرایش هستند. کلید Ctrl+S تغییرات را ذخیره می‌کند.',
              },
            ]}
          />
        </div>
      </div>

      {/* Main 2-Column Workspace (Specs & Items + Follow-up & Notes) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Column 1 (Desktop 8 cols): Deal Specifications + Order Items Table */}
        <div className="lg:col-span-8 space-y-3 min-w-0">
          {/* Deal Specs Panel — Short fields grouped side-by-side */}
          <section aria-label="مشخصات معامله" className="arca-panel p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--arca-border)]">
              <h2 className="text-[13px] font-semibold text-[var(--arca-text-primary)]">
                مشخصات معامله
              </h2>
              <span className="text-xs text-[var(--arca-text-muted)]">
                {caseData.ownership === 'own_account' ? 'پرونده به حساب خودم' : 'پرونده متعلق به مشتری'}
                <span aria-hidden="true"> · </span>
                <span className="text-[var(--arca-text-secondary)]">
                  {STATUS_LABELS[caseData.status]}
                </span>
              </span>
            </div>

            {/* Row 1: Long Company Names + Economic Owner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pb-2.5 border-b border-[var(--arca-border)]">
              <div className="min-w-0 lg:col-span-5">
                <div className="text-[11px] text-[var(--arca-text-muted)] mb-0.5">
                  نام کامل مشتری / خریدار
                </div>
                <div className="text-[13px] font-medium text-[var(--arca-text-primary)] leading-snug">
                  <MixedText text={caseData.customerName} />
                </div>
              </div>
              <div className="min-w-0 lg:col-span-4">
                <div className="text-[11px] text-[var(--arca-text-muted)] mb-0.5">
                  فروشنده / تامین‌کننده
                </div>
                <div className="text-[13px] font-medium text-[var(--arca-text-primary)] leading-snug">
                  <MixedText text={caseData.sellerName} />
                </div>
              </div>
              <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                <div className="text-[11px] text-[var(--arca-text-muted)] mb-0.5">
                  مالک اقتصادی پرونده
                </div>
                <div className="text-[13px] font-medium text-[var(--arca-text-primary)] leading-snug">
                  <MixedText text={caseData.economicOwner} />
                </div>
              </div>
            </div>

            {/* Row 2: Compact Side-by-Side Short Fields (Never 1 field per row!) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-3 gap-y-2.5">
              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">تاریخ پرونده</div>
                <div className="text-xs font-medium text-[var(--arca-text-primary)] mt-0.5">
                  <LtrToken>{caseData.date}</LtrToken>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">وزن کل</div>
                <div className="text-xs font-medium text-[var(--arca-text-primary)] mt-0.5">
                  <LtrToken>{caseData.totalWeightMt} MT</LtrToken>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">ارز مبنا</div>
                <div className="text-xs font-medium text-[var(--arca-text-primary)] mt-0.5">
                  <LtrToken>{caseData.currency}</LtrToken>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">نرخ تسعیر پروفورما</div>
                <div className="text-xs font-medium text-[var(--arca-text-primary)] mt-0.5">
                  <LtrToken>{caseData.fxRateToRial.toLocaleString('en-US')}</LtrToken>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">ترم تحویل</div>
                <div className="text-xs font-medium text-[var(--arca-text-primary)] mt-0.5">
                  <LtrToken>{caseData.incoterm}</LtrToken>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--arca-text-muted)]">جمع سفارش</div>
                <div className="text-xs font-semibold text-[var(--arca-teal)] mt-0.5">
                  <MoneyValue amount={caseData.totalAmount} currency={caseData.currency} />
                </div>
              </div>
            </div>

            {/* Route, Agent & Shipping Summary compact line */}
            <div className="pt-2 border-t border-[var(--arca-border)] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--arca-text-secondary)]">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--arca-text-muted)]">مسیر حمل:</span>
                <LtrToken>{caseData.originPort}</LtrToken>
                <span aria-hidden="true">←</span>
                <LtrToken>{caseData.destinationPort}</LtrToken>
              </div>
              {caseData.agentName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--arca-text-muted)]">ایجنت:</span>
                  <MixedText text={caseData.agentName} />
                </div>
              )}
              {caseData.shippingSummary && (
                <div className="flex items-start gap-1.5 min-w-0 max-w-full">
                  <span className="text-[var(--arca-text-muted)] shrink-0">وضعیت مدارک:</span>
                  <span className="min-w-0 break-words leading-snug">
                    <MixedText text={caseData.shippingSummary} />
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Order Items Table (Horizontal scroll contained inside panel) */}
          <section aria-label="جدول کالاهای سفارش" className="arca-panel overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[var(--arca-border)] flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--arca-text-primary)]">
                اقلام و کالاهای سفارش
              </h2>
              <span className="text-xs text-[var(--arca-text-muted)] arca-num">
                {caseData.items.length} ردیف
              </span>
            </div>

            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[11px] font-semibold text-[var(--arca-text-muted)]">
                    <th className="py-2 px-3 whitespace-nowrap">#</th>
                    <th className="py-2 px-3 whitespace-nowrap">کد کالا</th>
                    <th className="py-2 px-3 min-w-[180px]">شرح کالا</th>
                    <th className="py-2 px-3 whitespace-nowrap">بسته‌بندی</th>
                    <th className="py-2 px-3 whitespace-nowrap text-left">مقدار</th>
                    <th className="py-2 px-3 whitespace-nowrap text-left">قیمت واحد</th>
                    <th className="py-2 px-3 whitespace-nowrap text-left">مبلغ کل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--arca-border)] text-xs">
                  {caseData.items.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--arca-surface-hover)] transition-colors"
                    >
                      <td className="py-2.5 px-3 arca-num text-[var(--arca-text-muted)] align-top">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top font-medium text-[var(--arca-navy)]">
                        <LtrToken mono>{row.code}</LtrToken>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="font-medium text-[var(--arca-text-primary)] leading-snug">
                          <MixedText text={row.productName} />
                        </div>
                        {row.note && (
                          <div className="text-[11px] text-[var(--arca-text-muted)] mt-0.5">
                            <MixedText text={row.note} />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top text-[var(--arca-text-secondary)]">
                        <MixedText text={row.packaging} />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top text-left">
                        <LtrToken>
                          {row.quantity} {row.unit}
                        </LtrToken>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top text-left text-[var(--arca-text-secondary)]">
                        <LtrToken>
                          {row.unitPrice.toLocaleString('en-US')} {row.priceUnitLabel}
                        </LtrToken>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top text-left font-semibold text-[var(--arca-text-primary)]">
                        <MoneyValue amount={row.totalAmount} currency={row.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--arca-border-strong)] bg-[var(--arca-surface-subtle)] text-xs font-semibold">
                    <td colSpan={4} className="py-2.5 px-3 text-[var(--arca-text-secondary)]">
                      جمع کل اقلام سفارش
                    </td>
                    <td className="py-2.5 px-3 text-left whitespace-nowrap">
                      <LtrToken>{caseData.totalWeightMt} MT</LtrToken>
                    </td>
                    <td />
                    <td className="py-2.5 px-3 text-left whitespace-nowrap text-[var(--arca-teal)]">
                      <MoneyValue amount={caseData.items.reduce((sum,item)=>sum+item.totalAmount,0)} currency={caseData.items[0]?.currency||caseData.currency} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile Stacked Order Items (Zero horizontal scroll) */}
            <div className="md:hidden divide-y divide-[var(--arca-border)]">
              {caseData.items.map((row, idx) => (
                <div key={row.id} className="p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="arca-num text-[11px] text-[var(--arca-text-muted)]">
                        {idx + 1}.
                      </span>
                      <span className="font-semibold text-[var(--arca-navy)]">
                        <LtrToken mono>{row.code}</LtrToken>
                      </span>
                    </div>
                    <span className="font-semibold text-[var(--arca-text-primary)]">
                      <MoneyValue amount={row.totalAmount} currency={row.currency} />
                    </span>
                  </div>

                  <div className="font-medium text-[var(--arca-text-primary)] leading-snug">
                    <MixedText text={row.productName} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--arca-text-secondary)]">
                    <MixedText text={row.packaging} />
                    <span aria-hidden="true">·</span>
                    <LtrToken>
                      {row.quantity} {row.unit}
                    </LtrToken>
                    <span aria-hidden="true">·</span>
                    <LtrToken>
                      {row.unitPrice.toLocaleString('en-US')} {row.priceUnitLabel}
                    </LtrToken>
                  </div>

                  {row.note && (
                    <div className="text-[11px] text-[var(--arca-text-muted)]">
                      <MixedText text={row.note} />
                    </div>
                  )}
                </div>
              ))}
              <div className="p-3 bg-[var(--arca-surface-subtle)] flex items-center justify-between text-xs font-semibold">
                <span className="text-[var(--arca-text-secondary)]">
                  جمع کل (<LtrToken>{caseData.totalWeightMt} MT</LtrToken>)
                </span>
                <span className="text-[var(--arca-teal)]">
                  <MoneyValue amount={caseData.items.reduce((sum,item)=>sum+item.totalAmount,0)} currency={caseData.items[0]?.currency||caseData.currency} />
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Column 2 (Desktop 4 cols): Editable Dates, Next Action & Notes */}
        <aside aria-label="یادداشت و پیگیری پرونده" className="lg:col-span-4 space-y-3 min-w-0">
          <div className="arca-panel p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--arca-border)]">
              <h2 className="text-[13px] font-semibold text-[var(--arca-text-primary)]">
                برنامه زمان‌بندی و پیگیری
              </h2>
              {!isDirty && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-teal)]">
                  <Check className="w-3 h-3" />
                  <span>ذخیره‌شده</span>
                </span>
              )}
            </div>

            {/* Departure & Arrival Dates Side-by-Side */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="summary-etd"
                  className="block text-[11px] font-medium text-[var(--arca-text-muted)] mb-1"
                >
                  تاریخ خروج (ETD)
                </label>
                <input
                  id="summary-etd"
                  type="text"
                  dir="ltr"
                  data-input-direction="ltr"
                  value={draft.departureDate}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, departureDate: e.target.value }))
                  }
                  placeholder="YYYY-MM-DD"
                  className="arca-control arca-control-touch arca-touch-input arca-num w-full px-2.5 py-1.5 text-xs text-left rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] focus:outline-none focus:border-[var(--arca-purple)]"
                />
              </div>

              <div>
                <label
                  htmlFor="summary-eta"
                  className="block text-[11px] font-medium text-[var(--arca-text-muted)] mb-1"
                >
                  تاریخ ورود (ETA)
                </label>
                <input
                  id="summary-eta"
                  type="text"
                  dir="ltr"
                  data-input-direction="ltr"
                  value={draft.arrivalDate}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, arrivalDate: e.target.value }))
                  }
                  placeholder="YYYY-MM-DD"
                  className="arca-control arca-control-touch arca-touch-input arca-num w-full px-2.5 py-1.5 text-xs text-left rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] focus:outline-none focus:border-[var(--arca-purple)]"
                />
              </div>
            </div>

            {/* Next Action + Due Date */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="summary-next-action"
                  className="text-[11px] font-medium text-[var(--arca-text-muted)]"
                >
                  اقدام بعدی
                </label>

              </div>
              <textarea
                id="summary-next-action"
                dir="auto"
                rows={2}
                value={draft.nextAction}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, nextAction: e.target.value }))
                }
                placeholder="اقدام پیگیری بعدی را بنویسید..."
                className="arca-touch-input w-full px-2.5 py-2 text-xs leading-relaxed rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] focus:outline-none focus:border-[var(--arca-purple)] resize-y"
              />
            </div>

            {/* Case Notes */}
            <div className="space-y-1">
              <label
                htmlFor="summary-notes"
                className="block text-[11px] font-medium text-[var(--arca-text-muted)]"
              >
                یادداشت پرونده
              </label>
              <textarea
                id="summary-notes"
                dir="auto"
                rows={5}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="یادداشت‌ها و جزئیات توافق معامله..."
                className="arca-touch-input w-full px-2.5 py-2 text-xs leading-relaxed rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] focus:outline-none focus:border-[var(--arca-purple)] resize-y"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-[var(--arca-border)] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={!isDirty}
                onClick={handleReset}
                className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] text-[var(--arca-text-secondary)] hover:bg-[var(--arca-surface-hover)] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>انصراف</span>
              </button>

              <button
                type="button"
                disabled={!isDirty}
                onClick={handleSave}
                className="arca-control arca-control-touch inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--arca-purple)] text-white hover:bg-[var(--arca-purple-hover)] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile/Tablet Floating Save Bar (appears ONLY when unsaved changes exist) */}
      {isDirty && (
        <div className="lg:hidden sticky bottom-2 z-20 mx-auto max-w-md arca-panel px-3 py-2 flex items-center justify-between gap-2 shadow-xl border border-[var(--arca-purple)]/40">
          <span className="text-xs font-medium text-[var(--arca-amber)] whitespace-nowrap">
            تغییرات ذخیره‌نشده
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[40px] px-3 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[var(--arca-text-secondary)]"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium rounded-lg bg-[var(--arca-purple)] text-white"
            >
              <Save className="w-3.5 h-3.5" />
              <span>ذخیره</span>
            </button>
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedConfirmDialog
        open={pendingNavAction !== null}
        onStay={() => {setPendingNavAction(null);setLeaveAfterSave(false);}}
        onDiscard={() => {
          const fn = pendingNavAction;
          setLeaveAfterSave(false);
          setPendingNavAction(null);
          handleReset();
          requestAnimationFrame(()=>fn?.());
        }}
        onSaveAndLeave={() => {
          setLeaveAfterSave(true);
          handleSave();
        }}
      />
    </div>
  );
};
