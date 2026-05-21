import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const normalizeUsername = (username: unknown) => String(username ?? "").trim().toLowerCase();

export const isValidUsername = (username: string) => /^[a-z0-9_]{3,20}$/.test(normalizeUsername(username));

export const toJsonData = (value: unknown): unknown => {
  if (!value) return value;

  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonData);
  }

  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonData(entry)]));
  }

  return value;
};

export const mapDoc = (snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }): Record<string, unknown> => ({
  id: snapshot.id,
  ...(toJsonData(snapshot.data()) as Record<string, unknown>),
});
