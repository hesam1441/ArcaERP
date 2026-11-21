import { validateFinancialGroups } from "./src/utils/financialGroups";
import { validateSettingsWrite } from "./src/utils/settingsAccess";
import { buildAgentOrderView, isAgentDocumentVisible } from "./src/utils/agentDisclosure";
import { fitPrintDocuments } from "./src/utils/fitPrintDocuments";
import { fitProductNames } from "./src/utils/fitProductNames";
import { appendFittedPdfPages } from "./src/utils/fitPdfPages";
import express from "express";
import { databaseWriteSafetyError } from "./src/utils/databaseWriteSafety";
import { validatePaymentFunding } from "./src/utils/paymentFunding";
import { normalizePartyDatabase } from "./src/utils/partyNormalization";
import { reviewListSettlement } from "./src/utils/listSettlement";
import { createEmptyCompanyFinance, validateCompanyFinanceDatabase } from "./src/companyFinance/model";
import type { CompanyFinanceDatabase, CompanyId } from "./src/companyFinance/types";
import type { AppDatabase } from "./src/types";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import puppeteer, { type Browser } from "puppeteer-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// No environment file is loaded by the isolated design demo.

const app = express();
const PORT = Number(process.env.PORT || 3000);
const databasePath = path.join(process.cwd(), "sandbox-data", "arca-demo-database.json");
const companyFinanceDirectory = path.join(path.dirname(databasePath), "company-finance");
const backupDirectory = path.join(process.cwd(), "sandbox-data", "backups");
const aiSettingsPath = path.join(path.dirname(databasePath), "ai-settings.json");
const aiKeyPath = path.join(path.dirname(databasePath), "ai-key.bin");
const passwordResetPath = path.join(path.dirname(databasePath), "password-reset-tokens.json");
const sessionsPath = path.join(path.dirname(databasePath), "auth-sessions.json");
const attachmentDirectory = path.join(path.dirname(databasePath), "attachments");
const outlookTokenPath = path.join(path.dirname(databasePath), "outlook-token.bin");
const outlookDashboardPath = path.join(path.dirname(databasePath), "outlook-dashboard.json");
const executiveTasksPath = path.join(path.dirname(databasePath), "executive-tasks.json");
// شناسهٔ یکتا برای هر اجرای سرویس؛ رابط کاربری با آن انتشار جدید را تشخیص می‌دهد.
const deploymentId = crypto.randomUUID();
let databaseWriteQueue: Promise<void> = Promise.resolve();
const companyWriteQueues = new Map<CompanyId, Promise<void>>();
let printBrowser: Browser | null = null;

async function getPrintBrowser() {
  if (printBrowser?.connected) return printBrowser;
  printBrowser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return printBrowser;
}

async function printSourceBytes(source: string): Promise<Uint8Array> {
  const match = source.match(/^data:[^;,]+(?:;[^,]*)?;base64,(.+)$/s);
  if (match) return Buffer.from(match[1], "base64");
  if (source.startsWith("/api/attachments/")) {
    return fs.readFile(path.join(attachmentDirectory, path.basename(source)));
  }
  throw new Error("Unsupported print attachment source");
}

function withDatabaseWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = databaseWriteQueue.then(task, task);
  databaseWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

const isCompanyId = (value: unknown): value is CompanyId => value === "berakem" || value === "arovin";
const companyFinancePath = (companyId: CompanyId) => path.join(companyFinanceDirectory, `${companyId}.json`);
function companyDatabaseRevision(data: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
async function readCompanyFinance(companyId: CompanyId): Promise<CompanyFinanceDatabase> {
  try {
    const data = JSON.parse(await fs.readFile(companyFinancePath(companyId), "utf8"));
    if (!validateCompanyFinanceDatabase(data, companyId)) throw new Error(`Company finance store for ${companyId} failed schema validation.`);
    return data;
  } catch (error: any) {
    if (error?.code === "ENOENT") return createEmptyCompanyFinance(companyId);
    throw error;
  }
}
function withCompanyWriteLock<T>(companyId: CompanyId, task: () => Promise<T>): Promise<T> {
  const previous = companyWriteQueues.get(companyId) || Promise.resolve();
  const run = previous.then(task, task);
  companyWriteQueues.set(companyId, run.then(() => undefined, () => undefined));
  return run;
}
function companyAuditChanges(current: CompanyFinanceDatabase, candidate: CompanyFinanceDatabase, user: any): CompanyFinanceDatabase {
  const next = { ...candidate, auditEvents: [...current.auditEvents] };
  const collections = ["parties", "items", "procurementCases", "localSales", "invoices", "bankAccounts", "entries"] as const;
  const now = new Date().toISOString();
  if (JSON.stringify(current.settings) !== JSON.stringify(candidate.settings)) {
    next.auditEvents.push({ id: crypto.randomUUID(), entityType: "company_settings", entityId: "settings", action: "updated", actorId: user.id, actorName: user.name || user.username, at: now });
  }
  for (const entityType of collections) {
    const before = new Map((current[entityType] as any[]).map((item) => [item.id, item]));
    for (const item of next[entityType] as any[]) {
      const prior = before.get(item.id);
      if (!prior || JSON.stringify(prior) !== JSON.stringify(item)) {
        next.auditEvents.push({
          id: crypto.randomUUID(), entityType, entityId: item.id,
          action: prior ? "updated" : "created", actorId: user.id,
          actorName: user.name || user.username, at: now,
        });
      }
    }
  }
  return next;
}
function validateCompanyAppendOnly(current: CompanyFinanceDatabase, candidate: CompanyFinanceDatabase): string | null {
  const immutableCollections = ["parties", "items", "localSales", "invoices", "bankAccounts"] as const;
  for (const collection of immutableCollections) {
    const before = new Map((current[collection] as any[]).map((item) => [item.id, item]));
    const after = new Map((candidate[collection] as any[]).map((item) => [item.id, item]));
    for (const [id, item] of before) {
      if (!after.has(id) || JSON.stringify(after.get(id)) !== JSON.stringify(item)) {
        return `Posted ${collection} records are immutable; use a reversal or a new record.`;
      }
    }
  }
  const previousEntries = new Map(current.entries.map((item) => [item.id, item]));
  const nextEntries = new Map(candidate.entries.map((item) => [item.id, item]));
  for (const [id, prior] of previousEntries) {
    const next = nextEntries.get(id);
    if (!next) return "Posted finance entries cannot be deleted.";
    if (JSON.stringify(prior) === JSON.stringify(next)) continue;
    const { checkStatus: _priorStatus, clearedAt: _priorClearedAt, ...priorFields } = prior;
    const { checkStatus: _nextStatus, clearedAt: _nextClearedAt, ...nextFields } = next;
    const validCheckTransition = prior.paymentMethod === "check" && prior.checkStatus === "pending"
      && (next.checkStatus === "cleared" || next.checkStatus === "void")
      && JSON.stringify(priorFields) === JSON.stringify(nextFields)
      && (next.checkStatus !== "cleared" || Boolean(next.clearedAt));
    if (!validCheckTransition) return "Posted finance entries are immutable except for clearing or voiding a pending check.";
  }
  const priorCases = new Map(current.procurementCases.map((item) => [item.id, item]));
  const nextCases = new Map(candidate.procurementCases.map((item) => [item.id, item]));
  for (const [id, prior] of priorCases) {
    const next = nextCases.get(id);
    if (!next) return "Procurement cases cannot be deleted.";
    const priorCosts = new Map(prior.costs.map((item) => [item.id, item]));
    const nextCosts = new Map(next.costs.map((item) => [item.id, item]));
    if (priorCosts.size > nextCosts.size || [...priorCosts].some(([costId, cost]) => JSON.stringify(nextCosts.get(costId)) !== JSON.stringify(cost))) return "Existing procurement costs cannot be removed or edited.";
    const priorLines = new Map(prior.lines.map((line) => [line.id, line]));
    const nextLines = new Map(next.lines.map((line) => [line.id, line]));
    if (priorLines.size !== nextLines.size) return "Existing procurement lines cannot be added or removed in this release.";
    for (const [lineId, oldLine] of priorLines) {
      const newLine = nextLines.get(lineId);
      if (!newLine || newLine.receivedQuantity < oldLine.receivedQuantity) return "Received quantities cannot be reduced.";
      const { receivedQuantity: _oldReceived, ...oldLineFields } = oldLine;
      const { receivedQuantity: _newReceived, ...newLineFields } = newLine;
      if (JSON.stringify(oldLineFields) !== JSON.stringify(newLineFields)) return "Posted procurement line details cannot be edited.";
    }
    const { costs: _priorCosts, updatedAt: _priorUpdatedAt, lines: _priorLines, status: _priorStatus, ...priorFields } = prior;
    const { costs: _nextCosts, updatedAt: _nextUpdatedAt, lines: _nextLines, status: _nextStatus, ...nextFields } = next;
    if (JSON.stringify(priorFields) !== JSON.stringify(nextFields)) return "Existing procurement case details cannot be edited in this release.";
    const totalOrdered = next.lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalReceived = next.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const expectedStatus = totalReceived >= totalOrdered ? "received" : totalReceived > 0 ? "partially_received" : "open";
    if (next.status !== expectedStatus || (prior.status === "closed" && next.status !== "closed")) return "Procurement status must match recorded received quantities.";
  }
  return null;
}
async function writeCompanyFinance(data: CompanyFinanceDatabase): Promise<void> {
  await fs.mkdir(companyFinanceDirectory, { recursive: true });
  const destination = companyFinancePath(data.companyId);
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, destination);
  const backupDirectory = path.join(companyFinanceDirectory, "backups", data.companyId);
  await fs.mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(destination, path.join(backupDirectory, `${data.companyId}-${stamp}.json`));
  const backups = (await fs.readdir(backupDirectory)).filter((name) => name.endsWith(".json")).sort();
  await Promise.all(backups.slice(0, -30).map((name) => fs.unlink(path.join(backupDirectory, name))));
}

