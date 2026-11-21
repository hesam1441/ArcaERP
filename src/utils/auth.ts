export async function passwordHash(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`arca-v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
