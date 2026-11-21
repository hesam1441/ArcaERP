export type PrintPagePosition = { x: number; y: number };
const storageKey = 'arca_cheque_print_position_v1';
export function normalizePrintPagePosition(value: Partial<PrintPagePosition> | null | undefined): PrintPagePosition {
  const normalize = (number: unknown) => typeof number === 'number' && Number.isFinite(number) ? Math.max(-20, Math.min(20, number)) : 0;
  return { x: normalize(value?.x), y: normalize(value?.y) };
}
export function readPrintPagePosition(): PrintPagePosition {
  try { return normalizePrintPagePosition(JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem('arca_print_page_position_v1') || 'null')); }
  catch { return { x: 0, y: 0 }; }
}
export function savePrintPagePosition(value: PrintPagePosition) {
  localStorage.setItem(storageKey, JSON.stringify(normalizePrintPagePosition(value)));
}