type AIConnectionSettings = {
  openaiApiKey?: string;
  groq?: { enabled: boolean; apiKey: string; model?: string };
  dify?: { enabled: boolean; baseUrl: string; apiKey: string };
};

// رابط Codex/Zima ممکن است برنامه را از یک پورت واسط نمایش دهد؛ API باید برای همان رابط محلی قابل دسترس باشد.
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const isLocalCodexOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  if (origin && isLocalCodexOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Encoding");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  } else if (req.method === "OPTIONS") return res.sendStatus(403);
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

async function getStoredAISettings(): Promise<AIConnectionSettings> {
  let settings: AIConnectionSettings = {};
  try {
    const [stored, key] = await Promise.all([fs.readFile(aiSettingsPath, "utf8"), fs.readFile(aiKeyPath)]);
    const payload = JSON.parse(stored);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.value, "base64")), decipher.final()]).toString("utf8");
    try { settings = JSON.parse(decrypted); } catch { settings = { openaiApiKey: decrypted }; }
  } catch { /* Environment settings may still be configured. */ }
  if (!settings.openaiApiKey && process.env.OPENAI_API_KEY) settings.openaiApiKey = process.env.OPENAI_API_KEY;
  return settings;
}
async function getStoredOpenAIKey(): Promise<string | null> {
  return (await getStoredAISettings()).openaiApiKey || null;
}
async function getOpenAIClient(): Promise<OpenAI | null> {
  const apiKey = await getStoredOpenAIKey();
  return apiKey ? new OpenAI({ apiKey }) : null;
}

async function readDatabase(): Promise<AppDatabase | null> {
  try {
    return JSON.parse(await fs.readFile(databasePath, "utf8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeDatabase(data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const temporaryPath = `${databasePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(data), "utf8");
  await fs.rename(temporaryPath, databasePath);
  // Keep the latest 30 server-side recovery points inside the persistent Docker volume.
  await fs.mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(databasePath, path.join(backupDirectory, `arca-${stamp}.json`));
  const backups = (await fs.readdir(backupDirectory)).filter((name) => name.startsWith("arca-") && name.endsWith(".json")).sort();
  await Promise.all(backups.slice(0, -30).map((name) => fs.unlink(path.join(backupDirectory, name))));
}
function databaseRevision(data: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

const entityIdFields = ["OrderID", "CustomerID", "SupplierID", "ProductID", "OrderDetailID", "CashID", "InquiryID", "id", "requestNumber"];
const jsonEqual = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right);
const isObject = (value: any) => value !== null && typeof value === "object" && !Array.isArray(value);
const entityKey = (value: any): string | null => {
  if (!isObject(value)) return null;
  const field = entityIdFields.find((candidate) => value[candidate] !== undefined && value[candidate] !== null);
  return field ? `${field}:${String(value[field])}` : null;
};

/** Three-way merge: independent record/field edits are combined; same-field edits are reported. */
function mergeDatabaseValue(base: any, local: any, remote: any, pathName = "", conflicts: string[] = []): any {
  if (jsonEqual(local, base)) return remote;
  if (jsonEqual(remote, base) || jsonEqual(local, remote)) return local;
  if (pathName === "lastBackupDate" || pathName === "currentUser") return local;
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const all = [...base, ...local, ...remote];
    if (!all.length) return [];
    if (!all.every((item) => entityKey(item))) {
      conflicts.push(pathName || "database");
      return remote;
    }
    const baseMap = new Map(base.map((item) => [entityKey(item)!, item]));
    const localMap = new Map(local.map((item) => [entityKey(item)!, item]));
    const remoteMap = new Map(remote.map((item) => [entityKey(item)!, item]));
    const orderedKeys = [...new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()])];
    const merged: any[] = [];
    for (const key of orderedKeys) {
      const value = mergeDatabaseValue(baseMap.get(key), localMap.get(key), remoteMap.get(key), `${pathName}[${key}]`, conflicts);
      if (value !== undefined) merged.push(value);
    }
    return merged;
  }
  if (isObject(base) && isObject(local) && isObject(remote)) {
    const merged: Record<string, any> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeDatabaseValue(base[key], local[key], remote[key], pathName ? `${pathName}.${key}` : key, conflicts);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  conflicts.push(pathName || "database");
  return remote;
}

const attachmentExtension = (mimeType: string, name = "") => {
  const named = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (named) return named;
  const known: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx" };
  return known[mimeType] || ".bin";
};

async function storeAttachment(bytes: Buffer, mimeType: string, originalName = "document") {
  await fs.mkdir(attachmentDirectory, { recursive: true });
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const extension = attachmentExtension(mimeType, originalName);
  const storedName = `${hash}${extension}`;
  try { await fs.access(path.join(attachmentDirectory, storedName)); }
  catch { await fs.writeFile(path.join(attachmentDirectory, storedName), bytes, { mode: 0o600 }); }
  return `/api/attachments/${storedName}`;
}

async function migrateEmbeddedAttachments() {
  const database: any = await readDatabase();
  if (!database) return;
  let changed = false;
  for (const product of database.products || []) {
    for (const collection of [product.tdsDocuments || [], product.msdsDocuments || []]) {
      for (const document of collection) {
        for (const page of document.pages || []) {
          const match = typeof page.data === "string" ? page.data.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s) : null;
          if (!match) continue;
          page.data = await storeAttachment(Buffer.from(match[2], "base64"), match[1], page.name);
          changed = true;
        }
      }
    }
  }
  for (const template of database.documentTemplates || []) {
    const match = typeof template.imageData === "string" ? template.imageData.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s) : null;
    if (!match) continue;
    template.imageData = await storeAttachment(Buffer.from(match[2], "base64"), match[1], `${template.name || template.id || "template"}.jpg`);
    changed = true;
  }
  if (changed) await writeDatabase(database);
}

const hashPassword = (password: string) => crypto.createHash("sha256").update(`arca-v1:${password}`).digest("hex");
const hashResetToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

type PasswordResetRecord = { userId: string; tokenHash: string; expiresAt: string };
type AuthSessionRecord = { userId: string; tokenHash: string; createdAt?: string; lastSeenAt?: string; expiresAt: string; absoluteExpiresAt?: string };
const SESSION_IDLE_MS = 30 * 24 * 60 * 60_000;
const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60_000;
const SESSION_RENEW_WINDOW_MS = 7 * 24 * 60 * 60_000;
type OutlookToken = { access_token: string; refresh_token?: string; expires_at: number; scope?: string };

