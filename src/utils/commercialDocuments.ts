import { Order } from "../types";

/**
 * Commercial documents share the PI serial, while their issuer prefix receives
 * an I suffix: BR-260418-01 becomes BRI-260418-01.
 */
export const defaultCommercialInvoiceNumber = (proformaNumber?: string) => {
  const value = (proformaNumber || "").trim();
  const separator = value.indexOf("-");
  if (!value) return "";
  if (separator < 1) return `${value}I`;
  const issuerCode = value.slice(0, separator);
  return `${issuerCode.endsWith("I") ? issuerCode : `${issuerCode}I`}${value.slice(separator)}`;
};

export const commercialInvoiceNumberFor = (order: Pick<Order, "CommercialInvoiceID" | "ProformaInvoiceID">) =>
  order.CommercialInvoiceID?.trim() || defaultCommercialInvoiceNumber(order.ProformaInvoiceID);

export const packingListNumberFor = (order: Pick<Order, "PackingListID" | "CommercialInvoiceID" | "ProformaInvoiceID">) =>
  order.PackingListID?.trim() || commercialInvoiceNumberFor(order);

// InvoiceDate is the legacy Commercial Invoice date field. A document without
// a dedicated date inherits its PI date, so both commercial documents always
// have a useful initial date.
export const commercialDocumentDateFor = (order: Pick<Order, "CommercialInvoiceDate" | "InvoiceDate" | "PIDate">) =>
  order.CommercialInvoiceDate || order.InvoiceDate || order.PIDate || "";

// Packing List follows the Invoice date until its own date is explicitly set.
export const packingListDateFor = (order: Pick<Order, "PackingListDate" | "CommercialInvoiceDate" | "InvoiceDate" | "PIDate">) =>
  order.PackingListDate || commercialDocumentDateFor(order);

// Date Of Issue follows the corresponding document date unless the user sets
// a dedicated issue date for that document.
export const commercialIssueDateFor = (order: Pick<Order, "CommercialInvoiceIssueDate" | "CommercialInvoiceDate" | "InvoiceDate" | "PIDate">) =>
  order.CommercialInvoiceIssueDate || commercialDocumentDateFor(order);

export const packingListIssueDateFor = (order: Pick<Order, "PackingListIssueDate" | "PackingListDate" | "CommercialInvoiceDate" | "InvoiceDate" | "PIDate">) =>
  order.PackingListIssueDate || packingListDateFor(order);
