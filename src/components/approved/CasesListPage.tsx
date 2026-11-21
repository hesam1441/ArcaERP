import { matchesApprovedCase } from '../../utils/approvedDesign';
import React, { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import {
  Calculator,
  FileText,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type {
  CasesListFilterState,
  CommercialCase,
  DataViewState,
} from './types';
import { LtrToken, MixedText, MoneyValue } from './common/BidiText';
import { HelpPopover } from './common/HelpPopover';
import { EmptyState, ErrorBanner, TableSkeleton } from './common/UiStates';

interface CasesListPageProps {
  canOpenAccounting?:boolean;
  searchValue?: string;
  cases: CommercialCase[];
  filters: CasesListFilterState;
  onFiltersChange: (next: CasesListFilterState) => void;
  onOpenSummary: (caseId: string) => void;
  onOpenAccounting: (caseId: string) => void;
  onToggleActive: (caseId: string, nextIsActive: boolean) => void;
  viewState?: DataViewState;
  errorMessage?: string;
  onRetry?: () => void;
}

const OWNERSHIP_LABEL: Record<CommercialCase['ownership'], string> = {
  customer: 'متعلق به مشتری',
  own_account: 'به حساب خودم',
};

const WORKFLOW_LABEL: Record<CommercialCase['status'], string> = {
  open: 'باز',
  in_transit: 'در حال حمل',
  customs: 'ترخیص / گمرک',
  settling: 'در حال تسویه',
  closed: 'مختومه',
};

export const CasesListPage: React.FC<CasesListPageProps> = ({
  cases, canOpenAccounting=true,
  searchValue,
  filters,
  onFiltersChange,
  onOpenSummary,
  onOpenAccounting,
  onToggleActive,
  viewState = 'ready',
  errorMessage = 'بارگذاری فهرست پرونده‌ها با خطا مواجه شد.',
  onRetry,
}) => {
  const search=useDeferredValue(filters.searchQuery);
  const page=filters.page||0;
  const setPage=(page:number)=>onFiltersChange({...filters,page});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: '/' or Ctrl/Cmd+K focuses search when not already typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if(!searchInputRef.current||searchInputRef.current.closest('[hidden]'))return;
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if ((e.key === '/' && !isInput) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredCases = useMemo(() => {
    return cases.filter(c=>matchesApprovedCase(c,{...filters,searchQuery:search}));
  }, [cases, search, filters.activeFilter, filters.ownershipFilter]);

  const current=Math.min(page,Math.max(0,Math.ceil(filteredCases.length/40)-1));
  const visibleCases=filteredCases.slice(current*40,(current+1)*40);
  const handleResetFilters = () => {
    onFiltersChange({
      searchQuery: '',
      activeFilter: 'all',
      ownershipFilter: 'all',
      scrollTop: 0,
    });
  };

  const captureScrollAndNavigate = (fn: (id: string) => void, caseId: string) => {
    onFiltersChange({ ...filters, scrollTop: document.querySelector('#app-shell main')?.scrollTop || 0 });
    fn(caseId);
  };

  const hasActiveFilters =
    filters.searchQuery.trim() !== '' ||
    filters.activeFilter !== 'all' ||
    filters.ownershipFilter !== 'all';

  return (
    <div data-approved-case-list className="space-y-3">
      {/* Compact Filter & Search Toolbar (Single unified glass bar, no giant header) */}
      <section
        aria-label="جستجو و فیلتر پرونده‌ها"
        className="arca-panel p-2.5 sm:p-3 flex flex-col lg:flex-row lg:items-center gap-2.5"
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search
            className="w-4 h-4 text-[var(--arca-text-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            dir="auto"
            value={searchValue ?? filters.searchQuery}
            onChange={(e) =>
              onFiltersChange({ ...filters, searchQuery: e.target.value })
            }
            placeholder="جستجوی شماره پرونده، مشتری، کالا (مثل EHA-2) یا فروشنده..."
            className="arca-control arca-control-touch arca-touch-input w-full pr-9 pl-9 py-1.5 text-xs sm:text-[13px] rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] placeholder:text-[var(--arca-text-muted)] focus:outline-none focus:border-[var(--arca-purple)] transition-colors"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, searchQuery: '' })}
              aria-label="پاک کردن جستجو"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-2 rounded text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Segmented Filters (Full-width clean 3-col grid on mobile, inline on sm+) */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 shrink-0">
          {/* Active / Inactive / All */}
          <div
            role="group"
            aria-label="فیلتر وضعیت فعال"
            className="grid grid-cols-3 sm:inline-flex items-center p-0.5 rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] w-full sm:w-auto"
          >
            {(
              [
                { id: 'all', label: 'همه' },
                { id: 'active', label: 'فعال' },
                { id: 'inactive', label: 'غیرفعال' },
              ] as const
            ).map((opt) => {
              const active = filters.activeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  aria-pressed={active}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ ...filters, activeFilter: opt.id })
                  }
                  className={`arca-control arca-control-touch px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
                    active
                      ? 'bg-[var(--arca-surface-solid)] text-[var(--arca-text-primary)] shadow-xs border border-[var(--arca-border)]'
                      : 'text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Ownership Filter: All / Customer / Own Account */}
          <div
            role="group"
            aria-label="فیلتر مالکیت پرونده"
            className="grid grid-cols-3 sm:inline-flex items-center p-0.5 rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] w-full sm:w-auto"
          >
            {(
              [
                { id: 'all', label: 'همه مالکیت‌ها' },
                { id: 'customer', label: 'مشتری' },
                { id: 'own_account', label: 'حساب خودم' },
              ] as const
            ).map((opt) => {
              const active = filters.ownershipFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  aria-pressed={active}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ ...filters, ownershipFilter: opt.id })
                  }
                  className={`arca-control arca-control-touch px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center truncate ${
                    active
                      ? 'bg-[var(--arca-purple)] text-white shadow-xs'
                      : 'text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="بازنشانی فیلترها"
                className="arca-control arca-control-touch inline-flex items-center gap-1 px-3 py-1 text-xs text-[var(--arca-text-muted)] hover:text-[var(--arca-text-primary)] rounded-lg border border-[var(--arca-border)] hover:bg-[var(--arca-surface-hover)] whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>پاک‌سازی</span>
              </button>
            )}

            <HelpPopover
              title="راهنمای فهرست پرونده‌ها"
              items={[
                {
                  title: 'جستجوی سریع',
                  description:
                    'با کلید / یا Ctrl+K روی فیلد جستجو بروید. می‌توانید بر اساس شماره پرونده، نام شرکت، کد یا نام کالا (مانند EHA-2 یا رزین) و فروشنده جستجو کنید.',
                },
                {
                  title: 'تاگل فعال / غیرفعال',
                  description:
                    'تغییر وضعیت فعال بودن هر پرونده مستقیماً از همین ردیف انجام می‌شود و وارد صفحه خلاصه نمی‌شود.',
                },
                {
                  title: 'حفظ فیلتر و اسکرول',
                  description:
                    'پس از باز کردن خلاصه یا حسابداری پرونده و بازگشت، فیلترها و موقعیت اسکرول شما دقیقاً حفظ می‌شوند.',
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Subtle inline count line (unboxed metadata) */}
      <div className="flex items-center justify-between px-1 text-xs text-[var(--arca-text-muted)]">
        <div className="flex items-center gap-2">
          <span className="arca-num font-medium text-[var(--arca-text-secondary)]">
            {filteredCases.length} پرونده
          </span>
          <span aria-hidden="true">·</span>
          <span>از مجموع {cases.length} پرونده ثبت‌شده</span>
        </div>
        <span className="hidden lg:inline">
          برای مشاهده خلاصه روی ردیف یا شماره پرونده کلیک کنید
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--arca-text-muted)]"><button type="button" disabled={current===0} onClick={()=>setPage(current-1)} className="arca-control px-3 rounded border disabled:opacity-40">قبلی</button><span>{current+1} از {Math.max(1,Math.ceil(filteredCases.length/40))}</span><button type="button" disabled={(current+1)*40>=filteredCases.length} onClick={()=>setPage(current+1)} className="arca-control px-3 rounded border disabled:opacity-40">بعدی</button></div>
      {/* State Handling: Error / Loading / Empty / Data */}
      {viewState === 'error' && (
        <ErrorBanner message={errorMessage} onRetry={onRetry} />
      )}

      {viewState === 'loading' ? (
        <TableSkeleton rows={5} />
      ) : filteredCases.length === 0 ? (
        <EmptyState
          title="پرونده‌ای با این مشخصات یافت نشد"
          description="عبارت جستجو یا فیلترهای فعال/مالکیت را تغییر دهید تا پرونده‌های مرتبط نمایش داده شوند."
          actionLabel={hasActiveFilters ? 'نمایش همه پرونده‌ها' : undefined}
          onAction={hasActiveFilters ? handleResetFilters : undefined}
        />
      ) : (
        <>
          {/* Desktop High-Density Table (lg and above) */}
          <div data-desktop-case-table className="hidden lg:block arca-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] text-[11px] font-semibold text-[var(--arca-text-muted)]">
                    <th className="py-2.5 px-3 whitespace-nowrap">شماره پرونده</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">تاریخ</th>
                    <th className="py-2.5 px-3 min-w-[200px]">مشتری و مالکیت</th>
                    <th className="py-2.5 px-3 min-w-[220px]">کالاهای سفارش</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">فروشنده</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">مبلغ و ارز</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">فعال</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">دسترسی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--arca-border)] text-[13px]">
                  {visibleCases.map((item) => {
                    const goodsPreview = item.items
                      .map((it) => it.productName)
                      .join(' · ');

                    return (
                      <tr
                        key={item.id}
                        onClick={() => captureScrollAndNavigate(onOpenSummary, item.id)}
                        className={`group cursor-pointer transition-colors hover:bg-[var(--arca-surface-hover)] ${
                          !item.isActive ? 'opacity-65' : ''
                        }`}
                      >
                        {/* Case Number (never breaks awkwardly) */}
                        <td className="py-2.5 px-3 whitespace-nowrap align-top">
                          <div className="font-semibold text-[var(--arca-navy)] group-hover:text-[var(--arca-purple)] transition-colors">
                            <button type="button" onClick={e=>{e.stopPropagation();captureScrollAndNavigate(onOpenSummary,item.id);}}><LtrToken mono>{item.caseNumber}</LtrToken></button>
                          </div>
                          <div className="text-[11px] text-[var(--arca-text-muted)] mt-0.5">
                            {WORKFLOW_LABEL[item.status]}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-2.5 px-3 whitespace-nowrap align-top text-xs text-[var(--arca-text-secondary)]">
                          <LtrToken>{item.date}</LtrToken>
                        </td>

                        {/* Customer (generous space for long company names, unboxed ownership metadata) */}
                        <td className="py-2.5 px-3 align-top max-w-[280px]">
                          <div
                            className="font-medium text-[var(--arca-text-primary)] leading-snug line-clamp-2"
                            title={item.customerName}
                          >
                            <MixedText text={item.customerName} />
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--arca-text-muted)]">
                            <span data-case-ownership={item.ownership==='own_account'?item.id:undefined}
                              className={
                                item.ownership === 'own_account'
                                  ? 'text-[var(--arca-teal)] font-medium'
                                  : ''
                              }
                            >
                              {item.ownership === 'own_account'
                                ? `◆ ${OWNERSHIP_LABEL[item.ownership]} · ${item.economicOwner}`
                                : OWNERSHIP_LABEL[item.ownership]}
                            </span>
                            {item.items.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="arca-num">{item.items.length} قلم کالا</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Order Goods (Mixed RTL/LTR safe) */}
                        <td data-case-products={item.id} className="py-2.5 px-3 align-top max-w-[300px]">
                          <div
                            className="text-xs text-[var(--arca-text-secondary)] leading-relaxed line-clamp-2"
                            title={goodsPreview}
                          >
                            {item.items.map((product,index)=><React.Fragment key={product.id}>{index>0&&' · '}<MixedText text={product.productName}/></React.Fragment>)}
                          </div>
                        </td>

                        {/* Seller Short Name */}
                        <td className="py-2.5 px-3 whitespace-nowrap align-top text-xs text-[var(--arca-text-secondary)]">
                          <MixedText text={item.sellerShortName} />
                        </td>

                        {/* Amount & Currency (never breaks number/currency) */}
                        <td className="py-2.5 px-3 whitespace-nowrap align-top text-left font-semibold text-[var(--arca-text-primary)]">
                          <MoneyValue
                            amount={item.totalAmount}
                            currency={item.currency}
                          />
                        </td>

                        {/* Active / Inactive Toggle */}
                        <td
                          className="py-2.5 px-3 whitespace-nowrap align-top text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            data-case-activity-switch role="switch"
                            aria-checked={item.isActive}
                            aria-label={`تغییر وضعیت فعال بودن پرونده ${item.caseNumber}`}
                            onClick={() => onToggleActive(item.id, !item.isActive)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-purple)] ${
                              item.isActive
                                ? 'bg-[var(--arca-teal)]'
                                : 'bg-slate-400/50 dark:bg-slate-600'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                                item.isActive ? '-translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Quick Actions */}
                        <td
                          className="py-2.5 px-3 whitespace-nowrap align-top text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => captureScrollAndNavigate(onOpenSummary, item.id)}
                              title="خلاصه پرونده"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-[var(--arca-text-secondary)] hover:text-[var(--arca-text-primary)] hover:bg-[var(--arca-surface-subtle)] border border-transparent hover:border-[var(--arca-border)] transition-colors whitespace-nowrap"
                            >
                              <FileText className="w-3.5 h-3.5 text-[var(--arca-purple)]" />
                              <span>خلاصه</span>
                            </button>
                            {canOpenAccounting&&(<button
                              type="button"
                              onClick={() => captureScrollAndNavigate(onOpenAccounting, item.id)}
                              title="حسابداری پرونده"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-[var(--arca-text-secondary)] hover:text-[var(--arca-text-primary)] hover:bg-[var(--arca-surface-subtle)] border border-transparent hover:border-[var(--arca-border)] transition-colors whitespace-nowrap"
                            >
                              <Calculator className="w-3.5 h-3.5 text-[var(--arca-teal)]" />
                              <span>حسابداری</span>
                            </button>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile (1-col) & Tablet (2-col) Compact Cards */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleCases.map((item) => {
              const goodsPreview = item.items.map((it) => it.productName).join(' · ');

              return (
                <article
                  key={item.id}
                  className={`arca-panel p-3.5 flex flex-col justify-between gap-2.5 ${
                    !item.isActive ? 'opacity-70' : ''
                  }`}
                >
                  <div className="space-y-2">
                    {/* Row 1: Case Number + Date + Toggle */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => captureScrollAndNavigate(onOpenSummary, item.id)}
                        className="flex items-center gap-2 text-right min-h-[40px] flex-1 min-w-0"
                      >
                        <span className="text-sm font-semibold text-[var(--arca-navy)]">
                          <LtrToken mono>{item.caseNumber}</LtrToken>
                        </span>
                        <span className="text-xs text-[var(--arca-text-muted)]">
                          <LtrToken>{item.date}</LtrToken>
                        </span>
                      </button>

                      {/* Generous touch area wrapper around toggle */}
                      <button
                        type="button"
                        data-case-activity-switch role="switch"
                        aria-checked={item.isActive}
                        aria-label={`فعال/غیرفعال ${item.caseNumber}`}
                        onClick={() => onToggleActive(item.id, !item.isActive)}
                        className="min-h-[44px] inline-flex items-center gap-2 pr-2 shrink-0"
                      >
                        <span className="text-[11px] text-[var(--arca-text-muted)]">
                          {item.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                            item.isActive
                              ? 'bg-[var(--arca-teal)]'
                              : 'bg-slate-400/50 dark:bg-slate-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                              item.isActive ? '-translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </span>
                      </button>
                    </div>

                    {/* Row 2: Customer + Ownership + Goods */}
                    <div
                      onClick={() => captureScrollAndNavigate(onOpenSummary, item.id)}
                      className="space-y-1 cursor-pointer"
                    >
                      <div className="text-[13px] font-medium text-[var(--arca-text-primary)] leading-snug line-clamp-2">
                        <MixedText text={item.customerName} />
                      </div>
                      <div data-case-products={item.id} className="text-xs text-[var(--arca-text-secondary)] leading-relaxed line-clamp-2">
                        {item.items.map((product,index)=><React.Fragment key={product.id}>{index>0&&' · '}<MixedText text={product.productName}/></React.Fragment>)}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Seller + Ownership + Amount + Touch Action Buttons */}
                  <div className="space-y-2.5 pt-2 border-t border-[var(--arca-border)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--arca-text-muted)] min-w-0">
                        <span className="truncate max-w-[130px]">
                          <MixedText text={item.sellerShortName} />
                        </span>
                        <span aria-hidden="true">·</span>
                        <span data-case-ownership={item.ownership==='own_account'?item.id:undefined}
                          className={`whitespace-nowrap ${
                            item.ownership === 'own_account'
                              ? 'text-[var(--arca-teal)] font-medium'
                              : ''
                          }`}
                        >
                          {item.ownership==='own_account'?`◆ ${OWNERSHIP_LABEL[item.ownership]} · ${item.economicOwner}`:OWNERSHIP_LABEL[item.ownership]}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-[var(--arca-text-primary)]">
                        <MoneyValue amount={item.totalAmount} currency={item.currency} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => captureScrollAndNavigate(onOpenSummary, item.id)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] active:bg-[var(--arca-surface-hover)] text-[var(--arca-text-primary)]"
                      >
                        <FileText className="w-4 h-4 text-[var(--arca-purple)]" />
                        <span>خلاصه پرونده</span>
                      </button>
                      {canOpenAccounting&&(<button
                        type="button"
                        onClick={() => captureScrollAndNavigate(onOpenAccounting, item.id)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-subtle)] active:bg-[var(--arca-surface-hover)] text-[var(--arca-text-primary)]"
                      >
                        <Calculator className="w-4 h-4 text-[var(--arca-teal)]" />
                        <span>حسابداری</span>
                      </button>)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