const outlookConfigured = () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY);
const outlookTenant = () => process.env.MICROSOFT_TENANT_ID || "common";
function outlookRedirectUri(req: express.Request) {
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  return `${appUrl}/api/outlook/callback`;
}
function outlookEncryptionKey() {
  return crypto.createHash("sha256").update(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY || "")).digest();
}
async function writeOutlookToken(token: OutlookToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", outlookEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(token)), cipher.final()]);
  await fs.mkdir(path.dirname(outlookTokenPath), { recursive: true });
  await fs.writeFile(outlookTokenPath, JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), value: encrypted.toString("base64") }), { mode: 0o600 });
}
async function readOutlookToken(): Promise<OutlookToken | null> {
  if (!outlookConfigured()) return null;
  try {
    const payload = JSON.parse(await fs.readFile(outlookTokenPath, "utf8"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", outlookEncryptionKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.value, "base64")), decipher.final()]).toString("utf8"));
  } catch { return null; }
}
async function exchangeOutlookToken(params: URLSearchParams) {
  const response = await fetch(`https://login.microsoftonline.com/${outlookTenant()}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result.error_description || "Microsoft token exchange failed");
  const token: OutlookToken = { access_token: result.access_token, refresh_token: result.refresh_token, scope: result.scope, expires_at: Date.now() + Math.max(60, Number(result.expires_in || 3600) - 60) * 1000 };
  await writeOutlookToken(token);
  return token;
}
async function getOutlookAccessToken(req: express.Request) {
  let token = await readOutlookToken();
  if (!token) return null;
  if (token.expires_at > Date.now()) return token.access_token;
  if (!token.refresh_token) return null;
  token = await exchangeOutlookToken(new URLSearchParams({ client_id: String(process.env.MICROSOFT_CLIENT_ID), client_secret: String(process.env.MICROSOFT_CLIENT_SECRET), grant_type: "refresh_token", refresh_token: token.refresh_token, redirect_uri: outlookRedirectUri(req), scope: "offline_access User.Read Mail.Read Calendars.ReadWrite" }));
  return token.access_token;
}
async function graphJson(token: string, url: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Microsoft Graph request failed (${response.status})`);
  return result;
}
async function readPasswordResetRecords(): Promise<PasswordResetRecord[]> {
  try { return JSON.parse(await fs.readFile(passwordResetPath, "utf8")); } catch { return []; }
}
async function writePasswordResetRecords(records: PasswordResetRecord[]) {
  await fs.mkdir(path.dirname(passwordResetPath), { recursive: true });
  await fs.writeFile(passwordResetPath, JSON.stringify(records), { mode: 0o600 });
}

async function readAuthSessions(): Promise<AuthSessionRecord[]> {
  try { return JSON.parse(await fs.readFile(sessionsPath, "utf8")); } catch { return []; }
}
async function writeAuthSessions(records: AuthSessionRecord[]) {
  await fs.mkdir(path.dirname(sessionsPath), { recursive: true });
  await fs.writeFile(sessionsPath, JSON.stringify(records), { mode: 0o600 });
}
function readCookie(req: express.Request, name: string): string {
  const cookie = req.headers.cookie || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}
function setSessionCookie(req: express.Request, res: express.Response, token: string, maxAgeSeconds: number) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isHttps = req.secure || forwardedProto === "https";
  res.setHeader("Set-Cookie", `arca_design_demo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isHttps ? "; Secure" : ""}; Priority=High`);
}
async function resolveSessionUser(req: express.Request, res?: express.Response): Promise<any | null> {
  const token = readCookie(req, "arca_design_demo_session");
  if (!token) return null;
  const now = Date.now();
  const tokenHash = hashResetToken(token);
  const storedSessions = await readAuthSessions();
  const sessions = storedSessions.filter((item) => Date.parse(item.expiresAt) > now && (!item.absoluteExpiresAt || Date.parse(item.absoluteExpiresAt) > now));
  const session = sessions.find((item) => safeEqual(item.tokenHash, tokenHash));
  if (!session) return null;
  const database: any = await readDatabase();
  const user = database?.users?.find((item: any) => item.id === session.userId && item.active) || null;
  if (!user || (user.role === "company_finance" && !isCompanyId(user.companyId))) return null;
  const absoluteExpiry = session.absoluteExpiresAt ? Date.parse(session.absoluteExpiresAt) : now + SESSION_ABSOLUTE_MS;
  if (res && Date.parse(session.expiresAt) - now <= SESSION_RENEW_WINDOW_MS) {
    const nextExpiry = Math.min(now + SESSION_IDLE_MS, absoluteExpiry);
    session.createdAt ||= new Date(now).toISOString();
    session.lastSeenAt = new Date(now).toISOString();
    session.absoluteExpiresAt = new Date(absoluteExpiry).toISOString();
    session.expiresAt = new Date(nextExpiry).toISOString();
    await writeAuthSessions(sessions);
    setSessionCookie(req, res, token, Math.max(0, Math.floor((nextExpiry - now) / 1000)));
  } else if (sessions.length !== storedSessions.length) {
    await writeAuthSessions(sessions);
  }
  return user;
}

app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const publicPaths = ["/api/health", "/api/version", "/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/auth/request-password-reset", "/api/auth/reset-password", "/api/outlook/callback"];
  if (publicPaths.includes(req.path)) return next();
  try {
    const user = await resolveSessionUser(req, res);
    if (!user) return res.status(401).json({ error: "نشست ورود معتبر نیست؛ دوباره وارد شوید." });
    (req as any).arcaUser = user;
    if (user.role === "company_finance" && !["/api/database", "/api/company-finance"].includes(req.path)) {
      return res.status(403).json({ error: "این حساب فقط به دفتر مالی شرکت خود دسترسی دارد." });
    }
    return next();
  } catch (error) {
    console.error("Session validation failed:", error);
    return res.status(500).json({ error: "بررسی نشست ورود ناموفق بود." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!username || !password) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({ error: "نام کاربری و رمز عبور الزامی است." });
    }
    const database: any = await readDatabase();
    const user = database?.users?.find((item: any) => item.active && String(item.username || "").toLowerCase() === username);
    if (user?.role === "company_finance" && !isCompanyId(user.companyId)) return res.status(403).json({ error: "حساب مالی شرکت به شرکت معتبری متصل نیست؛ با مدیر آرکا تماس بگیرید." });
    const suppliedHash = hashPassword(password);
    const isBootstrap = user?.role === "superadmin" && !user?.passwordHash && password === "admin";
    if (!user || (!isBootstrap && (!user.passwordHash || !safeEqual(suppliedHash, user.passwordHash)))) {
      return res.status(401).json({ error: "نام کاربری یا رمز عبور نادرست است." });
    }
    if (isBootstrap) {
      user.passwordHash = suppliedHash;
      await writeDatabase(database);
    }
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const sessions = (await readAuthSessions()).filter((item) => Date.parse(item.expiresAt) > now && (!item.absoluteExpiresAt || Date.parse(item.absoluteExpiresAt) > now));
    sessions.push({ userId: user.id, tokenHash: hashResetToken(token), createdAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_IDLE_MS).toISOString(), absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_MS).toISOString() });
    await writeAuthSessions(sessions);
    setSessionCookie(req, res, token, SESSION_IDLE_MS / 1000);
    res.setHeader("Cache-Control", "no-store");
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ error: "ورود به سامانه ناموفق بود. لطفاً دوباره تلاش کنید." });
  }
});

app.get("/api/auth/session", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const user = await resolveSessionUser(req, res);
    if (!user) return res.status(401).json({ authenticated: false });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return res.json({ authenticated: true, user: safeUser });
  } catch {
    return res.status(401).json({ authenticated: false });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = readCookie(req, "arca_design_demo_session");
  if (token) {
    const tokenHash = hashResetToken(token);
    const sessions = (await readAuthSessions()).filter((item) => !safeEqual(item.tokenHash, tokenHash));
    await writeAuthSessions(sessions);
  }
  setSessionCookie(req, res, "", 0);
  return res.json({ success: true });
});

app.get("/api/outlook/connect", async (req, res) => {
  if (!outlookConfigured()) return res.status(503).json({ error: "تنظیمات اتصال Microsoft روی سرور تکمیل نشده است." });
  const state = crypto.randomBytes(24).toString("hex");
  res.setHeader("Set-Cookie", `outlook_oauth_state=${state}; Path=/api/outlook/callback; HttpOnly; SameSite=Lax; Max-Age=600${req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`);
  const params = new URLSearchParams({ client_id: String(process.env.MICROSOFT_CLIENT_ID), response_type: "code", redirect_uri: outlookRedirectUri(req), response_mode: "query", scope: "offline_access User.Read Mail.Read Calendars.ReadWrite", state });
  return res.json({ authorizationUrl: `https://login.microsoftonline.com/${outlookTenant()}/oauth2/v2.0/authorize?${params}` });
});

app.get("/api/outlook/callback", async (req, res) => {
  try {
    const state = String(req.query.state || "");
    const expected = readCookie(req, "outlook_oauth_state");
    if (!state || !expected || !safeEqual(state, expected)) return res.status(400).send("Invalid Outlook connection state.");
    if (!req.query.code) return res.status(400).send("Microsoft authorization was not completed.");
    await exchangeOutlookToken(new URLSearchParams({ client_id: String(process.env.MICROSOFT_CLIENT_ID), client_secret: String(process.env.MICROSOFT_CLIENT_SECRET), grant_type: "authorization_code", code: String(req.query.code), redirect_uri: outlookRedirectUri(req), scope: "offline_access User.Read Mail.Read Calendars.ReadWrite" }));
    res.setHeader("Set-Cookie", "outlook_oauth_state=; Path=/api/outlook/callback; HttpOnly; SameSite=Lax; Max-Age=0");
    return res.redirect("/?outlook=connected");
  } catch (error: any) {
    console.error("Outlook callback failed", error);
    return res.status(500).send("Outlook connection failed. Please return to ARCATAV and try again.");
  }
});

const cleanMailText = (value = "") => value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
const outlookItem = (mail: any, extra: any = {}) => ({ id: mail.id, title: mail.subject || "بدون موضوع", subtitle: cleanMailText(mail.bodyPreview || mail.body?.content || "").slice(0, 360), sender: mail.from?.emailAddress?.name || mail.from?.emailAddress?.address || "", date: mail.receivedDateTime, link: mail.webLink, ...extra });

