import { AppDatabase, BackupSnapshot } from "../types";
import { initialDatabase } from "../data/initialData";
import { mergeBuiltInCooTemplates } from "../data/builtInCooTemplates";

const DB_STORAGE_KEY = "arca_design_demo_db_v1";
const BACKUPS_STORAGE_KEY = "arca_design_demo_backups_v1";
const SYNC_BASE_STORAGE_KEY = "arca_design_demo_sync_base_v1";
const SYNC_REVISION_STORAGE_KEY = "arca_design_demo_revision_v1";
let serverRevision: string | null = null;

try { serverRevision = localStorage.getItem(SYNC_REVISION_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }

const rememberSyncBase = (db: AppDatabase, revision: string | null) => {
  try {
    localStorage.setItem(SYNC_BASE_STORAGE_KEY, JSON.stringify(db));
    if (revision) localStorage.setItem(SYNC_REVISION_STORAGE_KEY, revision);
  } catch (error) {
    console.warn("Could not retain the offline sync base.", error);
  }
};

/** Start a deliberate retry after the user chooses their local version for a real same-field conflict. */
export const acceptConflictBase = (serverDb: AppDatabase, revision: string | null) => {
  serverRevision = revision;
  rememberSyncBase(serverDb, revision);
};

const readSyncBase = (): AppDatabase | null => {
  try {
    const value = localStorage.getItem(SYNC_BASE_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
};

export class DatabaseConflictError extends Error {
  constructor(public readonly serverData: AppDatabase | null, public readonly revision: string | null) {
    super("اطلاعات توسط کاربر دیگری تغییر کرده است.");
    this.name = "DatabaseConflictError";
  }
}

type DBChangeListener = (db: AppDatabase) => void;
const listeners: Set<DBChangeListener> = new Set();

const apiUrls = (path: string) => [path];

async function apiRequest(path: string, init?: RequestInit, acceptedStatuses: number[] = []): Promise<Response> {
  let lastError: unknown;
  for (const url of apiUrls(path)) {
    try {
      const response = await fetch(url, { ...init, credentials: "include" });
      if (response.ok || acceptedStatuses.includes(response.status)) return response;
      lastError = new Error(`Request failed: ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("API is unavailable");
}

export async function loadServerDatabase(): Promise<AppDatabase | null> {
  const response = await apiRequest("/api/database", { headers: { Accept: "application/json" } });
  const result = await response.json();
  serverRevision = result.revision || response.headers.get("X-Arca-Revision") || null;
  const data = result.data || null;
  if (data?.orders) data.orders = data.orders.map(({ OtherExpenditures: _deprecated, ...order }: any) => order);
  if (data) data.documentTemplates = mergeBuiltInCooTemplates(data.documentTemplates || []);
  if (data) rememberSyncBase(data, serverRevision);
  return data;
}

// A single browser may make several updates in quick succession (for example
// upload attachment → update order → auto-save). Sending those writes in
// parallel makes the later request carry the revision from before the first
// save, which the server correctly rejects as a conflict. Keep requests from
// this device in order so only genuinely concurrent devices need resolution.
let serverSaveQueue: Promise<void> = Promise.resolve();

async function saveServerDatabaseImmediately(db: AppDatabase): Promise<AppDatabase> {
  const data = { ...db, orders: (db.orders || []).map(({ OtherExpenditures: _deprecated, ...order }: any) => order) };
  const payload = JSON.stringify({ data, base: readSyncBase() });
  // دیتابیس شامل پیوست‌ها نیز هست و ممکن است از سقف انتقال پراکسی محلی عبور کند.
  // مرورگرهای جدید آن را gzip می‌کنند؛ سرور Express به‌طور شفاف آن را باز می‌کند.
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Arca-Revision": serverRevision || "" };
  let response: Response;
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([payload], { type: "application/json" })
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    response = await apiRequest("/api/database", {
      method: "PUT",
      headers: { ...headers, "Content-Encoding": "gzip" },
      body: await new Response(stream).arrayBuffer(),
    }, [409]);
  } else {
    response = await apiRequest("/api/database", {
      method: "PUT",
      headers,
      body: payload,
    }, [409]);
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 409) {
    serverRevision = result.revision || null;
    const error = new DatabaseConflictError(result.data || null, serverRevision);
    (error as any).conflictPaths = result.conflicts || [];
    throw error;
  }
  serverRevision = result.revision || response.headers.get("X-Arca-Revision") || serverRevision;
  const savedData = (result.data || data) as AppDatabase;
  rememberSyncBase(savedData, serverRevision);
  return savedData;
}

export function saveServerDatabase(db: AppDatabase): Promise<AppDatabase> {
  const operation = serverSaveQueue.then(() => saveServerDatabaseImmediately(db));
  // Continue processing later saves even if this individual request fails or
  // needs user conflict resolution.
  serverSaveQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export const hasPendingServerChanges = (db: AppDatabase): boolean => {
  const base = readSyncBase();
  return !base || JSON.stringify(base) !== JSON.stringify(db);
};

/** Store large document bytes outside the JSON database and keep only its URL. */
export async function uploadDocumentAttachment(file: File): Promise<string> {
  try {
    const response = await apiRequest(`/api/attachments?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const result = await response.json();
    if (!result?.url) throw new Error("Attachment upload returned no URL");
    return result.url;
  } catch (error) {
    if (navigator.onLine) throw error;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}

export function subscribeToDB(listener: DBChangeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(db: AppDatabase) {
  listeners.forEach((fn) => fn(db));
}

export function loadDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      saveDatabase(initialDatabase, false);
      return initialDatabase;
    }
    const parsed = JSON.parse(raw);
    
    // Ensure newly introduced seed items in initialDatabase exist if user had a previous local storage state
    const existingOrderIds = new Set((parsed.orders || []).map((o: any) => o.OrderID));
    const mergedOrders = [
      ...(parsed.orders || []),
      ...initialDatabase.orders.filter((o) => !existingOrderIds.has(o.OrderID)),
    ];

    const existingSupplierIds = new Set((parsed.suppliers || []).map((s: any) => s.SupplierID));
    const mergedSuppliers = [
      ...(parsed.suppliers || []),
      ...initialDatabase.suppliers.filter((s) => !existingSupplierIds.has(s.SupplierID)),
    ];

    const existingCustomerIds = new Set((parsed.customers || []).map((c: any) => c.CustomerID));
    const mergedCustomers = [
      ...(parsed.customers || []),
      ...initialDatabase.customers.filter((c) => !existingCustomerIds.has(c.CustomerID)),
    ];

    const existingProductIds = new Set((parsed.products || []).map((p: any) => p.ProductID));
    const mergedProducts = [
      ...(parsed.products || []),
      ...initialDatabase.products.filter((p) => !existingProductIds.has(p.ProductID)),
    ];

    return {
      ...initialDatabase,
      ...parsed,
      orders: mergedOrders,
      suppliers: mergedSuppliers,
      customers: mergedCustomers,
      products: mergedProducts,
      users: parsed.users?.length ? parsed.users : initialDatabase.users,
      tasks: parsed.tasks?.length ? parsed.tasks : initialDatabase.tasks,
      calendarEvents: parsed.calendarEvents?.length ? parsed.calendarEvents : initialDatabase.calendarEvents,
      cashPartners: parsed.cashPartners?.length ? parsed.cashPartners : initialDatabase.cashPartners,
      customClauses: parsed.customClauses?.length ? parsed.customClauses : initialDatabase.customClauses,
      fieldOptions: {
        ...initialDatabase.fieldOptions,
        ...(parsed.fieldOptions || {}),
      },
      currentUser: parsed.currentUser || initialDatabase.users[0],
      language: parsed.language || "fa",
      systemSettings: {
        ...initialDatabase.systemSettings,
        ...(parsed.systemSettings || {}),
      },
      documentTemplates: mergeBuiltInCooTemplates(parsed.documentTemplates || []),
    };
  } catch (error) {
    console.error("Error loading database from storage:", error);
    return initialDatabase;
  }
}

export function saveDatabase(db: AppDatabase, createSnapshot = true): void {
  try {
    const updated = {
      ...db,
      lastBackupDate: new Date().toISOString(),
    };
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(updated));
    notifyListeners(updated);

    if (createSnapshot) {
      createAutoBackup(updated);
    }
  } catch (error) {
    console.error("Error saving database to storage:", error);
  }
}

export function getBackupSnapshots(): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(BACKUPS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error loading backups:", error);
    return [];
  }
}

export function saveBackupSnapshot(label: string, db: AppDatabase, type: "auto" | "manual" = "manual"): BackupSnapshot {
  const snapshots = getBackupSnapshots();
  const dataString = JSON.stringify(db);
  const newSnapshot: BackupSnapshot = {
    id: "snap_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    label,
    sizeKB: Math.round(new Blob([dataString]).size / 1024),
    type,
    ordersCount: db.orders?.length || 0,
    customersCount: db.customers?.length || 0,
    data: JSON.parse(dataString),
  };

  const updatedSnapshots = [newSnapshot, ...snapshots].slice(0, 25);
  try {
    localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(updatedSnapshots));
  } catch (e) {
    const filtered = updatedSnapshots.filter((s, idx) => s.type === "manual" || idx < 5);
    localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(filtered));
  }

  return newSnapshot;
}

