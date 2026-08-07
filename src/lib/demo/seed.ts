/**
 * The demo ledger, generated from scratch.
 *
 * **Entirely fictional.** No store, employer or amount here corresponds to
 * anything real — this is generated data, never anonymized production data.
 *
 * Three properties the rest of the demo depends on:
 *
 * 1. **Deterministic.** A fixed-seed PRNG, never `Math.random()`, so every
 *    visitor sees the same ledger and a bug is reproducible from a screenshot.
 * 2. **Anchored to today.** Every date is derived from `todayInZone`, never
 *    hardcoded — a demo whose newest receipt is eight months old reads as
 *    abandoned.
 * 3. **Deep enough for the digest.** `/reports/monthly` reads
 *    `DIGEST_BASELINE_MONTHS` (6) months behind its own month and takes
 *    big-spender medians over `BIG_SPENDER.medianMonths` (12), so anything
 *    shallower renders a projection with nothing to trim. Hence 13 months.
 *
 * Subscription charges are **back-generated with the real schedule math**
 * (`nthChargeDate`) and `charges_generated` is set to the count actually
 * written. Hand-picking that counter drifts against the derived schedule and
 * lights up the Overdue badge on a fresh demo.
 */
import { APP_TIMEZONE } from "@/lib/config";
import type {
  Disbursement,
  IntervalUnit,
  Receipt,
  Subscription,
} from "@/lib/data/types";
import {
  addMonthsToKey,
  daysInMonth,
  monthKeyOf,
  todayInZone,
} from "@/lib/dates";
import { nthChargeDate } from "@/lib/subscriptions";

import type { DemoDataset } from "./store";

/**
 * Months of history, counting the current (partial) one.
 *
 * 13 = the 12 the big-spender median window wants, plus the current month. Also
 * comfortably covers `DIGEST_BASELINE_MONTHS` behind the newest *complete*
 * month, which is the month the digest actually lands on.
 */
const HISTORY_MONTHS = 13;

/** Fixed, so the demo is the same ledger for everyone. */
const PRNG_SEED = 0x5eed1234;

/**
 * Bound to the store's own type rather than restated, so a field added to
 * `DemoDataset` is a build error here instead of a seed that silently omits it.
 * Type-only, so this is not a runtime cycle with `store.ts`.
 */
