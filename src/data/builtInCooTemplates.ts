import { DocumentTemplate, DocumentTemplateField } from "../types";

const field = (
  id: string, label: string, source: string, x: number, y: number, width: number, height: number,
  fontFamily = "Arial", fontSize = 10, bold = false, align: "left" | "center" | "right" = "left",
): DocumentTemplateField => ({
  id, label, source, x, y, width, height, fontFamily, fontSize, bold, align,
  color: "#111827", backgroundColor: "transparent", borderWidth: 0, zIndex: 2,
});

const createdAt = "2026-08-28T00:00:00.000Z";

export const builtInCooTemplates: DocumentTemplate[] = [
  {
    id: "builtin-coo-turkey", name: "COO · TURKEY", documentType: "COO", theme: "standard_berakem",
    issuerCompanyId: "", country: "TURKEY", imageData: "/templates/coo/turkey-certificate.png", backgroundColor: "#fffdf2",
    fontFamily: "Bebas Neue", fontSize: 11, isBuiltIn: true, isActive: true, createdAt,
    fields: [
      field("tr-barcode", "Barcode", "cooBarcode", 53.5, 2.1, 33, 6.6, "Arial", 10, true, "center"),
      field("tr-number", "Certificate No.", "documentNumber", 61, 10.8, 19, 3.6, "Times New Roman", 20, false),
      field("tr-exporter", "Exporter", "exporterBlock", 4.5, 14.59, 44, 8.8, "Bebas Neue", 14.67, false),
      field("tr-consignee", "Consignee", "consigneeBlock", 4.5, 28.65, 44, 8.8, "Bebas Neue", 14.67, false),
      field("tr-origin", "Country of Origin", "countryOfOrigin", 54, 33.65, 27, 3.8, "Bebas Neue", 14.67, false),
      field("tr-transport", "Transport Details", "transportMode", 4.5, 41.77, 44, 7.1, "Bebas Neue", 14.67, false),
      field("tr-goods", "Goods Description", "goodsDescription", 4.5, 54.83, 58, 19.6, "Bebas Neue", 14.67, false),
      field("tr-quantity", "Quantity", "quantityDetails", 65.3, 54.83, 20, 19.6, "Bebas Neue", 14.67, false, "center"),
      field("tr-goods-divider", "Goods Divider", "cooGoodsDivider", 6.19, 62.47, 75.5, 1, "Arial", 10, false),
      field("tr-date", "Issue Date", "documentDate", 58.19, 90.04, 17.3, 3.6, "Bebas Neue", 14.67, false, "center"),
    ],
  },
  {
    id: "builtin-coo-uae", name: "COO · UAE", documentType: "COO", theme: "standard_berakem",
    issuerCompanyId: "", country: "UAE", imageData: "/templates/coo/uae-certificate-clean.png", backgroundColor: "#ffffff",
    fontFamily: "Arial", fontSize: 9, isBuiltIn: true, isActive: true, createdAt,
    fields: [
      field("ae-exporter", "Exporter", "exporterBlock", 9, 3.5, 37, 7.2, "Arial", 9, true),
      field("ae-consignee", "Consignee", "consigneeBlock", 9, 13.2, 37, 7.2, "Arial", 9, true),
      field("ae-number", "Certificate No.", "documentNumber", 50, 18.7, 25, 2.5, "Arial", 9, true),
      field("ae-date", "Certificate Date", "documentDate", 84, 18.7, 10, 2.5, "Arial", 9, true, "center"),
      field("ae-transport", "Means of Transport", "transportMode", 9, 24.6, 37, 2.4, "Arial", 8, true),
      field("ae-etd", "Estimated Date of Departure", "etd", 9, 27.5, 37, 2.4, "Arial", 8, true),
      field("ae-port", "Port of Discharge", "portOfDischarge", 9, 30.3, 37, 2.4, "Arial", 8, true),
      field("ae-destination", "Country of Final Destination", "countryOfDestination", 50, 24.6, 42, 2.4, "Arial", 8, true),
      field("ae-invoice", "Invoice No. and Date", "invoiceNumberDate", 50, 27.5, 42, 2.4, "Arial", 8, true),
      field("ae-origin", "Country of Origin", "countryOfOrigin", 50, 30.3, 42, 2.4, "Arial", 8, true),
    ],
  },
  {
    id: "builtin-coo-korea", name: "COO · KOREA", documentType: "COO", theme: "standard_berakem",
    issuerCompanyId: "", country: "KOREA", imageData: "/templates/coo/korea.png", backgroundColor: "#ffffff",
    fontFamily: "Bebas Neue", fontSize: 10, isBuiltIn: true, isActive: true, createdAt,
    fields: [
      field("kr-exporter", "Exporter", "exporterBlock", 3.5, 3.3, 44, 10, "Bebas Neue", 11, true),
      field("kr-consignee", "Consignee", "consigneeBlock", 3.5, 16.2, 44, 8, "Bebas Neue", 11, true),
      field("kr-origin", "Country of Origin", "countryOfOrigin", 52, 17, 42, 3.2, "Bebas Neue", 12, true),
      field("kr-transport", "Transport Details", "transportDetails", 4.5, 29.3, 42, 7, "Bebas Neue", 10, true),
      field("kr-remarks", "Remarks", "remarks", 52, 24.7, 42, 9, "Bebas Neue", 10, false),
      field("kr-goods", "Goods Description", "goodsDescription", 4.5, 39.5, 67, 22, "Bebas Neue", 10, true),
      field("kr-invoice", "Proforma No. / Date", "invoiceNumberDate", 5.5, 54.8, 42, 3, "Bebas Neue", 9, true),
      field("kr-weight", "Net / Gross Weight", "weightDetails", 5.5, 58, 42, 3.5, "Bebas Neue", 9, true),
      field("kr-quantity", "Quantity", "quantityDetails", 77, 39.5, 18, 22, "Bebas Neue", 11, true, "center"),
    ],
  },
];

export function mergeBuiltInCooTemplates(templates: DocumentTemplate[] = []): DocumentTemplate[] {
  const existing = new Map(templates.map((template) => [template.id, template]));
  return [
    ...templates.filter((template) => !builtInCooTemplates.some((builtIn) => builtIn.id === template.id)),
    ...builtInCooTemplates.map((builtIn) => {
      const saved = existing.get(builtIn.id);
      const retiredFieldIds = ["tr-issuer-seal", "tr-authority-footer", "tr-authority-qr", "tr-authority-seal", "ae-marks", "ae-goods", "ae-quantity", "ae-certificate-number-mask", "ae-destination-mask"];
      const savedFields = (saved?.fields || []).filter((field) => !retiredFieldIds.includes(field.id));
      // Keep a user's edited layout intact while allowing newly required fields
      // (such as the issuer seal) to reach already-saved built-in templates.
      const fields = savedFields.length
        ? [
            ...savedFields.map((savedField) => {
              const builtInField = builtIn.fields.find((field) => field.id === savedField.id);
              // Keep an editor's geometry and appearance, but honor a source
              // correction required by the official background form.
              return builtInField ? { ...savedField, source: builtInField.source, label: builtInField.label, fontFamily: builtInField.fontFamily } : savedField;
            }),
            ...builtIn.fields.filter((field) => !savedFields.some((savedField) => savedField.id === field.id)),
          ]
        : builtIn.fields;
      return { ...builtIn, ...(saved || {}), fields, imageData: builtIn.imageData };
    }),
  ];
}