async function buildOutlookDashboard(req: express.Request) {
  const token = await getOutlookAccessToken(req);
  if (!token) throw new Error("ابتدا حساب Outlook را به پنل متصل کنید.");
  const now = new Date();
  const end = new Date(now.getTime() + 120 * 86400000);
  const mailUrl = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=200&$orderby=receivedDateTime%20desc&$select=id,subject,bodyPreview,webLink,from,receivedDateTime,isRead,importance,hasAttachments";
  const calendarUrl = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(now.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$top=200&$orderby=start/dateTime&$select=id,subject,bodyPreview,webLink,start,end,isAllDay,importance,location,organizer`;
  const [profile, mailResult, calendarResult] = await Promise.all([graphJson(token, "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName"), graphJson(token, mailUrl), graphJson(token, calendarUrl)]);
  const emails: any[] = mailResult.value || [];
  const events: any[] = calendarResult.value || [];
  const businessWords = /quote|quotation|price|offer|inquiry|invoice|payment|swift|shipment|booking|container|vessel|cargo|arrival|etd|eta|delivery|meeting|contract|tender|مناقصه|قیمت|استعلام|پرداخت|حمل|محموله|جلسه|بارنامه/i;
  const urgentWords = /urgent|as soon as possible|asap|kind reminder|deadline|overdue|immediate|فوری|یادآوری|مهلت|تمدید|تاخیر|تأخیر/i;
  const shipmentWords = /shipment|booking|container|vessel|cargo|arrival|etd|eta|delivery|BL\b|بارنامه|حمل|محموله|کانتینر|کشتی|تحویل/i;
  const urgent = emails.filter((m) => urgentWords.test(`${m.subject} ${m.bodyPreview}`) || (m.importance === "high" && businessWords.test(`${m.subject} ${m.bodyPreview}`))).slice(0, 30).map((m) => outlookItem(m, { priority: "high", status: m.isRead ? "بررسی‌شده" : "خوانده‌نشده" }));
  const shipments = emails.filter((m) => shipmentWords.test(`${m.subject} ${m.bodyPreview}`)).slice(0, 40).map((m) => outlookItem(m, { priority: urgentWords.test(`${m.subject} ${m.bodyPreview}`) ? "high" : "medium", status: "پیگیری حمل" }));
  const unanswered = emails.filter((m) => !m.isRead && businessWords.test(`${m.subject} ${m.bodyPreview}`)).slice(0, 35).map((m) => outlookItem(m, { priority: urgentWords.test(`${m.subject} ${m.bodyPreview}`) ? "high" : "medium", status: "نیازمند بررسی" }));
  const upcoming = events.map((event) => ({ id: event.id, title: event.subject || "رویداد بدون عنوان", subtitle: cleanMailText(event.bodyPreview || event.location?.displayName || ""), sender: event.organizer?.emailAddress?.name || "Outlook Calendar", date: event.start?.dateTime, dueDate: event.start?.dateTime, link: event.webLink, priority: event.importance === "high" ? "high" : "medium", status: event.isAllDay ? "تمام‌روز" : "تقویم" })).slice(0, 60);
  const pricePattern = /(?:USD|US\$|\$|EUR|€)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(USD|US\$|\$|EUR|€)(?:\s*\/\s*(MT|KG|TON))?/gi;
  const prices: any[] = [];
  for (const mail of emails) {
    if (!/price|quotation|offer|قیمت|پیشنهاد/i.test(`${mail.subject} ${mail.bodyPreview}`)) continue;
    const text = cleanMailText(`${mail.subject} ${mail.bodyPreview}`);
    for (const match of text.matchAll(pricePattern)) {
      const amount = Number(String(match[1] || match[2]).replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currencyToken = match[3] || match[0].match(/USD|US\$|\$|EUR|€/i)?.[0] || "USD";
      prices.push(outlookItem(mail, { product: (mail.subject || "قیمت اعلام‌شده").replace(/^(re|fw|fwd):\s*/ig, "").slice(0, 90), amount, currency: /EUR|€/.test(currencyToken) ? "EUR" : "USD", unit: match[4] || "MT", company: mail.from?.emailAddress?.name || "", status: "استخراج از ایمیل", priority: "low" }));
      if (prices.length >= 100) break;
    }
    if (prices.length >= 100) break;
  }
  const dashboard = { connected: true, configured: true, account: profile.mail || profile.userPrincipalName || profile.displayName, lastSyncAt: new Date().toISOString(), summary: { scannedEmails: emails.length, urgent: urgent.length, upcoming: upcoming.length, unanswered: unanswered.length, prices: prices.length }, urgent, upcoming, shipments, unanswered, prices };
  await fs.mkdir(path.dirname(outlookDashboardPath), { recursive: true });
  await fs.writeFile(outlookDashboardPath, JSON.stringify(dashboard), { mode: 0o600 });
  return dashboard;
}

app.get("/api/outlook/dashboard", async (_req, res) => {
  const connected = Boolean(await readOutlookToken());
  try {
    const cached = JSON.parse(await fs.readFile(outlookDashboardPath, "utf8"));
    return res.json({ ...cached, configured: outlookConfigured(), connected });
  } catch { return res.json({ configured: outlookConfigured(), connected, summary: { scannedEmails: 0, urgent: 0, upcoming: 0, unanswered: 0, prices: 0 }, urgent: [], upcoming: [], shipments: [], unanswered: [], prices: [] }); }
});

app.post("/api/outlook/sync", async (req, res) => {
  try { return res.json(await buildOutlookDashboard(req)); }
  catch (error: any) { console.error("Outlook sync failed", error); return res.status(502).json({ error: error.message || "به‌روزرسانی Outlook ناموفق بود." }); }
});

type ExecutiveTask = { id: string; title: string; description: string; completed: boolean; createdAt: string; completedAt?: string };
async function readExecutiveTasks(): Promise<ExecutiveTask[]> {
  try { return JSON.parse(await fs.readFile(executiveTasksPath, "utf8")); } catch { return []; }
}
async function writeExecutiveTasks(tasks: ExecutiveTask[]) {
  await fs.mkdir(path.dirname(executiveTasksPath), { recursive: true });
  await fs.writeFile(executiveTasksPath, JSON.stringify(tasks), { mode: 0o600 });
}
app.get("/api/executive-tasks", async (_req, res) => res.json({ tasks: await readExecutiveTasks() }));
app.post("/api/executive-tasks", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!title) return res.status(400).json({ error: "عنوان کار الزامی است." });
  const task: ExecutiveTask = { id: crypto.randomUUID(), title: title.slice(0, 240), description: description.slice(0, 4000), completed: false, createdAt: new Date().toISOString() };
  const tasks = [task, ...(await readExecutiveTasks())];
  await writeExecutiveTasks(tasks);
  return res.status(201).json({ task });
});
app.put("/api/executive-tasks/:id", async (req, res) => {
  const tasks = await readExecutiveTasks();
  const index = tasks.findIndex((task) => task.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "کار پیدا نشد." });
  const completed = typeof req.body?.completed === "boolean" ? req.body.completed : tasks[index].completed;
  tasks[index] = { ...tasks[index], title: req.body?.title === undefined ? tasks[index].title : String(req.body.title).trim().slice(0, 240), description: req.body?.description === undefined ? tasks[index].description : String(req.body.description).trim().slice(0, 4000), completed, completedAt: completed ? new Date().toISOString() : undefined };
  if (!tasks[index].title) return res.status(400).json({ error: "عنوان کار الزامی است." });
  await writeExecutiveTasks(tasks);
  return res.json({ task: tasks[index] });
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  const genericResponse = { success: true, message: "اگر حساب و ایمیل معتبر باشد، لینک بازیابی ارسال می‌شود." };
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const database: any = await readDatabase();
    const user = database?.users?.find((item: any) => item.active && item.username?.toLowerCase() === username);
    if (!user?.email) return res.json(genericResponse);

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn("Password reset requested, but SMTP is not configured.");
      return res.status(503).json({ error: "ارسال ایمیل هنوز توسط مدیر سیستم پیکربندی نشده است." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const records = (await readPasswordResetRecords()).filter((record) => Date.parse(record.expiresAt) > now && record.userId !== user.id);
    records.push({ userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(now + 30 * 60_000).toISOString() });
    await writePasswordResetRecords(records);

    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const resetUrl = `${appUrl}/?resetToken=${encodeURIComponent(token)}`;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || smtpUser,
      to: user.email,
      subject: "بازیابی رمز عبور ARCATAV",
      text: `برای تعیین رمز عبور جدید، تا ۳۰ دقیقه آینده از این لینک استفاده کنید:\n${resetUrl}\n\nاگر این درخواست را شما ثبت نکرده‌اید، این پیام را نادیده بگیرید.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>بازیابی رمز عبور ARCATAV</h2><p>برای تعیین رمز عبور جدید، روی دکمه زیر کلیک کنید. این لینک ۳۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px">تعیین رمز عبور جدید</a></p><p style="color:#64748b;font-size:12px">اگر این درخواست را شما ثبت نکرده‌اید، این پیام را نادیده بگیرید.</p></div>`,
    });
    return res.json(genericResponse);
  } catch (error) {
    console.error("Password reset email failed:", error);
    return res.status(500).json({ error: "ارسال ایمیل بازیابی ناموفق بود. لطفاً دوباره تلاش کنید." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (password.length < 8) return res.status(400).json({ error: "رمز عبور باید حداقل ۸ کاراکتر باشد." });
    const now = Date.now();
    const records = await readPasswordResetRecords();
    const tokenHash = hashResetToken(token);
    const record = records.find((item) => Date.parse(item.expiresAt) > now && safeEqual(item.tokenHash, tokenHash));
    if (!record) return res.status(400).json({ error: "لینک بازیابی نامعتبر یا منقضی شده است." });
    const database: any = await readDatabase();
    const user = database?.users?.find((item: any) => item.id === record.userId && item.active);
    if (!user) return res.status(400).json({ error: "حساب کاربری معتبر نیست." });
    user.passwordHash = hashPassword(password);
    user.passwordResetRequested = false;
    await writeDatabase(database);
    await writePasswordResetRecords(records.filter((item) => item.userId !== record.userId && Date.parse(item.expiresAt) > now));
    res.json({ success: true });
  } catch (error) {
    console.error("Password reset failed:", error);
    res.status(500).json({ error: "تغییر رمز عبور ناموفق بود." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ai: Boolean(process.env.OPENAI_API_KEY), timestamp: new Date().toISOString() });
});

// این مسیر عمداً بدون کش و بدون نیاز به ورود است تا پنجرهٔ بازِ کاربر بتواند
// پس از انتشار نسخهٔ جدید، خودکار به نسخهٔ تازه منتقل شود.
app.get("/api/version", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json({ deploymentId });
});

