create extension if not exists pgcrypto;
create table public.sources (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_type text not null check(source_type in ('chatgpt','gmail','gdrive','onedrive','ms365','upload','other')),
 source_name text not null, external_id text, source_uri text,
 access_scope text not null default 'private',
 sync_status text not null default 'pending' check(sync_status in ('pending','processing','complete','partial','failed','revoked')),
 last_synced_at timestamptz, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,source_type,external_id)
);
create table public.records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null references public.sources(id) on delete cascade,
 external_id text, record_type text not null, title text, author_name text,
 occurred_at timestamptz, version_label text, content_hash text,
 record_status text not null default 'active' check(record_status in ('active','superseded','deleted','closed')),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(source_id,external_id)
);
create table public.passages (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 record_id uuid not null references public.records(id) on delete cascade,
 ordinal integer not null, content text not null, citation_locator text, token_count integer,
 created_at timestamptz not null default now(), unique(record_id,ordinal)
);
create table public.decisions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 statement text not null, status text not null check(status in ('proposed','confirmed','superseded','disputed')),
 effective_at timestamptz,
 supporting_passage_id uuid references public.passages(id) on delete set null,
 supersedes_id uuid references public.decisions(id) on delete set null,
 rationale text, created_at timestamptz not null default now()
);
create table public.import_runs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid references public.sources(id) on delete set null,
 started_at timestamptz not null default now(), completed_at timestamptz,
 status text not null default 'processing' check(status in ('processing','complete','partial','failed')),
 records_seen integer not null default 0, records_imported integer not null default 0,
 records_failed integer not null default 0, error_summary text
);
alter table public.sources enable row level security;
alter table public.records enable row level security;
alter table public.passages enable row level security;
alter table public.decisions enable row level security;
alter table public.import_runs enable row level security;
create policy sources_owner_all on public.sources for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy records_owner_all on public.records for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy passages_owner_all on public.passages for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy decisions_owner_all on public.decisions for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy import_runs_owner_all on public.import_runs for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create index records_owner_source_idx on public.records(owner_id,source_id);
create index records_occurred_at_idx on public.records(owner_id,occurred_at desc);
create index passages_record_idx on public.passages(record_id,ordinal);
create index decisions_owner_status_idx on public.decisions(owner_id,status);
create index import_runs_owner_started_idx on public.import_runs(owner_id,started_at desc);
