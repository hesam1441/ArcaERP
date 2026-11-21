export const withDummyProformaSuffix = (proformaNumber: string | undefined, isDummy: boolean) => {
  const currentNumber = proformaNumber || "";

  if (isDummy) {
    return /D$/i.test(currentNumber) ? currentNumber : `${currentNumber}D`;
  }

  return currentNumber.replace(/D$/i, "");
};

// Resolve the issuing company before legacy case defaults.
export const supplierProformaPrefix = (supplier?: { SupplierName?: string; ProformaPrefix?: string }) => {
  const name = (supplier?.SupplierName || "").toLowerCase().replace(/[\s._\-‌]+/g, "");
  if (/berakem|براکم|براکیم/.test(name)) return "BR";
  if (/arovin|آروین|اروین/.test(name)) return "AR";
  if (/bullschem|بولزکم|بولسکم/.test(name)) return "BPI";
  if (/arcatav|arcatav|آرکاتاو|ارکاتاو/.test(name)) return "ARC";
  return supplier?.ProformaPrefix?.trim().toUpperCase() || "";
};

/** Shared sequence for the operational editor and the compact order-entry form. */
export function nextProformaNumber(code: string, date: string, isDummy: boolean, orders: { ProformaInvoiceID: string }[]) {
  const compactDate = date.replace(/-/g, "").slice(2);
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`^${escaped}-${compactDate}-(\\d{2,})(?:D)?$`, "i");
  const serial = orders.reduce((max, order) => {
    const match = order.ProformaInvoiceID?.trim().match(expression);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `${code}-${compactDate}-${String(serial).padStart(2, "0")}${isDummy ? "D" : ""}`;
}
