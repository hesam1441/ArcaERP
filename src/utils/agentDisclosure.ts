import { AppDatabase, Order, Supplier } from "../types";
import { calculateAgentStatement } from "./caseProfitEngine";

export const isAgentDocumentVisible = (file: { agentVisible?: boolean }) => file.agentVisible === true;

/** An allowlist prevents nested prices and future internal fields from leaking. */
export function buildAgentOrderView(order: Order, supplier?: Supplier, db?: AppDatabase) {
  return {
    OrderID: order.OrderID,
    ProformaInvoiceID: order.ProformaInvoiceID,
    PIDate: order.PIDate,
    CustomerName: order.CustomerName,
    items: (order.items || []).map((item) => ({
      ProductID: item.ProductID, ProductName: item.ProductName,
      ProductDescription: item.ProductDescription,
      Quantity: item.Quantity, QuantityUnit: item.QuantityUnit,
    })),
    attachments: (order.attachments || []).filter(isAgentDocumentVisible),
    agentStatement: calculateAgentStatement(order, supplier, db),
  };
}
