import React, { type CSSProperties } from 'react';
import { detectInputDirection, type InputDirection } from '../utils/inputDirection';

/** Isolate a data value from the surrounding UI without changing stored text. */
export function BidiText({ children, direction, className, style }: {
  children: string;
  direction?: InputDirection;
  className?: string;
  style?: CSSProperties;
}) {
  return <bdi dir={direction || detectInputDirection(children)} className={className}
    style={{ textAlign: 'start', ...style, unicodeBidi: 'isolate' }}>{children}</bdi>;
}