app.get("/api/ai/status", async (_req, res) => {
  const settings = await getStoredAISettings();
  res.json({
    primary: settings.groq?.enabled && settings.groq.apiKey ? "groq" : settings.dify?.enabled && settings.dify.apiKey ? "dify" : "openai",
    groqConfigured: Boolean(settings.groq?.enabled && settings.groq.apiKey),
    difyConfigured: Boolean(settings.dify?.enabled && settings.dify.apiKey),
    fallback: settings.openaiApiKey ? "openai" : null,
  });
});

app.post("/api/settings/openai-key", async (req, res) => {
  const { username, password, apiKey } = req.body || {};
  const database: any = await readDatabase();
  const user = database?.users?.find((item: any) => item.username === username && item.role === "superadmin" && item.active);
  const suppliedHash = crypto.createHash("sha256").update(`arca-v1:${password || ""}`).digest("hex");
  if (!user?.passwordHash || !safeEqual(suppliedHash, user.passwordHash)) return res.status(403).json({ error: "تأیید مدیر ارشد ناموفق بود." });
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) return res.status(400).json({ error: "کلید API معتبر نیست." });
  await fs.mkdir(path.dirname(aiSettingsPath), { recursive: true });
  let key: Buffer;
  try { key = await fs.readFile(aiKeyPath); } catch { key = crypto.randomBytes(32); await fs.writeFile(aiKeyPath, key, { mode: 0o600 }); }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const currentSettings = await getStoredAISettings();
  const value = Buffer.concat([cipher.update(JSON.stringify({ ...currentSettings, openaiApiKey: apiKey.trim() }), "utf8"), cipher.final()]);
  await fs.writeFile(aiSettingsPath, JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), value: value.toString("base64") }), { mode: 0o600 });
  res.json({ success: true });
});

app.post("/api/backup/source", async (req, res) => {
  const { username, password } = req.body || {};
  const database: any = await readDatabase();
  const user = database?.users?.find((item: any) => item.username === username && item.role === "superadmin" && item.active);
  const suppliedHash = crypto.createHash("sha256").update(`arca-v1:${password || ""}`).digest("hex");
  if (!user?.passwordHash || !safeEqual(suppliedHash, user.passwordHash)) return res.status(403).json({ error: "تأیید مدیر ارشد ناموفق بود." });
  res.download(path.join(process.cwd(), "arca-source.tar.gz"), `arca-source-${new Date().toISOString().slice(0, 10)}.tar.gz`);
});

const partnerAllowedOrders = (database: any, user: any) => (database.orders || []).filter((order: any) =>
  (user.assignedSupplierIds || []).length ? (user.assignedSupplierIds || []).includes(order.SupplierID) : (user.accessibleOrderIds || []).includes(order.OrderID));
const normalizeAccessName = (value: unknown) => String(value || "").trim().toLocaleLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک");
const agentAllowedOrders = (database: any, user: any) => {
  const agentName = normalizeAccessName(user.agentName);
  if (!agentName) return [];
  return (database.orders || []).filter((order: any) => {
    const planName = normalizeAccessName(order.profitPlan?.agentName);
    const shareNames = (order.customShares || []).filter((share: any) => /agent|ایجنت/i.test(`${share.role || ""} ${share.id || ""}`)).map((share: any) => normalizeAccessName(share.partnerName));
    return planName === agentName || shareNames.includes(agentName);
  });
};
const scopeDatabaseForPartner = (database: any, user: any) => {
  const allowed = partnerAllowedOrders(database, user);
  const orderIds = new Set(allowed.map((order: any) => order.OrderID));
  const orders = allowed.map((order: any) => {
    const { ArcaShare: _a, BeraShare: _b, Hesam: _h, Reza: _r, Jalali: _j, Lida: _l, Hamid: _ha, Moradi: _m,
      Mahsa: _ma, Arash: _ar, Arovin: _aro, Khusru: _k, Berabank: _bb, Extra: _e, Commission: _c,
      TotalCommission: _tc, Margin: _margin, profitPlan: _plan, customShares: _shares,
      companyProfitShares: _companyShares, commissionSettlements: _settlements, ...safeOrder } = order;
    return safeOrder;
  });
  const safeUser = { ...user, passwordHash: undefined };
  return {
    orders, customers: [], suppliers: (database.suppliers || []).filter((supplier: any) => allowed.some((order: any) => order.SupplierID === supplier.SupplierID)).map((supplier: any) => ({ SupplierID: supplier.SupplierID, SupplierName: supplier.SupplierName, Address: supplier.Address, Country: supplier.Country, Email: supplier.Email, Tel: supplier.Tel })),
    products: [], cashEntries: [], inquiries: [], users: [safeUser], currentUser: safeUser, cashPartners: [],
    tasks: (database.tasks || []).filter((task: any) => orderIds.has(task.relatedOrderId)),
    calendarEvents: (database.calendarEvents || []).filter((event: any) => orderIds.has(event.relatedOrderId)),
    language: "en", settings: { companyName: database.settings?.companyName },
  };
};
const agentDocumentVisible = isAgentDocumentVisible;
const scopeDatabaseForAgent = (database: any, user: any) => {
  const allowed = agentAllowedOrders(database, user);
  const safeUser = { ...user, passwordHash: undefined };
  return { orders: allowed.map((order: any) => {
    return buildAgentOrderView(order, database.suppliers?.find((supplier: any) => supplier.SupplierID === order.SupplierID), database);
  }), customers: [], suppliers: [], products: [], cashEntries: [], inquiries: [], users: [safeUser], currentUser: safeUser, cashPartners: [], tasks: [], calendarEvents: [], language: "en", settings: { companyName: database.settings?.companyName } };
};

const scopeDatabaseForCompany = (user: any) => {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return {
    customers: [], suppliers: [], products: [], orders: [], cashEntries: [], inquiries: [],
    users: [safeUser], currentUser: safeUser, tasks: [], calendarEvents: [], cashPartners: [],
    settings: {}, systemSettings: {}, language: "en",
  };
};

app.get("/api/company-finance", async (req, res) => {
  try {
    const user = (req as any).arcaUser;
    let companyId: CompanyId | null = null;
    if (user?.role === "company_finance") {
      if (!isCompanyId(user.companyId)) return res.status(403).json({ error: "این حساب به شرکت معتبری متصل نیست." });
      companyId = user.companyId;
    } else if (user?.role === "superadmin" && isCompanyId(req.query.companyId)) {
      companyId = req.query.companyId;
    }
    if (!companyId) return res.status(403).json({ error: "دسترسی به دفتر مالی شرکت مجاز نیست." });
    const data = await readCompanyFinance(companyId);
    const revision = companyDatabaseRevision(data);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Arca-Company-Revision", revision);
    return res.json({ data, revision, companyId });
  } catch (error: any) {
    console.error("Company finance read failed:", error);
    return res.status(500).json({ error: "خواندن دفتر مالی شرکت ناموفق بود." });
  }
});

