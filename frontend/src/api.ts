import { Platform } from "react-native";

export const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiToken(t: string | null) {
  authToken = t;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

export type User = {
  id: string;
  username: string;
  display_name: string;
  avatar_path?: string | null;
};

export type Book = {
  id: string;
  name: string;
  invite_code: string;
  members: User[];
};

export type Account = {
  id: string;
  name: string;
  kind: "bank" | "cash" | "ewallet";
  bank_name: string;
  account_number: string;
  initial_balance: number;
  balance: number;
};

export type Transaction = {
  id: string;
  type: "in" | "out";
  amount: number;
  category: string;
  note: string;
  source_type: "cash" | "account";
  account_id?: string | null;
  account_name?: string | null;
  date: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  qty: number;
  est_price: number;
  actual_price: number;
  done: boolean;
};

export type ShoppingPlan = {
  id: string;
  month: string;
  title: string;
  items: ShoppingItem[];
  created_by_name: string;
  created_at: string;
};

export type Summary = {
  balance: number;
  today_in: number;
  today_out: number;
  month_in: number;
  month_out: number;
  accounts: Account[];
};

export type Stats = {
  month: string;
  months: { month: string; label: string; income: number; expense: number }[];
  categories: { category: string; label: string; total: number; pct: number }[];
  month_in: number;
  month_out: number;
  avg_in: number;
  avg_out: number;
};

export type Goal = {
  set: boolean;
  title: string;
  target_amount: number;
  target_date: string | null;
  saved: number;
  remaining: number;
  progress: number;
  months_left: number | null;
  days_left: number | null;
  monthly_needed: number | null;
};

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401) unauthorizedHandler?.();
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(data?.detail ?? "Terjadi kesalahan, coba lagi", res.status);
  }
  return data as T;
}

export async function uploadFile<T = unknown>(
  path: string,
  file: { uri: string; name: string; mimeType: string },
): Promise<T> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as any);
  }
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });
  if (res.status === 401) unauthorizedHandler?.();
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.detail ?? "Gagal mengunggah berkas", res.status);
  }
  return data as T;
}
