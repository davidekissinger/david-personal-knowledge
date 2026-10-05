-- Additive hardening of the existing, empty personal-knowledge project.
-- No owner is automatically enrolled. Read/write access fails closed.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create table private.app_control (
  singleton boolean primary key default true check (singleton),
  owner_id uuid references auth.users(id) on delete set null
);
alter table private.app_control enable row level security;
revoke all on private.app_control from public, anon, authenticated;
insert into private.app_control(singleton, owner_id) values (true, null);

create function private.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.app_control c where c.singleton and c.owner_id = auth.uid()
  );
$$;
revoke all on function private.is_app_owner() from public, anon, authenticated;
grant execute on function private.is_app_owner() to authenticated;

-- Keep current owner policies; an additional RESTRICTIVE policy must also pass.
create policy sources_approved_owner on public.sources as restrictive for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
create policy records_approved_owner on public.records as restrictive for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
create policy passages_approved_owner on public.passages as restrictive for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
create policy decisions_approved_owner on public.decisions as restrictive for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
create policy import_runs_approved_owner on public.import_runs as restrictive for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));

create policy records_source_visible on public.records as restrictive for select to authenticated
  using (record_status <> 'deleted' and exists (
    select 1 from public.sources s where s.id = source_id and s.owner_id = records.owner_id and s.sync_status <> 'revoked'
  ));
create policy passages_record_visible on public.passages as restrictive for select to authenticated
  using (exists (select 1 from public.records r where r.id = record_id and r.owner_id = passages.owner_id));
create policy decisions_evidence_visible on public.decisions as restrictive for select to authenticated
  using (supporting_passage_id is null or exists (
    select 1 from public.passages p where p.id = supporting_passage_id and p.owner_id = decisions.owner_id
  ));

-- Future imports cannot attach a child record to a different owner's parent.
alter table public.sources add constraint sources_id_owner_key unique(id,owner_id);
alter table public.records add constraint records_id_owner_key unique(id,owner_id);
alter table public.passages add constraint passages_id_owner_key unique(id,owner_id);
alter table public.decisions add constraint decisions_id_owner_key unique(id,owner_id);
alter table public.records add constraint records_source_owner_fk foreign key(source_id,owner_id) references public.sources(id,owner_id) on delete cascade;
alter table public.passages add constraint passages_record_owner_fk foreign key(record_id,owner_id) references public.records(id,owner_id) on delete cascade;
alter table public.decisions add constraint decisions_passage_owner_fk foreign key(supporting_passage_id,owner_id) references public.passages(id,owner_id);
alter table public.decisions add constraint decisions_supersedes_owner_fk foreign key(supersedes_id,owner_id) references public.decisions(id,owner_id);
alter table public.import_runs add constraint import_runs_source_owner_fk foreign key(source_id,owner_id) references public.sources(id,owner_id);

-- Enforce a genuinely read-only release at the database, not only in the UI.
revoke all on public.sources, public.records, public.passages, public.decisions, public.import_runs from anon, authenticated;
grant select on public.sources, public.records, public.passages, public.decisions, public.import_runs to authenticated;

alter table public.passages add column search_vector tsvector generated always as (to_tsvector('english', content)) stored;
create index passages_search_idx on public.passages using gin(search_vector);
create index passages_owner_idx on public.passages(owner_id);
create index decisions_supporting_passage_idx on public.decisions(supporting_passage_id,owner_id);
create index decisions_supersedes_idx on public.decisions(supersedes_id,owner_id);

create function public.app_access() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('approved',private.is_app_owner(),'importsEnabled',false,'aiEnabled',false);
$$;
create function public.knowledge_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sources',(select count(*) from public.sources),
    'records',(select count(*) from public.records),
    'passages',(select count(*) from public.passages),
    'decisions',(select count(*) from public.decisions),
    'importsEnabled',false,'aiEnabled',false
  );
$$;
create function public.search_passages(search_query text, max_results integer default 20, include_history boolean default false)
returns table(passage_id uuid,record_id uuid,title text,author_name text,occurred_at timestamptz,record_status text,source_name text,source_uri text,citation_locator text,excerpt text,rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english',left(coalesce(search_query,''),500)) as query)
  select p.id,r.id,r.title,r.author_name,r.occurred_at,r.record_status,s.source_name,s.source_uri,p.citation_locator,left(p.content,1400),ts_rank_cd(p.search_vector,q.query)
  from public.passages p join public.records r on r.id=p.record_id and r.owner_id=p.owner_id
  join public.sources s on s.id=r.source_id and s.owner_id=r.owner_id cross join q
  where p.search_vector @@ q.query and s.sync_status <> 'revoked' and r.record_status <> 'deleted'
    and (coalesce(include_history,false) or r.record_status <> 'superseded')
  order by ts_rank_cd(p.search_vector,q.query) desc,r.occurred_at desc nulls last,p.id
  limit least(greatest(coalesce(max_results,20),1),50);
$$;
revoke all on function public.app_access(), public.knowledge_summary(), public.search_passages(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.app_access(), public.knowledge_summary(), public.search_passages(text,integer,boolean) to authenticated;
notify pgrst, 'reload schema';
