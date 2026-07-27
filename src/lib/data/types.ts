// Ported verbatim from the old Gooey uploader script's CATEGORY_OPTIONS.
export const CATEGORY_OPTIONS = [
  "Groceries",
  "Eating Out (Stressed)",
  "Eating Out (Social)",
  "Social",
  "Health",
  "Rent",
  "School",
  "Transportation",
  "Gift",
  "Professional Development (including events)",
  "Travel",
  "Other",
] as const;

export interface Receipt {
  id: number;
  store: string;
  category: string;
  price: number;
  discount: number;
  discount_percentage: number;
  note: string | null;
  date: string; // YYYY-MM-DD, always treated as a plain string — never parsed with `new Date()`
}

export interface Disbursement {
  id: number;
  entity: string;
  amount: number;
  date_received: string; // YYYY-MM-DD
  reason: string | null;
  refunded_from_receipt: number | null;
}

export interface MergedReceipt extends Receipt {
  total_refunded: number;
  actual_price: number;
}

export interface NewReceiptInput {
  store: string;
  category: string;
  price: number;
  discount?: number;
  discount_percentage?: number;
  note?: string | null;
  date: string;
}

export interface NewDisbursementInput {
  entity: string;
  amount: number;
  date_received: string;
  reason?: string | null;
  refunded_from_receipt?: number | null;
}

export interface DataSource {
  loadReceipts(): Promise<Receipt[]>;
  loadDisbursements(): Promise<Disbursement[]>;
  loadMergedReceipts(): Promise<MergedReceipt[]>;
  insertReceipt(input: NewReceiptInput): Promise<Receipt>;
  insertDisbursement(input: NewDisbursementInput): Promise<Disbursement>;
}
