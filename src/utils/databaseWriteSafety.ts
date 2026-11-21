// A browser cache must never replace the production database with seed data.
// Deliberate bulk recovery belongs in the separate backup/restore workflow.
export function databaseWriteSafetyError(current: any, candidate: any, userId?: string): string | null {
  if (userId && current?.users?.some((user: any) => user.id === userId) &&
      !candidate?.users?.some((user: any) => user.id === userId)) {
    return "ذخیره متوقف شد: حساب فعال در دادهٔ ارسالی وجود ندارد. صفحه را تازه‌سازی کنید.";
  }
  for (const key of ["orders", "customers", "suppliers", "products", "cashEntries"]) {
    const before = current?.[key];
    const after = candidate?.[key];
    if (Array.isArray(before) && before.length >= 20 &&
        (!Array.isArray(after) || after.length < before.length / 2)) {
      return "ذخیره متوقف شد: دادهٔ ارسالی بخش بزرگی از اطلاعات سرور را حذف می‌کند. صفحه را تازه‌سازی کنید.";
    }
  }
  return null;
}