app.put("/api/company-finance", async (req, res) => {
  try {
    const user = (req as any).arcaUser;
    let companyId: CompanyId | null = null;
    if (user?.role === "company_finance") {
      if (!isCompanyId(user.companyId)) return res.status(403).json({ error: "این حساب به شرکت معتبری متصل نیست." });
      companyId = user.companyId;
    } else if (user?.role === "superadmin" && isCompanyId(req.query.companyId)) {
      companyId = req.query.companyId;
    }
    if (!companyId) return res.status(403).json({ error: "ثبت در دفتر مالی شرکت مجاز نیست." });
    const candidate = req.body?.data;
    if (!validateCompanyFinanceDatabase(candidate, companyId)) {
      return res.status(400).json({ error: "ساختار دفتر مالی شرکت معتبر نیست." });
    }
    const submittedRevision = String(req.headers["x-arca-company-revision"] || "");
    if (!submittedRevision) return res.status(428).json({ error: "نسخهٔ دفتر برای ذخیره ارسال نشده است." });
    const result = await withCompanyWriteLock(companyId, async () => {
      const current = await readCompanyFinance(companyId!);
      const currentRevision = companyDatabaseRevision(current);
      if (currentRevision !== submittedRevision) return { conflict: true, current, revision: currentRevision };
      const appendOnlyError = validateCompanyAppendOnly(current, candidate);
      if (appendOnlyError) return { conflict: false, invalid: appendOnlyError, current, revision: currentRevision };
      const next = companyAuditChanges(current, { ...candidate, companyId } as CompanyFinanceDatabase, user);
      await writeCompanyFinance(next);
      return { conflict: false, invalid: "", current: next, revision: companyDatabaseRevision(next) };
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Arca-Company-Revision", result.revision);
    if (result.conflict) return res.status(409).json({ error: "دفتر شرکت روی دستگاه دیگری تغییر کرده؛ داده‌ای بازنویسی نشد.", data: result.current, revision: result.revision });
    if ("invalid" in result && result.invalid) return res.status(400).json({ error: result.invalid });
    return res.json({ success: true, data: result.current, revision: result.revision });
  } catch (error: any) {
    console.error("Company finance write failed:", error);
    return res.status(500).json({ error: "ذخیرهٔ دفتر مالی شرکت ناموفق بود." });
  }
});

app.get("/api/database", async (req, res) => {
  try {
    const user = (req as any).arcaUser;
    if (user?.role === "company_finance") {
      const scoped = scopeDatabaseForCompany(user);
      const revision = databaseRevision(scoped);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Arca-Revision", revision);
      return res.json({ data: scoped, revision });
    }
    const data = await readDatabase();
    const revision = databaseRevision(data);
    res.setHeader("X-Arca-Revision", revision);
    res.json({ data: user?.role === "partner_office" ? scopeDatabaseForPartner(data, user) : user?.role === "sales_agent" ? scopeDatabaseForAgent(data, user) : data, revision });
  } catch (error: any) {
    res.status(500).json({ error: "خواندن پایگاه داده ناموفق بود.", details: error.message });
  }
});

app.put("/api/database", async (req, res) => {
  try {
    let data = req.body?.data;
    const base = req.body?.base;
    if (!data || !Array.isArray(data.orders) || !Array.isArray(data.customers)) {
      return res.status(400).json({ error: "ساختار پایگاه داده معتبر نیست." });
    }
    data = normalizePartyDatabase(data);
    const submittedRevision = String(req.headers["x-arca-revision"] || "");
    if (!submittedRevision) return res.status(428).json({ error: "نسخهٔ داده برای ذخیره ارسال نشده است." });
    const sessionUser = (req as any).arcaUser;
    if (sessionUser?.role === "company_finance") return res.status(403).json({ error: "این حساب اجازهٔ تغییر پایگاه دادهٔ مرکزی را ندارد." });
    if (sessionUser?.role === "sales_agent") return res.status(403).json({ error: "ایجنت فقط امکان مشاهده و دانلود اطلاعات مجاز خود را دارد." });
    if (sessionUser?.role === "partner_office") {
      const result = await withDatabaseWriteLock(async () => {
        const current = await readDatabase();
        const storedUser = (current.users || []).find((item: any) => item.id === sessionUser.id && item.active && item.role === "partner_office");
        if (!storedUser) return { forbidden: true };
        const allowed = new Set(partnerAllowedOrders(current, storedUser).map((order: any) => order.OrderID));
        for (const submitted of data.orders || []) {
          if (!allowed.has(submitted.OrderID)) continue;
          const target = current.orders.find((order: any) => order.OrderID === submitted.OrderID);
          if (!target) continue;
          target.purchaseProforma = submitted.purchaseProforma;
          target.caseMessages = submitted.caseMessages;
          target.ETA = submitted.ETA;
          target.ETD = submitted.ETD;
        }
        const mergeScoped = (key: "tasks" | "calendarEvents") => {
          const submittedItems = (data[key] || []).filter((item: any) => allowed.has(item.relatedOrderId));
          const untouched = (current[key] || []).filter((item: any) => !allowed.has(item.relatedOrderId));
          current[key] = [...untouched, ...submittedItems];
        };
        mergeScoped("tasks"); mergeScoped("calendarEvents");
        await writeDatabase(current);
        return { forbidden: false, data: scopeDatabaseForPartner(current, storedUser), revision: databaseRevision(current) };
      });
      if (result.forbidden) return res.status(403).json({ error: "دسترسی دفتر معتبر نیست." });
      res.setHeader("X-Arca-Revision", result.revision!);
      return res.json({ success: true, savedAt: new Date().toISOString(), revision: result.revision, data: result.data, merged: true });
    }
    const result = await withDatabaseWriteLock(async () => {
      const current = await readDatabase();
      const currentRevision = databaseRevision(current);
      if (!safeEqual(submittedRevision, currentRevision)) {
        if (!base) return { conflict: true, data: current, revision: currentRevision, conflicts: ["database"] };
        const conflicts: string[] = [];
        const merged = mergeDatabaseValue(base, data, current, "", conflicts);
        if (conflicts.length) return { conflict: true, data: current, revision: currentRevision, conflicts };
        if (databaseWriteSafetyError(current, merged, sessionUser?.id)) return { conflict: true, data: current, revision: currentRevision, conflicts: ["database-safety"] };
        const settingsError = validateSettingsWrite(current, merged, sessionUser?.role);
        if (settingsError) return { settingsError };
        const groupError = validateFinancialGroups(merged as AppDatabase);
        if (groupError) return { fundingError: groupError };
        const fundingError = validatePaymentFunding(merged, current as AppDatabase);
        if (fundingError) return { fundingError };
        await writeDatabase(merged);
        return { conflict: false, data: merged, revision: databaseRevision(merged), merged: true };
      }
      if (databaseWriteSafetyError(current, data, sessionUser?.id)) return { conflict: true, data: current, revision: currentRevision, conflicts: ["database-safety"] };
      const settingsError = validateSettingsWrite(current, data, sessionUser?.role);
      if (settingsError) return { settingsError };
      const groupError = validateFinancialGroups(data as AppDatabase);
      if (groupError) return { fundingError: groupError };
      const fundingError = validatePaymentFunding(data, current as AppDatabase);
      if (fundingError) return { fundingError };
      await writeDatabase(data);
      return { conflict: false, data, revision: databaseRevision(data), merged: false };
    });
    if ("settingsError" in result) return res.status(403).json({ error: result.settingsError });
    if ("fundingError" in result) return res.status(400).json({ error: result.fundingError });
    if (result.conflict) return res.status(409).json({ error: "یک فیلد یکسان توسط چند کاربر تغییر کرده است.", data: result.data, revision: result.revision, conflicts: result.conflicts });
    res.setHeader("X-Arca-Revision", result.revision);
    res.json({ success: true, savedAt: new Date().toISOString(), revision: result.revision, data: result.data, merged: result.merged });
  } catch (error: any) {
    res.status(500).json({ error: "ذخیره پایگاه داده ناموفق بود.", details: error.message });
  }
});

app.post("/api/attachments", express.raw({ type: () => true, limit: "30mb" }), async (req, res) => {
  try {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!bytes.length) return res.status(400).json({ error: "فایل خالی است." });
    const originalName = String(req.query.filename || "document");
    const mimeType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0];
    const url = await storeAttachment(bytes, mimeType, originalName);
    return res.json({ url, size: bytes.length });
  } catch (error: any) {
    return res.status(500).json({ error: "ذخیرهٔ فایل ناموفق بود.", details: error.message });
  }
});

app.get("/api/attachments/:storedName", async (req, res) => {
  try {
    const storedName = path.basename(req.params.storedName);
    if (storedName !== req.params.storedName) return res.sendStatus(400);
    const user = (req as any).arcaUser;
    if (user?.role === "sales_agent") {
      const database = await readDatabase();
      const allowedOrders = agentAllowedOrders(database, user);
      const allowed = allowedOrders.some((order: any) => (order.attachments || []).filter(agentDocumentVisible).some((file: any) => String(file.data || "").endsWith(`/${storedName}`)));
      if (!allowed) return res.sendStatus(403);
    }
    return res.sendFile(path.join(attachmentDirectory, storedName));
  } catch {
    return res.sendStatus(404);
  }
});

