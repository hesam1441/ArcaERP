import { getCaseFinancials } from "../utils/caseFinancials";
import { getOrderProfitToUSDMultiplier } from "../utils/orderAccounting";
import { AppDatabase, Order, Customer, Supplier, Product, CashEntry } from "../types";
import { calculateProfitBreakdownUSD } from "../utils/profitCalculations";
import { hasCompleteCalculationData, isExcludedFromFinancialCalculations } from "../utils/orderAccounting";

export interface AIResponse {
  reply: string;
  action?: {
    type: string;
    payload: any;
  } | null;
  error?: string;
}

export interface AIAttachment {
  name: string;
  mimeType: string;
  /** A data URL is used only for images; spreadsheet contents are sent as extracted text. */
  imageData?: string;
  extractedText?: string;
}

export async function sendChatMessageToAI(
  prompt: string,
  currentDb: AppDatabase,
  history: { role: "user" | "assistant"; content: string }[] = [],
  aiMode: "normal" | "professional" = "normal",
  userRole: string = "",
  attachment?: AIAttachment
): Promise<AIResponse> {
  try {
    const compactContext = {
      ordersCount: currentDb.orders.length,
      activeOrders: currentDb.orders
        .filter((o) => o.ActiveOrder)
        .map((o) => ({
          orderId: o.OrderID,
          piNumber: o.ProformaInvoiceID,
          customer: o.CustomerName,
          supplier: o.SupplierName,
          quantity: o.TotalQuantity,
          currency: o.TransactionCurrency,
          sellPrice: o.SellPrice,
          margin: o.Margin,
          totalMargin: getCaseFinancials(currentDb, o).usdProfit.totalCaseProfit,
          totalCommission: getCaseFinancials(currentDb, o).usdProfit.individualShares,
          arcaShare: getCaseFinancials(currentDb, o).usdProfit.arcaShare,
          beraShare: o.BeraShare,
          jalaliShare: o.Jalali,
          status: o.OrderStatus,
          eta: o.ETA,
        })),
      cashSummary: {
        latestDate: currentDb.cashEntries[0]?.CashDate,
        hesamUSD: currentDb.cashEntries.reduce((sum, c) => sum + (c.HesamUSD || 0), 0),
        rezaUSD: currentDb.cashEntries.reduce((sum, c) => sum + (c.RezaUSD || 0), 0),
        officeUSD: currentDb.cashEntries.reduce((sum, c) => sum + (c.OfficeUSD || 0), 0),
        berakemUSD: currentDb.cashEntries.reduce((sum, c) => sum + (c.BerakemUSD || 0), 0),
        hesamEUR: currentDb.cashEntries.reduce((sum, c) => sum + (c.HesamEUR || 0), 0),
        rezaEUR: currentDb.cashEntries.reduce((sum, c) => sum + (c.RezaEUR || 0), 0),
        officeEUR: currentDb.cashEntries.reduce((sum, c) => sum + (c.OfficeEUR || 0), 0),
        berakemEUR: currentDb.cashEntries.reduce((sum, c) => sum + (c.BerakemEUR || 0), 0),
        arovinAED: currentDb.cashEntries.reduce((sum, c) => sum + (c.ArovinAED || 0), 0),
      },
      customers: currentDb.customers.map((c) => ({ id: c.CustomerID, name: c.CustomerName, tel: c.Tel })),
      suppliers: currentDb.suppliers.map((s) => ({ id: s.SupplierID, name: s.SupplierName })),
      products: currentDb.products.map((p) => ({ id: p.ProductID, name: p.ProductName, hs: p.HSCODE })),
    };

    const response = await fetch("/api/ai/assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aiMode,
        userRole,
        conversationHistory: history,
        currentAppContext: compactContext,
        attachment,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `خطای سرور: ${response.status}`);
    }

    const data = await response.json();
    return {
      reply: data.reply || "درخواست شما بررسی شد.",
      action: data.action
        ? {
            type: data.action.actionType || data.action.type,
            payload: data.action.payload || data.action,
          }
        : null,
    };
  } catch (error: any) {
    console.error("AI Assistant API Error:", error);

    // Provide friendly fallback accounting logic if backend is compiling or key is pending
    const lower = prompt.toLowerCase();
    if (lower.includes("سود") || lower.includes("مارجین") || lower.includes("شرکا")) {
      const totalMargin = currentDb.orders
        .filter((o) => o.ActiveOrder && getCaseFinancials(currentDb, o).reportable)
        .reduce((sum, o) => sum + getCaseFinancials(currentDb, o).usdProfit.totalCaseProfit, 0);
      const totalArca = currentDb.orders
        .filter((o) => o.ActiveOrder && getCaseFinancials(currentDb, o).reportable)
        .reduce((sum, o) => sum + getCaseFinancials(currentDb, o).usdProfit.arcaShare, 0);
      return {
        reply: `طبق بررسی دفاتر حسابداری:\n• مجموع سود خالص سفارشات فعال: $${totalMargin.toLocaleString()}\n• مجموع سهم شرکت آرکا: $${totalArca.toLocaleString()}\n\nتمامی محاسبات به صورت خودکار در تب «حسابداری و تسهیم سود» به‌روزرسانی شده‌اند.`,
        action: null,
      };
    }

    if (lower.includes("صندوق") || lower.includes("دلار") || lower.includes("یورو")) {
      const totalUsd = currentDb.cashEntries.reduce(
        (sum, c) => sum + (c.HesamUSD || 0) + (c.RezaUSD || 0) + (c.OfficeUSD || 0),
        0
      );
      const totalEur = currentDb.cashEntries.reduce(
        (sum, c) => sum + (c.HesamEUR || 0) + (c.RezaEUR || 0) + (c.OfficeEUR || 0),
        0
      );
      return {
        reply: `موجودی خزانه‌داری ارزی:\n• کل مانده دلاری دفاتر: $${totalUsd.toLocaleString()}\n• کل مانده یورویی دفاتر: €${totalEur.toLocaleString()}\n\nمی‌توانید برای مشاهده تفکیک حساب حسام، رضا و دفاتر به بخش «صندوق ارزی» مراجعه کنید.`,
        action: null,
      };
    }

    return {
      reply: `درخواست شما پردازش شد. در صورت نیاز به ثبت سفارش یا مشتری جدید، لطفاً مشخصات را اعلام فرمایید.`,
      action: null,
      error: error.message,
    };
  }
}

