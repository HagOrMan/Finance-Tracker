-- ============================================================================
-- 002_mutable_rows.sql — makes receipts and disbursements editable.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run. Run AFTER finance_tracker_schema.sql.
--
-- AFTERWARDS
--   Regenerate src/types/database.ts and take the output verbatim:
--     npx supabase gen types typescript --project-id <ref> \
--       --schema public --schema finance_tracker
--   (Keep the whole file, including the other apps' `public` tables — see
--   PROGRESS.md for why deleting the `public` key collapses Tables/Insert/
--   Update to `never` with no error.)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. updated_at
--
-- Un-backfillable later — once an edit happens there is no record of when it
-- happened — so the column has to exist before the first edit does. Existing
-- rows get now(), which is a lie about *when* but honest about the ordering:
-- nothing had been edited before this migration ran.
-- ---------------------------------------------------------------------------
alter table finance_tracker.receipts
    add column if not exists updated_at timestamptz not null default now();
alter table finance_tracker.disbursements
    add column if not exists updated_at timestamptz not null default now();

create or replace function finance_tracker.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists receipts_set_updated_at on finance_tracker.receipts;
create trigger receipts_set_updated_at
    before update on finance_tracker.receipts
    for each row execute function finance_tracker.set_updated_at();

drop trigger if exists disbursements_set_updated_at on finance_tracker.disbursements;
create trigger disbursements_set_updated_at
    before update on finance_tracker.disbursements
    for each row execute function finance_tracker.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Privileges
--
-- Idempotent restatement of the grants the app now genuinely needs. These were
-- already present at the bottom of finance_tracker_schema.sql; repeating them
-- here makes this file self-contained and the intent explicit.
--
-- A custom schema inherits no default privileges, so this is not ceremony —
-- without it every UPDATE and DELETE fails 42501 before RLS is even consulted.
-- ---------------------------------------------------------------------------
grant update, delete on
    finance_tracker.receipts,
    finance_tracker.disbursements
    to service_role;


-- ---------------------------------------------------------------------------
-- 3. Indexes for the hygiene pages
--
-- Bulk recategorize / rename / merge scans by store (Stores page) and by entity
-- (Entities tab); the existing indexes are date-only. The bulk *write* itself
-- is id-list based and rides the primary key — these support the grouping and
-- candidate-matching reads that precede it.
-- ---------------------------------------------------------------------------
create index if not exists receipts_store_idx
    on finance_tracker.receipts (store);

create index if not exists disbursements_entity_idx
    on finance_tracker.disbursements (entity);
