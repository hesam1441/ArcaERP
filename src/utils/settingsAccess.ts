/** Settings access is determined by the authenticated server role, never a client permission list. */
export function validateSettingsWrite(current: any, candidate: any, role?: string): string | null {
  if (role === "superadmin") return null;
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : value;
  const same = (a: any, b: any) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const restricted = (settings: any) => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => !["theme", "language"].includes(key)));
  if (!same(restricted(current.settings), restricted(candidate.settings)) || !same(restricted(current.systemSettings), restricted(candidate.systemSettings))) return "فقط مدیر سیستم می‌تواند تنظیمات عمومی و اطلاعات شرکت را تغییر دهد.";
  for (const key of ["printTemplateConfig", "documentTemplates", "customFonts", "users", "rolePermissions", "roleDocumentPrintPermissions"]) {
    if (!same(current[key] ?? null, candidate[key] ?? null)) return "تغییر تنظیمات قالب اسناد و دسترسی کاربران فقط برای مدیر سیستم مجاز است.";
  }
  return null;
}