app.post("/api/print/merged-pdf", async (req, res) => {
  const segments = Array.isArray(req.body?.segments) ? req.body.segments : [];
  if (!segments.length || segments.length > 30) return res.status(400).json({ error: "مدارک چاپ معتبر نیستند." });
  let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;
  try {
    const output = await PDFDocument.create();
    const font = await output.embedFont(StandardFonts.Helvetica);
    const browser = await getPrintBrowser();
    page = await browser.newPage();
    await page.emulateMediaType("print");
    // Chromium runs inside the container; use the internal listener for CSS/assets.
    const origin = `http://127.0.0.1:${PORT}`;
    const printableAscii = (value: unknown) => String(value || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();

    for (const segment of segments) {
      if (segment?.kind === "html") {
        // Render each selected document independently. A forced page break
        // between combined documents previously shifted the page indexes and
        // caused a blank page to replace the next selected document.
        const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${origin}/">${String(segment.styles || "")}<style>@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important;background:#fff}.print\\:hidden{display:none!important}body>*:last-child{page-break-after:auto!important;break-after:auto!important}</style></head><body>${String(segment.html || "")}</body></html>`;
        await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.evaluate(async () => {
          // Match the in-app preview: wait for the supplied document fonts,
          // especially the condensed COO font, before Chromium snapshots PDF.
          await Promise.all([
            document.fonts.load('16px "Public Sans"').catch(() => []),
            document.fonts.load('16px "Bebas Neue"').catch(() => []),
            document.fonts.load('700 16px "Bebas Neue"').catch(() => []),
            document.fonts.load('16px "Arca PDF Bebas"').catch(() => []),
            document.fonts.load('700 16px "Arca PDF Bebas"').catch(() => []),
          ]);
          await document.fonts.ready;
          await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = resolve; })));
        });
        const printCssReady = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.className = "grid grid-cols-3";
          document.body.appendChild(probe);
          const ready = getComputedStyle(probe).display === "grid";
          probe.remove();
          return ready;
        });
        // Cover pages and edited COA pages are self-contained HTML and do not
        // use Tailwind's grid utilities. Only documents cloned from the app
        // preview require that stylesheet probe.
        const requiresAppPrintCss = /printable-document|\bgrid-cols-/.test(String(segment.html || ""));
        if (requiresAppPrintCss && !printCssReady) throw new Error("Print stylesheet was not applied; PDF generation stopped");
        await page.evaluate(fitPrintDocuments);
        await page.evaluate(fitProductNames);
        await page.evaluate(fitPrintDocuments);
        const rendered = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
        const renderedDocument = await PDFDocument.load(rendered);
        const copied = await output.copyPages(renderedDocument, renderedDocument.getPageIndices());
        copied.forEach((item) => output.addPage(item));
        continue;
      }
      if (segment?.kind === "pdf" || segment?.kind === "coa-pdf") {
        const source = await PDFDocument.load(await printSourceBytes(String(segment.data || "")));
        if (segment.kind === "pdf") {
          await appendFittedPdfPages(output, source);
          continue;
        }
        // The COA preview uses the supplier logo and a fixed A4 content area.
        // Reuse those exact visual anchors in the generated PDF rather than
        // falling back to a text-only header.
        let logoImage: any = null;
        if (segment.logo) {
          try {
            const logoBytes = await printSourceBytes(String(segment.logo));
            const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50 && logoBytes[2] === 0x4e && logoBytes[3] === 0x47;
            logoImage = isPng ? await output.embedPng(logoBytes) : await output.embedJpg(logoBytes);
          } catch {
            // A missing or unsupported logo must never block document export.
          }
        }
        for (const sourcePage of source.getPages()) {
          const target = output.addPage([595.28, 841.89]);
          const embedded = await output.embedPage(sourcePage);
          // Match the preview sheet: 7mm side padding, 22mm header and 16mm
          // footer. The preview canvas fills this content rectangle.
          const margin = 19.84, header = 62.36, footer = 45.35;
          const availableWidth = 595.28 - margin * 2;
          const availableHeight = 841.89 - margin * 2 - header - footer;
          const width = availableWidth, height = availableHeight;
          if (logoImage) {
            const logoScale = Math.min(160 / logoImage.width, 42 / logoImage.height);
            const logoWidth = logoImage.width * logoScale;
            const logoHeight = logoImage.height * logoScale;
            target.drawImage(logoImage, { x: margin + 8, y: 841.89 - 14 - logoHeight, width: logoWidth, height: logoHeight });
          }
          target.drawText("CERTIFICATE OF ANALYSIS", { x: 595.28 - margin - 170, y: 841.89 - 30, size: 13, font });
          target.drawText(`No: ${printableAscii(segment.number) || "-"}`, { x: 595.28 - margin - 170, y: 841.89 - 43, size: 8, font });
          target.drawText(`Date: ${printableAscii(segment.date) || "-"}`, { x: 595.28 - margin - 170, y: 841.89 - 53, size: 8, font });
          target.drawLine({ start: { x: margin, y: 841.89 - header }, end: { x: 595.28 - margin, y: 841.89 - header }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
          target.drawPage(embedded, { x: margin, y: margin + footer, width, height });
          target.drawLine({ start: { x: margin, y: margin + footer }, end: { x: 595.28 - margin, y: margin + footer }, thickness: 0.6, color: rgb(0.45, 0.45, 0.45) });
          target.drawText(printableAscii(segment.supplier), { x: margin, y: margin + 22, size: 8, font });
          target.drawText(printableAscii(segment.contact).slice(0, 145), { x: margin, y: margin + 10, size: 6, font });
        }
      }
    }
    const bytes = await output.save({ useObjectStreams: true });
    const filename = String(req.body?.filename || "Documents").replace(/[^a-zA-Z0-9_.-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(bytes));
  } catch (error: any) {
    console.error("Merged PDF generation failed", error);
    return res.status(500).json({ error: "ساخت PDF نهایی ناموفق بود.", details: error.message });
  } finally {
    await page?.close().catch(() => undefined);
  }
});

