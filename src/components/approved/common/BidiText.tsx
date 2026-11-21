import { detectInputDirection } from '../../../utils/inputDirection';
import React from 'react';
import type { CurrencyCode } from '../types';

/**
 * Non-mutating BiDi text renderer.
 * Never injects hidden Unicode characters into underlying data.
 * Isolates LTR technical tokens (Latin + digits + '-' + '/' + '.') inside RTL prose.
 */
const LTR_RUN_REGEX =
  /([A-Za-z0-9]+(?:[\s./-]+[A-Za-z0-9%]+)*(?:\s*\([A-Za-z0-9][A-Za-z0-9\s./-]*\))?)/g;

export const MixedText: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className = '' }) => {
  return <bdi dir={detectInputDirection(text)} className={className} style={{unicodeBidi:'isolate'}}>{text}</bdi>;
};

export const LtrToken: React.FC<{
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}> = ({ children, mono = false, className = '' }) => {
  return (
    <span
      dir="ltr"
      className={`bidi-ltr inline-block whitespace-nowrap ${
        mono ? 'arca-mono' : 'arca-num'
      } ${className}`}
    >
      {children}
    </span>
  );
};

export function formatAmountNumber(amount: number, decimals?: number): string {
  const hasFraction = Math.abs(amount % 1) > 0.001;
  const fractionDigits = decimals !== undefined ? decimals : hasFraction ? 2 : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export const MoneyValue: React.FC<{
  amount: number;
  currency?: CurrencyCode | string;
  showCurrency?: boolean;
  decimals?: number;
  className?: string;
  currencyClassName?: string;
}> = ({
  amount,
  currency = 'USD',
  showCurrency = true,
  decimals,
  className = '',
  currencyClassName = 'text-[0.82em] opacity-75 font-normal',
}) => {
  const formatted = formatAmountNumber(amount, decimals);
  const currencyLabel = currency === 'IRR' ? 'ریال' : currency;

  if (currency === 'IRR' && showCurrency) {
    return (
      <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}>
        <span dir="ltr" className="bidi-ltr arca-num font-medium">
          {formatted}
        </span>
        <span className={currencyClassName}>ریال</span>
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      className={`bidi-ltr inline-flex items-baseline gap-1 whitespace-nowrap arca-num ${className}`}
    >
      <span>{formatted}</span>
      {showCurrency && currencyLabel && (
        <span className={currencyClassName}>{currencyLabel}</span>
      )}
    </span>
  );
};
