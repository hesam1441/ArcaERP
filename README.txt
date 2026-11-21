ARCA — Complete isolated design demo

This is the existing React/TypeScript frontend and Node server, with synthetic fixtures.
No production database, customer records, original attachments, passwords, environment files or original letterhead images are included. All displayed contacts/documents are fictional. Legacy schema property names remain for compatibility.

Run with Node.js 22:
  npm install
  npm run dev
  Open http://localhost:3035
Login: demo / Demo-2026!
Additional demonstration roles: demo1 through demo7, same demo password.
Production-style build: npm run build; npm start
Checks: npm run demo:verify
HTTP integration check after build: node sandbox/http-check.mjs
Reset only this demo: npm run demo:reset

Storage is forced to sandbox-data/arca-demo-database.json under THIS project.
Company ledgers, attachments and backups are also under sandbox-data.
No live server address or production storage mount is configured.
Ordinary editing, saving, calendar, reports and calculations run without external services.
Server-side PDF rendering requires installed Chromium. Set CHROMIUM_PATH if needed.
Docker option: docker compose up --build (dedicated demo volume, localhost port 3035).
Email, AI extraction and external account integrations require your own separately configured credentials; disconnected services are not simulated as successful.
Desktop Electron packaging is intentionally excluded; this is the actual web frontend/backend used for design work.
Some optional modules begin empty and support actual creation. Twelve fictional cases and their dependent data are included. A generated two-page COA and a marked sample BL are created on first startup. Blank SAMPLE backgrounds replace official forms.
Source-backup download expects arca-source.tar.gz; the included Dockerfile creates it. Ordinary local npm builds do not generate that archive automatically.

Full application coverage:
- Case list, search, active/inactive status, creation/editing, multi-item product lines.
- Customers, suppliers, goods, inquiries, supplier quotations and technical-document workflows.
- Agreement/invoice currencies, exchange rates, contract terms, purchases and freight.
- Case accounting, customer receipt, supplier payment, expenses, capital movements, commissions and settlement.
- Two-stage issuer/agent profit allocation, bank charge before issuer split, real and dummy data separation.
- Rial sales, own-account cases, financial groups and saved custom reports/lists.
- Cash treasury, currency balances, partners, customer/company ledgers and company finance workflows.
- Logistics, multiple shipments, task planning, calendar, correspondence and reporting.
- Settings, appearance, old/new interface switch, users/access, backup/import screens.
- Document issuance: PI, Commercial Invoice, Sales Contract, Packing List, COO, COA, Cover Letter and BL attachments.
- Shipment-specific Commercial Invoice/Packing/COO, preview, print, PDF, manual print-only corrections, uploaded COA with optional header/footer, editable document workflows.

AI Studio import:
The documented complete-project path is Build > Add files (+) > Import from GitHub.
Unpack the supplied ZIP locally, upload its CONTENTS to a dedicated repository, then import that repository. The ZIP is a transport archive, not an AI Studio attachment.
Do not upload the real application's repository or database.
https://aistudio.google.com/docs/aistudio-build-mode
The accompanying .txt source files are a review fallback, not a guaranteed runnable import mechanism. File-picker acceptance depends on the current AI Studio mode/interface.
Use AI-STUDIO-PROMPT.txt after importing. Return the modified complete source, not screenshots only.