export function createManualBackup(db: AppDatabase, label?: string): BackupSnapshot {
  return saveBackupSnapshot(label || `Manual backup - ${new Date().toLocaleTimeString("en-US")}`, db, "manual");
}

let lastAutoBackupTime = 0;
function createAutoBackup(db: AppDatabase) {
  const now = Date.now();
  if (now - lastAutoBackupTime > 5 * 60 * 1000) {
    lastAutoBackupTime = now;
    saveBackupSnapshot("پشتیبان خودکار دوره‌ای", db, "auto");
  }
}

export function restoreBackupSnapshot(snapshotId: string): boolean {
  const snapshots = getBackupSnapshots();
  const found = snapshots.find((s) => s.id === snapshotId);
  if (!found) return false;

  saveDatabase(found.data, false);
  return true;
}

export function restoreFromSnapshot(snapshotId: string): AppDatabase | null {
  const snapshots = getBackupSnapshots();
  const found = snapshots.find((s) => s.id === snapshotId);
  if (!found) return null;
  saveDatabase(found.data, false);
  return found.data;
}

export function deleteBackupSnapshot(snapshotId: string): void {
  const snapshots = getBackupSnapshots().filter((s) => s.id !== snapshotId);
  localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(snapshots));
}

export function exportDatabaseJSON(db: AppDatabase): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `Arca_Accounting_Backup_${timestamp}.json`;
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importDatabaseJSON(jsonContent: string): AppDatabase | null {
  try {
    const parsed = JSON.parse(jsonContent);
    if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.customers)) {
      saveDatabase(parsed, false);
      return parsed;
    }
    return null;
  } catch (e) {
    console.error("Failed to import JSON database", e);
    return null;
  }
}