export type DemoSeed = DemoDataset;

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, and good enough for plausible-looking spend. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function int(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Two decimal places, like every price a real receipt carries. */
function money(rand: Rand, min: number, max: number): number {
  return Math.round((min + rand() * (max - min)) * 100) / 100;
}

/** Callers always pass a non-empty literal, so the fallback is unreachable — but `noUncheckedIndexedAccess` is on and it costs one line. */
function pick<T>(rand: Rand, items: readonly [T, ...T[]] | readonly T[]): T {
  const chosen = items[Math.floor(rand() * items.length)];
  return chosen ?? (items[0] as T);
}

// ---------------------------------------------------------------------------
// The fictional world
//
// Categories come from `CATEGORY_OPTIONS` in `src/lib/data/types.ts` and are a
// closed list — they are the app's real vocabulary, not part of the fiction.
// The store names are the invented half.
//
// "Professional Development (including events)" is deliberately absent from
// every profile below, so a visitor who filters to it reaches a real empty
// state rather than never finding one.
// ---------------------------------------------------------------------------

interface CategoryProfile {
  category: string;
  stores: readonly string[];
  /** Receipts per month, inclusive range. */
  perMonth: readonly [number, number];
  /** Price per receipt, inclusive range. */
  amount: readonly [number, number];
  /** Chance a given receipt carries a discount. */
  discountChance?: number;
}

const PROFILES: readonly CategoryProfile[] = [
  {
    category: "Groceries",
    stores: [
      "Harvest Lane Market",
      "Pinecrest Grocers",
      "The Corner Pantry",
      "Vale Foods",
    ],
    perMonth: [6, 10],
    amount: [18, 96],
    discountChance: 0.25,
  },
  {
    category: "Eating Out (Stressed)",
    stores: ["Nightowl Noodles", "Quickfire Wraps", "Third Cup Coffee"],
    perMonth: [3, 7],
    amount: [9, 29],
  },
  {
    category: "Eating Out (Social)",
    stores: ["Copper Kettle", "Lantern Room", "Birch & Barrel"],
    perMonth: [2, 5],
    amount: [16, 58],
  },
  {
    category: "Social",
    stores: ["Rialto Cinema", "Foxglove Bar", "Anchor Bowling"],
    perMonth: [1, 4],
    amount: [12, 64],
  },
  {
    category: "Health",
    stores: ["Willowbrook Pharmacy", "Ironhouse Gym", "Dr. Sandoval Dental"],
    perMonth: [0, 2],
    amount: [14, 145],
  },
  {
    category: "Transportation",
    stores: ["Metro Transit", "Ridewell", "Brightside Fuel"],
    perMonth: [3, 7],
    amount: [3, 48],
  },
  {
    category: "Gift",
    stores: ["Paper Crane Goods", "Wildflower Florist", "Harvest Lane Market"],
    perMonth: [0, 2],
    amount: [15, 92],
    discountChance: 0.2,
  },
  {
    category: "Other",
    stores: ["Ledger Hardware", "Tidepool Supply", "Kestrel Books"],
    perMonth: [1, 3],
    amount: [8, 74],
    discountChance: 0.15,
  },
];

/**
 * The excluded categories (`COMPARISON_EXCLUDED_CATEGORIES`) get bespoke
 * handling rather than a monthly-frequency profile.
 *
 * Seeding them at all is not optional: the weekly report's excluded strip and
 * the digest's big-spenders table both render empty without them, which hides
 * two features behind what looks like a working page.
 */
const RENT_STORE = "Maple Row Apartments";
const SCHOOL_STORE = "Hogwarts University";

/** One-offs — the rows the digest's big-spender rules exist to surface. */
const ONE_OFFS: readonly {
  /** Months back from the current month. */
  monthsAgo: number;
  day: number;
  store: string;
  category: string;
  price: number;
  note: string;
}[] = [
  {
    monthsAgo: 9,
    day: 14,
    store: "Ridewell Auto Service",
    category: "Transportation",
    price: 438.6,
    note: "Brake replacement",
  },
  {
    monthsAgo: 6,
    day: 22,
    store: "Dr. Sandoval Dental",
    category: "Health",
    price: 312.0,
    note: "Crown, after coverage",
  },
  {
    monthsAgo: 3,
    day: 8,
    store: "Kestrel Books",
    category: "Other",
    price: 989.99,
    note: "Replacement laptop",
  },
  {
    monthsAgo: 1,
    day: 17,
    store: "Copper Kettle",
    category: "Eating Out (Social)",
    price: 184.25,
    note: "Birthday dinner, paid for the whole table",
  },
];

const TRAVEL_TRIPS: readonly {
  monthsAgo: number;
  day: number;
  store: string;
  price: number;
  note: string;
}[] = [
  {
    monthsAgo: 11,
    day: 6,
    store: "Northwind Air",
    price: 512.4,
    note: "Flights home",
  },
  {
    monthsAgo: 7,
    day: 19,
    store: "Harbourview Inn",
    price: 386.0,
    note: "Conference stay",
  },
  {
    monthsAgo: 2,
    day: 11,
    store: "Northwind Air",
    price: 604.8,
    note: "Reading week trip",
  },
];

const SUBSCRIPTION_TEMPLATES: readonly {
  name: string;
  store: string;
  category: string;
  price: number;
  interval_unit: IntervalUnit;
  interval_count: number;
  /** Months back from the current month for the first charge. */
  startMonthsAgo: number;
  startDay: number;
  active: boolean;
  note: string | null;
}[] = [
  {
    name: "Streamly Standard",
    store: "Streamly",
    category: "Social",
    price: 17.99,
    interval_unit: "month",
    interval_count: 1,
    startMonthsAgo: 12,
    startDay: 4,
    active: true,
    note: null,
  },
  {
    name: "Ironhouse Gym",
    store: "Ironhouse Gym",
    category: "Health",
    price: 44.0,
    interval_unit: "month",
    interval_count: 1,
    startMonthsAgo: 12,
    startDay: 15,
    active: true,
    note: "Off-peak membership",
  },
  {
    name: "Cloudbox 200GB",
    store: "Cloudbox",
    category: "Other",
    price: 3.99,
    interval_unit: "month",
    interval_count: 1,
    startMonthsAgo: 12,
    startDay: 28,
    active: true,
    note: null,
  },
  {
    name: "Transit Pass",
    store: "Metro Transit",
    category: "Transportation",
    price: 62.5,
    interval_unit: "month",
    interval_count: 1,
    startMonthsAgo: 10,
    startDay: 1,
    active: true,
    note: null,
  },
  {
    name: "Domain renewal",
    store: "Tidepool Supply",
    category: "Other",
    price: 21.0,
    interval_unit: "year",
    interval_count: 1,
    startMonthsAgo: 12,
    startDay: 9,
    active: true,
    note: "Personal site",
  },
  {
    name: "Podcast+ (cancelled)",
    store: "Streamly",
    category: "Social",
    price: 6.99,
    interval_unit: "month",
    interval_count: 1,
    startMonthsAgo: 12,
    startDay: 20,
    active: false,
    note: "Paused — bundled with Streamly now",
  },
];

const INCOME_SOURCES: readonly {
  entity: string;
  amount: readonly [number, number];
  day: number;
}[] = [
  { entity: "Beacon Labs", amount: [1180, 1520], day: 15 },
  {
    entity: "Hogwarts University - Herbology Assistant",
    amount: [640, 940],
    day: 28,
  },
];

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** A receipt before it has an id — ids are assigned chronologically at the end. */
type ReceiptDraft = Omit<Receipt, "id" | "updated_at">;

function isoDate(monthKey: string, day: number): string {
  const clamped = Math.min(day, daysInMonth(monthKey));
  return `${monthKey}-${String(clamped).padStart(2, "0")}`;
}

/** Seeded rows carry a plausible "last edited" rather than today's clock. */
function stampFor(date: string): string {
  return `${date}T12:00:00.000Z`;
}

export function generateSeed(): DemoSeed {
  const rand = mulberry32(PRNG_SEED);
  const today = todayInZone(APP_TIMEZONE);
  const currentMonth = monthKeyOf(today);
  const todayDay = Number(today.slice(8, 10));

  // Oldest first, so the ids assigned below run in ledger order.
  const months: string[] = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i -= 1) {
    months.push(addMonthsToKey(currentMonth, -i));
  }

  const monthKeyAgo = (monthsAgo: number) =>
    addMonthsToKey(currentMonth, -monthsAgo);
  /** The current month is partial — nothing may be dated in the future. */
  const withinLedger = (date: string) => date <= today;

  const drafts: ReceiptDraft[] = [];

  const addDraft = (draft: ReceiptDraft) => {
    if (withinLedger(draft.date)) drafts.push(draft);
  };

  // --- Subscriptions, and the charges they have generated so far -----------
  //
  // Built first because their receipts are part of the ledger every other
  // figure reads, and because `charges_generated` must equal what was actually
  // written.
  const subscriptions: Subscription[] = [];
  SUBSCRIPTION_TEMPLATES.forEach((template, index) => {
    const startMonth = monthKeyAgo(template.startMonthsAgo);
    const start_date = isoDate(startMonth, template.startDay);
    const id = index + 1;

    let charges = 0;
    // A paused subscription stopped charging partway through, which is what
    // makes it look paused rather than merely absent.
    const stopAt = template.active
      ? today
      : isoDate(monthKeyAgo(4), template.startDay);

    for (;;) {
      const date = nthChargeDate(
        start_date,
        template.interval_unit,
        template.interval_count,
        charges,
      );
      if (date > stopAt) break;
      addDraft({
        store: template.store,
        category: template.category,
        price: template.price,
        discount: 0,
        discount_percentage: 0,
        // Matching what `insertSubscriptionCharge` writes — the subscription's
        // own note where it has one, its name otherwise. The human-readable
        // half of a generated row's provenance.
        note: template.note ?? template.name,
        date,
        subscription_id: id,
      });
      charges += 1;
    }

    subscriptions.push({
      id,
      name: template.name,
      store: template.store,
      category: template.category,
      price: template.price,
      interval_unit: template.interval_unit,
      interval_count: template.interval_count,
      start_date,
      charges_generated: charges,
      active: template.active,
      note: template.note,
      created_at: stampFor(start_date),
      updated_at: stampFor(start_date),
    });
  });

  // --- Habitual spend, month by month --------------------------------------
  for (const month of months) {
    const lastDay = month === currentMonth ? todayDay : daysInMonth(month);

    for (const profile of PROFILES) {
      const count = int(rand, profile.perMonth[0], profile.perMonth[1]);
      // A partial month gets a proportional share, so the current month doesn't
      // read as a spike on the 3rd.
      const scaled = Math.round((count * lastDay) / daysInMonth(month));
      for (let i = 0; i < scaled; i += 1) {
        const price = money(rand, profile.amount[0], profile.amount[1]);
        const hasDiscount =
          profile.discountChance !== undefined &&
          rand() < profile.discountChance;
        addDraft({
          store: pick(rand, profile.stores),
          category: profile.category,
          price,
          discount: hasDiscount ? Math.round(price * 0.1 * 100) / 100 : 0,
          discount_percentage: hasDiscount && rand() < 0.4 ? 10 : 0,
          note: null,
          date: isoDate(month, int(rand, 1, lastDay)),
          subscription_id: null,
        });
      }
    }

    // Rent — one charge, first of the month, with a renewal increase partway
    // through so the excluded strip has something to show a change against.
    const monthsBack = months.length - 1 - months.indexOf(month);
    addDraft({
      store: RENT_STORE,
      category: "Rent",
      price: monthsBack >= 6 ? 1150 : 1195,
      discount: 0,
      discount_percentage: 0,
      note: null,
      date: isoDate(month, 1),
      subscription_id: null,
    });

    // School — tuition instalments land in September and January only.
    const monthNumber = month.slice(5, 7);
    if (monthNumber === "09" || monthNumber === "01") {
      addDraft({
        store: SCHOOL_STORE,
        category: "School",
        price: monthNumber === "09" ? 2480 : 2415,
        discount: 0,
        discount_percentage: 0,
        note: "Tuition instalment",
        date: isoDate(month, 5),
        subscription_id: null,
      });
    }
  }

  // --- The lumpy rows ------------------------------------------------------
  for (const trip of TRAVEL_TRIPS) {
    addDraft({
      store: trip.store,
      category: "Travel",
      price: trip.price,
      discount: 0,
      discount_percentage: 0,
      note: trip.note,
      date: isoDate(monthKeyAgo(trip.monthsAgo), trip.day),
      subscription_id: null,
    });
  }

  for (const oneOff of ONE_OFFS) {
    addDraft({
      store: oneOff.store,
      category: oneOff.category,
      price: oneOff.price,
      discount: 0,
      discount_percentage: 0,
      note: oneOff.note,
      date: isoDate(monthKeyAgo(oneOff.monthsAgo), oneOff.day),
      subscription_id: null,
    });
  }

  // --- Ids, assigned oldest-first so they read as an append-only ledger ----
  drafts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const receipts: Receipt[] = drafts.map((draft, index) => ({
    ...draft,
    id: index + 1,
    updated_at: stampFor(draft.date),
  }));

  // --- Disbursements -------------------------------------------------------
  const disbursements: Disbursement[] = [];
  let disbursementId = 1;

  const addDisbursement = (row: Omit<Disbursement, "id" | "updated_at">) => {
    if (!withinLedger(row.date_received)) return;
    disbursements.push({
      ...row,
      id: disbursementId,
      updated_at: stampFor(row.date_received),
    });
    disbursementId += 1;
  };

  for (const month of months) {
    for (const source of INCOME_SOURCES) {
      addDisbursement({
        entity: source.entity,
        amount: money(rand, source.amount[0], source.amount[1]),
        date_received: isoDate(month, source.day),
        reason: "Pay",
        // Standalone income, not a refund — this is the distinction
        // `mergeReceipts` and the /disbursements filter both key off.
        refunded_from_receipt: null,
      });
    }
  }

  // Refunds against real receipts, including one that fully cancels its
  // receipt — that row is the reachable case for the Daily chart's
  // "omit receipts worth <= 0 net" rule, which is otherwise invisible.
  const refundable = receipts.filter(
    (r) => r.subscription_id === null && r.price >= 25 && r.category !== "Rent",
  );
  const refundCount = Math.min(7, refundable.length);
  for (let i = 0; i < refundCount; i += 1) {
    // Spread across the ledger rather than clustered at one end.
    const target =
      refundable[Math.floor((refundable.length / refundCount) * i)];
    if (!target) continue;
    const full = i === refundCount - 1;
    addDisbursement({
      entity: target.store,
      amount: full
        ? target.price
        : Math.round(target.price * money(rand, 0.25, 0.6) * 100) / 100,
      // Same day as the purchase, not a few days later: dating it forward could
      // push a refund of a recent receipt past `today`, where `withinLedger`
      // silently drops it — and the last one generated is the full refund that
      // exists to make the Daily chart's "omit receipts <= 0 net" rule reachable.
      date_received: target.date,
      reason: full ? "Returned — did not fit" : "Partial refund",
      refunded_from_receipt: target.id,
    });
  }

  return {
    receipts,
    disbursements,
    subscriptions,
    nextId: {
      receipts: receipts.length + 1,
      disbursements: disbursementId,
      subscriptions: subscriptions.length + 1,
    },
  };
}
