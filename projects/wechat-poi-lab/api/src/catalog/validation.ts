export type ProductInput = {
  storeId: number;
  name: string;
  description: string;
  originalPrice: number;
  salePrice: number;
  stock: number;
  validDays: number;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
};

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseProductInput(body: unknown): ProductInput | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const { storeId, name, description, originalPrice, salePrice, stock, validDays, status } = value;
  if (!positiveId(storeId)) return null;
  if (typeof name !== "string" || !name.trim() || name.length > 120) return null;
  if (typeof description !== "string" || description.length > 2000) return null;
  if (!positiveId(originalPrice) || !positiveId(salePrice) || salePrice > originalPrice || originalPrice > 4_294_967_295) return null;
  if (typeof stock !== "number" || !Number.isSafeInteger(stock) || stock < 0 || stock > 4_294_967_295) return null;
  if (typeof validDays !== "number" || !Number.isSafeInteger(validDays) || validDays < 1 || validDays > 365) return null;
  if (status !== "DRAFT" && status !== "ACTIVE" && status !== "INACTIVE") return null;
  return { storeId, name: name.trim(), description, originalPrice, salePrice, stock, validDays, status };
}

export function parseId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