app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { prompt, conversationHistory = [], currentAppContext = {}, aiMode = "normal", attachment } = req.body;
    const authenticatedUser = (req as any).arcaUser;
    const userRole = authenticatedUser?.role || "";
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "متن پیام نامعتبر است." });
    }

    // Every assistant entry point must see the same executive-secretary data.
    // Previously only the dedicated secretary page supplied this context, so
    // the global AI drawer incorrectly reported that no email/task data existed.
    const [executiveTasks, mailDashboard] = await Promise.all([
      readExecutiveTasks(),
      fs.readFile(outlookDashboardPath, "utf8").then((value) => JSON.parse(value)).catch(() => null),
    ]);
    const authoritativeDb = await readDatabase() as AppDatabase;
    const accountingLists = (authoritativeDb.accountingLists || []).map((list) => {
      try {
        const review = reviewListSettlement(authoritativeDb, list.id);
        return {
          id: list.id, name: list.name, caseCount: review.view.rows.length,
          totalProfitUSD: review.view.summary.totalProfitUSD,
          remainingSharesUSD: review.remainingUSD,
          blockers: review.blockers,
          cases: review.view.rows.map((row) => ({
            orderId: row.order.OrderID, proforma: row.order.ProformaInvoiceID,
            customer: row.order.CustomerName, financialStatus: row.financial.statusLabel,
            profitCurrency: row.financial.profitCurrency,
            caseProfit: row.financial.nativeStatus === "ready" ? row.financial.profit.totalCaseProfit : null,
            profitUSD: row.financial.reportable ? row.financial.usdProfit.totalCaseProfit : null,
            customerOutstanding: row.payment.customerOutstanding,
            fundingDebt: row.ledger.fundingDebt,
            beneficiaries: row.custody.beneficiaries.map((person) => ({ name: person.name, entitled: person.entitlement, paid: person.paid, remaining: person.remaining, currency: row.financial.profitCurrency, missingFX: person.missingFX })),
          })),
        };
      } catch (error) {
        return { id: list.id, name: list.name, caseCount: list.orderIds.length, unavailable: error instanceof Error ? error.message : "Calculation unavailable" };
      }
    });
    const trustedClientContext = { ...currentAppContext };
    delete (trustedClientContext as any).accountingLists;
    const enrichedAppContext = {
      secretary: {
        tasks: executiveTasks.filter((task) => !task.completed).slice(0, 100),
        gmail: mailDashboard ? {
          account: mailDashboard.account,
          lastSyncAt: mailDashboard.lastSyncAt,
          summary: mailDashboard.summary,
          urgent: mailDashboard.urgent || [],
          upcoming: mailDashboard.upcoming || [],
          shipments: mailDashboard.shipments || [],
          unanswered: mailDashboard.unanswered || [],
          prices: mailDashboard.prices || [],
        } : null,
      },
      // These are calculated from the authenticated server database, never the
      // browser-provided summary, so list-settlement advice uses current books.
      accountingLists,
      ...trustedClientContext,
    };
    const serializedContext = JSON.stringify(enrichedAppContext);
    const contextLimit = aiMode === "professional" ? 60000 : 42000;
    const boundedContext = serializedContext.length > contextLimit
      ? `${serializedContext.slice(0, contextLimit)}\n[داده‌های بیشتر برای حفظ سرعت و سقف مدل ارسال نشده‌اند]`
      : serializedContext;
    const accessRule = userRole === "superadmin"
      ? "کاربر فعلی مدیر ارشد است و می‌تواند درخواست پیشنهاد یا تغییر در طراحی، ساختار، تجربه کاربری و قابلیت‌های اپلیکیشن داشته باشد."
      : "کاربر فعلی مدیر ارشد نیست. فقط درخواست‌های حسابداری، فرمول‌ها، محاسبات، سود و زیان، صندوق، تسویه و گزارش‌های مالی را پاسخ بده. هر درخواست دربارهٔ تغییر طراحی، ظاهر، ساختار، قابلیت‌ها یا توسعهٔ اپلیکیشن را محترمانه رد کن و بگو فقط مدیر ارشد مجاز به چنین درخواست‌هایی است.";
    const attachmentText = typeof attachment?.extractedText === "string" ? attachment.extractedText.slice(0, 24000) : "";
    const hasImage = typeof attachment?.imageData === "string" && /^data:image\//.test(attachment.imageData);
    const instructions = `شما دستیار ارشد آرکا با سه نقش هم‌زمان هستید: 1) منشی اجرایی: داده‌های بخش secretary را همیشه بررسی کن و در پاسخ‌های مربوط به ایمیل، کارهای مهم، حمل، استعلام، قیمت و موعدها از secretary.gmail و secretary.tasks استفاده کن. اگر این داده‌ها وجود دارند هرگز نگو هیچ اطلاعاتی وجود ندارد. lastSyncAt زمان آخرین بررسی Gmail است و باید در صورت نیاز شفاف بگویی اطلاعات تا آن زمان به‌روز است؛ دسترسی زنده‌ای فراتر از این دادهٔ ذخیره‌شده ادعا نکن. 2) حسابدار حرفه‌ای و مدیر مالی: ثبت و تحلیل دریافت، پرداخت، هزینه، مانده صندوق‌های چندارزی، دفاتر شرکت‌ها، سود و زیان، سهم شرکا، مغایرت‌یابی، گزارش‌گیری و محاسبات بازرگانی را انجام دهید. در تمام محاسبات، ارز و واحد را مشخص کنید، اعداد را انگلیسی بنویسید و فرمول یا منطق محاسبه را شفاف و کوتاه بیان کنید. هرگز مبلغ یا سندی را بدون دادهٔ کافی حدس نزنید؛ در صورت کمبود، دقیقاً اطلاعات لازم را بپرسید. دادهٔ فایل یا تصویر پیوست را فقط برای تحلیل استفاده کن و پیش از هر ثبت در سیستم، اقدام پیشنهادی را شفاف ارائه کن. 3) متخصص طراحی اپلیکیشن و تجربه کاربری: فقط برای مدیر ارشد، درخواست‌های تغییر ظاهر، فرم‌ها، چیدمان و روند کار را به پیشنهاد روشن و قابل اجرا تبدیل کن. هرگز بدون تأیید مدیر ارشد، تغییر داده یا کد را اجراشده اعلام نکن. ${accessRule}

سبک پاسخ الزامی: مثل یک منشی اجرایی باتجربه بنویس، نه یک چت‌بات. نتیجه را در جمله اول بگو. گزارش‌های ایمیل و مدیریتی را فقط با این ترتیب بساز: «جمع‌بندی مدیریتی»، «اقدام فوری امروز»، «کارهای در انتظار»، «حمل و موعدها»، «استعلام‌ها و قیمت‌ها»، «ریسک‌ها و تصمیم‌های لازم». بخش خالی را حذف کن. جمع‌بندی فقط تصویر کلی و تعداد موارد را بگوید؛ جزئیات هر موضوع فقط یک‌بار و در بخش تخصصی خودش نوشته شود. هر مورد را کوتاه، مشخص و عملیاتی بنویس و در صورت وجود، نام طرف، محصول، مقدار، مبلغ، ارز، شرط تحویل و تاریخ را بیاور. میان داده قطعی و برداشت خودت تفاوت روشن بگذار. از مقدمه‌هایی مانند «گزارش آماده است»، تعریف از کاربر، تکرار سؤال، متن کلی، ایموجی، ستاره‌گذاری خارج از عنوان و نتیجه‌گیری تکراری پرهیز کن. عنوان بخش‌ها را با Markdown به شکل ## عنوان و موارد را با خط تیره بنویس. برای هر اقدام از فعل روشن مانند «پاسخ دهید»، «تأیید کنید»، «قیمت بگیرید» یا «پیگیری کنید» استفاده کن. حداکثر جزئیات مفید را با کمترین کلمات ارائه بده.

به فارسی رسمی، دقیق و کاربردی پاسخ دهید. در صورت درخواست عملیات قابل ثبت در برنامه، در انتهای پاسخ فقط یک بلوک JSON با actionType و payload قرار دهید. actionType یکی از CREATE_ORDER، CREATE_CUSTOMER، CREATE_PRODUCT، UPDATE_ORDER، ADD_CASH_TRANSACTION، CALCULATE_COMMISSION، ANALYZE_REPORT، SETTLE_ACCOUNTING_LIST، DESIGN_CHANGE_REQUEST یا NONE است. برای SETTLE_ACCOUNTING_LIST فقط وقتی پیشنهاد بده که محاسبات و موانع لیست را از accountingLists بررسی کرده‌ای و هیچ blocker وجود ندارد؛ payload شامل listId باشد. ثبت نهایی تأیید تاریخی است و سند نقدی جدید نمی‌سازد. هرگز به‌جای کاربر ادعا نکن که دریافت وجه یا پرداخت سهم‌ها واقعاً انجام شده؛ رابط برنامه تأیید صریح این موضوع را می‌گیرد.\n\nوضعیت فعلی برنامه:\n${boundedContext}${attachmentText ? `\n\nدادهٔ استخراج‌شده از فایل «${String(attachment?.name || "attachment")}»:\n${attachmentText}` : ""}`;
    const historyText = conversationHistory
      .slice(-6)
      .map((message: { role: string; content: string }) => `${message.role === "assistant" ? "دستیار" : "کاربر"}: ${message.content.slice(0, 1000)}`)
      .join("\n");

    const input = `${instructions}\n\n${historyText}${historyText ? "\n" : ""}کاربر: ${prompt}`;
    const aiSettings = await getStoredAISettings();
    let replyText = "";
    if (!hasImage && aiSettings.groq?.enabled && aiSettings.groq.apiKey) {
      try {
        const groq = new OpenAI({ apiKey: aiSettings.groq.apiKey, baseURL: "https://api.groq.com/openai/v1" });
        const response = await groq.chat.completions.create({
          model: aiSettings.groq.model || "openai/gpt-oss-120b",
          temperature: 0.2,
          max_tokens: 5000,
          messages: [{ role: "system", content: instructions }, { role: "user", content: `${historyText}${historyText ? "\n" : ""}کاربر: ${prompt}` }],
        });
        replyText = response.choices[0]?.message?.content?.trim() || "";
        if (!replyText) throw new Error("Groq returned an empty response");
      } catch (error) { console.warn("Groq quota unavailable or request failed; falling back to Dify:", error); }
    }
    // Dify is always the first-choice provider so its included/free quota is
    // consumed before the paid OpenAI fallback, regardless of UI mode.
    if (!replyText && !hasImage && aiSettings.dify?.enabled && aiSettings.dify.baseUrl && aiSettings.dify.apiKey) {
      try {
        const response = await fetch(`${aiSettings.dify.baseUrl.replace(/\/$/, "")}/v1/chat-messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiSettings.dify.apiKey}` },
          body: JSON.stringify({ inputs: {}, query: input, response_mode: "blocking", user: "arca-erp" }),
        });
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok || !data.answer) throw new Error(data.message || `Dify request failed (${response.status})`);
        replyText = String(data.answer).replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
      } catch (error) { console.warn("Dify quota unavailable or request failed; falling back to OpenAI:", error); }
    }
    if (!replyText) {
      const openai = await getOpenAIClient();
      if (!openai) return res.json({ reply: "اتصال Dify برقرار نشد و کلید پشتیبان OpenAI نیز تنظیم نشده است.", action: null });
      const userText = `${historyText}${historyText ? "\n" : ""}کاربر: ${prompt}`;
      const input: any = hasImage ? [{ role: "user", content: [{ type: "input_text", text: userText }, { type: "input_image", image_url: attachment.imageData }] }] : userText;
      const response = await openai.responses.create({ model: "gpt-4o-mini", instructions, input, store: false });
      replyText = response.output_text || "پاسخی دریافت نشد.";
    }
    let action = null;
    const jsonMatch = replyText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) {
      try {
        action = JSON.parse(jsonMatch[1]);
      } catch {
        action = null;
      }
    }
    if (action && typeof action === "object") {
      const parsedAction: any = action;
      action = { actionType: parsedAction.actionType || parsedAction.type, payload: parsedAction.payload || parsedAction };
    }
    if (userRole !== "superadmin" && (action as any)?.actionType === "DESIGN_CHANGE_REQUEST") action = null;
    let actionNotice = "";
    if ((action as any)?.actionType === "SETTLE_ACCOUNTING_LIST") {
      if (!(["superadmin", "accountant"].includes(userRole))) {
        action = null;
        actionNotice = "\nثبت تسویه از دستیار برای این نقش مجاز نیست.";
      } else {
        const listId = String((action as any)?.payload?.listId || "");
        try {
          const latestDb = await readDatabase() as AppDatabase;
          const review = reviewListSettlement(latestDb, listId);
          if (review.blockers.length) {
            action = null;
            actionNotice = `\nتسویه ثبت نشد؛ موانع فعلی لیست:\n${review.blockers.map((item) => `- ${item}`).join("\n")}`;
          } else {
            action = { actionType: "SETTLE_ACCOUNTING_LIST", payload: { listId } };
          }
        } catch (error) {
          action = null;
          actionNotice = `\nلیست یا محاسبات تسویه قابل بررسی نیستند: ${error instanceof Error ? error.message : "خطای محاسبه"}`;
        }
      }
    }
    const visibleReply = (jsonMatch ? replyText.replace(jsonMatch[0], "").trim() : replyText) + actionNotice;
    res.json({ reply: visibleReply || "درخواست شما بررسی شد.", action });
  } catch (error: any) {
    console.error("OpenAI Assistant Error:", error);
    res.status(500).json({ error: "خطا در ارتباط با OpenAI", details: error.message || String(error) });
  }
});

app.post("/api/ai/parse-access-data", async (req, res) => {
  try {
    const { rawText, targetTable } = req.body;
    if (!rawText || typeof rawText !== "string") return res.status(400).json({ error: "متن ورودی خالی است." });
    const openai = await getOpenAIClient();
    if (!openai) return res.status(503).json({ error: "کلید OpenAI فعال نیست." });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: "داده ورودی را به یک آرایه JSON معتبر تبدیل کن. هیچ متن یا markdown دیگری ننویس.",
      input: `جدول هدف: ${targetTable || "auto-detect"}\n\n${rawText.slice(0, 15000)}`,
      store: false,
    });
    const cleaned = response.output_text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    const parsedData = JSON.parse(cleaned || "[]");
    res.json({ success: true, data: Array.isArray(parsedData) ? parsedData : [] });
  } catch (error: any) {
    res.status(500).json({ error: "خطا در پردازش داده‌ها", details: error.message });
  }
});

async function startServer() {
  const original = await readDatabase();
  if (original?.orders && original.cashPartners) {
    const normalized = normalizePartyDatabase(original);
    if (JSON.stringify(normalized) !== JSON.stringify(original)) {
      await fs.mkdir(backupDirectory, { recursive: true });
      await fs.copyFile(databasePath, path.join(backupDirectory, `party-identities-before-${Date.now()}.json`));
      await writeDatabase(normalized);
    }
  }
  await migrateEmbeddedAttachments();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Arca server running on http://0.0.0.0:${PORT}`));
}

startServer();