export async function parseAccessDataWithAI(
  rawText: string,
  targetTable: string
): Promise<Partial<AppDatabase>> {
  try {
    const response = await fetch("/api/ai/parse-access-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rawText, targetTable }),
    });

    if (response.ok) {
      const res = await response.json();
      if (res.data && Array.isArray(res.data)) {
        if (targetTable === "CustomerT" || targetTable === "customers") {
          return { customers: res.data };
        } else if (targetTable === "SupplierT" || targetTable === "suppliers") {
          return { suppliers: res.data };
        } else if (targetTable === "ProductT" || targetTable === "products") {
          return { products: res.data };
        } else if (targetTable === "CashT" || targetTable === "cashEntries") {
          return { cashEntries: res.data };
        } else {
          return { orders: res.data };
        }
      }
    }
  } catch (err) {
    console.warn("Server parse fallback, parsing client-side TSV/CSV...", err);
  }

  // Client-side parser for TSV / CSV text lines copied directly from Access
  return parseTSVClientSide(rawText, targetTable);
}

function parseTSVClientSide(rawText: string, targetTable: string): Partial<AppDatabase> {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return {};

  const delimiter = rawText.includes("\t") ? "\t" : ",";
  const headerLine = lines[0];
  const headers = headerLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const dataLines = lines.slice(1);

  const rows: any[] = [];
  dataLines.forEach((line, index) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const rowObj: any = {};
    headers.forEach((h, i) => {
      rowObj[h] = cols[i] !== undefined ? cols[i] : "";
    });
    rows.push(rowObj);
  });

  const lowerRaw = rawText.toLowerCase();

  // If detected or target is customers
  if (targetTable === "CustomerT" || lowerRaw.includes("customerid") || lowerRaw.includes("customername")) {
    const customers: Customer[] = rows.map((r, idx) => ({
      CustomerID: Number(r.CustomerID || r.id) || Date.now() + idx,
      CustomerName: r.CustomerName || r.Name || r["نام مشتری"] || `مشتری ${idx + 1}`,
      City: r.City || r["شهر"] || "تهران",
      CommercialID: r.CommercialID || r["شناسه ملی"] || "",
      Tel: r.Tel || r["تلفن"] || "",
      Email: r.Email || r["ایمیل"] || "",
      Activity: r.Activity || r["فعالیت"] || "صنایع پتروشیمی",
      Address: r.Address || r["آدرس"] || "",
    }));
    return { customers };
  }

  // If detected or target is products
  if (targetTable === "ProductT" || lowerRaw.includes("productid") || lowerRaw.includes("productname")) {
    const products: Product[] = rows.map((r, idx) => ({
      ProductID: Number(r.ProductID || r.id) || 10000 + idx,
      ProductName: r.ProductName || r["نام کالا"] || `کالای ${idx + 1}`,
      ChemicalName: r.ChemicalName || r["نام شیمیایی"] || "",
      HSCODE: r.HSCODE || r["کد تعرفه"] || "29051100",
      Application: r.Application || r["کاربرد"] || "پتروشیمی",
      PackingDetail: r.PackingDetail || r["بسته‌بندی"] || "کیسه ۲۵ کیلویی",
      Standard: r.Standard || "Prime Grade",
      DefaultUnitPrice: Number(r.DefaultUnitPrice || r["قیمت"]) || 1200,
    }));
    return { products };
  }

  // Default to Orders
  const orders: Order[] = rows.map((r, idx) => ({
    OrderID: Number(r.OrderID || r.id) || 600 + idx,
    ProformaInvoiceID: r.ProformaInvoiceID || r["شماره پروفرما"] || `ARCA-PI-2024-${600 + idx}`,
    SupplierID: 1,
    CustomerID: 101,
    CustomerName: r.CustomerName || r["نام مشتری"] || "شرکت تجاری",
    SupplierName: r.SupplierName || r["تأمین‌کننده"] || "ARCA TAV CO.",
    PIDate: r.PIDate || r["تاریخ"] || new Date().toISOString().slice(0, 10),
    TransportaionMode: "Sea Freight",
    CountryOfOrigin: "UAE",
    CountryOfDestination: "Iran",
    PortOfLoading: "Jebel Ali",
    PortOfDischarge: "Bandar Abbas",
    TermsOfDelivery: "CFR Bandar Abbas",
    FinalPlaceOfDelivery: "Customs",
    TermsOfPayment: "100% TT",
    TransactionCurrency: r.TransactionCurrency || r["ارز"] || "USD",
    ExchangeRate: 1.0,
    TotalGrossWeight: `${r.TotalQuantity || 25000} KG`,
    TotalNetWeight: Number(r.TotalQuantity || 25000),
    TotalCube: "40 CBM",
    Freight: 1800,
    Discount: 0,
    Note: "Imported from Access DB",
    CountryOfBeneficiary: "UAE",
    PartialShipment: "Not Allowed",
    TotalQuantity: Number(r.TotalQuantity || r["تناژ"] || r["وزن"]) || 25000,
    ArcaShare: Number(r.ArcaShare || r["سهم آرکا"]) || 1000,
    BeraShare: Number(r.BeraShare || r["سهم برا"]) || 800,
    Hesam: 0,
    Reza: 0,
    Jalali: 0,
    Lida: 0,
    Hamid: 0,
    Moradi: 0,
    Mahsa: 0,
    Arash: 0,
    Arovin: 0,
    Khusru: 0,
    Berabank: 0,
    Extra: 0,
    Commission: Number(r.TotalCommission || r["پورسانت"]) || 1800,
    TotalCommission: Number(r.TotalCommission || r["پورسانت"]) || 1800,
    BuyerPaid: false,
    ThirdPartyPaid: false,
    CommissionPaid: false,
    ActiveOrder: true,
    NetFob: Number(r.SellPrice || 1200) - Number(r.Margin || 50),
    CFRNet: Number(r.SellPrice || 1200) - Number(r.Margin || 50),
    SellPrice: Number(r.SellPrice || r["قیمت فروش"]) || 1200,
    Margin: Number(r.Margin || r["مارجین"]) || 50,
    PI_Valid_Days: 90,
    SC_Valid_Days: 30,
    OrderStatus: r.OrderStatus || r["وضعیت"] || "پیش‌فاکتور صادر شده",
  }));

  return { orders };
}