export function exportToCSV(filename: string, rows: Record<string, any>[]): void {
  if (!rows || !rows.length) return;
  const separator = ",";
  const keys = Object.keys(rows[0]);
  const csvContent =
    "\uFEFF" +
    keys.join(separator) +
    "\n" +
    rows
      .map((row) => {
        return keys
          .map((k) => {
            let cell = row[k] === null || row[k] === undefined ? "" : String(row[k]);
            cell = cell.replace(/"/g, '""');
            if (cell.search(/("|,|\n)/g) >= 0) {
              cell = `"${cell}"`;
            }
            return cell;
          })
          .join(separator);
      })
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Downloads Access-table-compatible CSV files. Import each file into the identically named table in Access. */
export function exportAccessImportBundle(db: AppDatabase): void {
  const date = new Date().toISOString().slice(0, 10);
  const orderRows = db.orders.map((o) => ({
    OrderID: o.OrderID, ProformaInvoiceID: o.ProformaInvoiceID, RelatedPI: o.RelatedPI || "", SupplierID: o.SupplierID, CustomerID: o.CustomerID,
    PIDate: o.PIDate, TransportaionMode: o.TransportaionMode, CountryOfOrigin: o.CountryOfOrigin, CountryOfDestination: o.CountryOfDestination,
    PortOfDischarge: o.PortOfDischarge, PortOfLoading: o.PortOfLoading, TermsOfDelivery: o.TermsOfDelivery, FinalPlaceOfDelivery: o.FinalPlaceOfDelivery,
    TermsOfPayment: o.TermsOfPayment, TransactionCurrency: o.TransactionCurrency, ExchangeRate: o.ExchangeRate, TotalGrossWeight: o.TotalGrossWeight,
    TotalNetWeight: o.TotalNetWeight || 0, TotalCube: o.TotalCube, Freight: o.Freight, Discount: o.Discount,
    Note: o.Note, CountryOfBeneficiary: o.CountryOfBeneficiary, PartialShipment: o.PartialShipment, NameOfSignatory: o.NameOfSignatory || "",
    TotalQuantity: o.TotalQuantity, ArcaShare: o.ArcaShare, BeraShare: o.BeraShare, Hesam: o.Hesam, Reza: o.Reza, Commission: o.Commission || 0,
    BuyerPaid: o.BuyerPaid ? -1 : 0, CommissionPaid: o.CommissionPaid ? -1 : 0, ActiveOrder: o.ActiveOrder ? -1 : 0,
    NetFob: o.NetFob || 0, CFRNet: o.CFRNet || 0, SellPrice: o.SellPrice || 0, Margin: o.Margin || 0, CostPrice: o.CostPrice || 0,
    InvoiceNo: o.InvoiceNo || o.CommercialInvoiceID || "", InvoiceDate: o.InvoiceDate || o.CommercialInvoiceDate || "", SailingDate: o.SailingDate || "",
    LoadingPort: o.LoadingPort || "", Carrier: o.Carrier || "", ContainerNo: o.ContainerNo || "", TruckNo: o.TruckNo || "", OrderStatus: o.OrderStatus || "", BLNo: o.BLNo || "",
  }));
  const detailRows = (db.orderDetails?.length ? db.orderDetails : db.orders.flatMap((o) => o.items || [])).map((item: any) => ({
    OrderDetailID: item.OrderDetailID || "", OrderID: item.OrderID || "", ProductID: item.ProductID || "", Quantity: item.Quantity || 0,
    UnitPrice: item.UnitPrice || 0, ProductDescription: item.ProductDescription || "", NosAndKindOfPackages: item.NosAndKindOfPackages || "", GrossWeight: item.GrossWeight || 0,
  }));
  const customerRows = db.customers.map((c: any) => ({ CustomerID: c.CustomerID, CustomerName: c.CustomerName, Address: c.Address || "", Tel: c.Tel || "", "Commercial ID": c.CommercialID || "" }));
  const supplierRows = db.suppliers.map((s: any) => ({ SupplierID: s.SupplierID, SupplierName: s.SupplierName, Adderss: s.Address || "", Tel: s.Tel || "", Email: s.Email || "", LogoT: s.LogoT || "", SignT: s.SignT || "", Bank: s.Bank || "", Signatory: s.Signatory || "", TaxT: s.TaxT || "" }));
  const productRows = db.products.map((p: any) => ({ ProductID: p.ProductID, ProductName: p.ProductName, ChemicalName: p.ChemicalName || "", HSCODE: p.HSCODE || "", PackingDetail: p.PackingDetail || "" }));
  const tableFiles: [string, Record<string, any>[]][] = [
    ["OrderT", orderRows], ["OrderDetailT", detailRows], ["CustomerT", customerRows], ["SupplierT", supplierRows], ["ProductT", productRows], ["CashT", db.cashEntries as Record<string, any>[]],
  ];
  const guide = `ARCA → ACCESS IMPORT (${date})\n\n1. In Microsoft Access, first make a copy of your .accdb file.\n2. Go to External Data > New Data Source > From File > Text File.\n3. Import each downloaded CSV into the table with the same name: CustomerT, SupplierT, ProductT, OrderT, OrderDetailT, CashT.\n4. Select UTF-8 / comma-delimited and check “First Row Contains Field Names”.\n5. For a full replacement, delete old records in a child-to-parent order before importing (OrderDetailT, CashT, OrderT, then master tables).\n6. Use Append a copy of the records to the table for incremental import.\n\nThe files use original Access field names where available. Image fields such as LogoT / SignT are text references and may require manual attachment handling in the older Access application.`;
  const guideBlob = new Blob([guide], { type: "text/plain;charset=utf-8" });
  const guideUrl = URL.createObjectURL(guideBlob);
  const guideLink = document.createElement("a"); guideLink.href = guideUrl; guideLink.download = `ARCA_Access_Import_Guide_${date}.txt`; guideLink.click(); URL.revokeObjectURL(guideUrl);
  tableFiles.forEach(([table, rows], index) => window.setTimeout(() => exportToCSV(`ARCA_${table}_${date}.csv`, rows), 250 * (index + 1)));
}
