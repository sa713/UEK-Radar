export function normalizeTelegramUsername(value: unknown): string | null {
 if(typeof value!=="string")return null;
 const username=value.trim().replace(/^@/,"");
 return /^[A-Za-z0-9_]{5,32}$/.test(username)?username.toLowerCase():null;
}

export function isAdminUsername(username: unknown, configured: unknown): boolean {
 const expected=normalizeTelegramUsername(configured);
 return Boolean(expected&&normalizeTelegramUsername(username)===expected);
}
