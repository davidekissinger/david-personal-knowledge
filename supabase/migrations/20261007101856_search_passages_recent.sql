-- Ask / Search uses record dates before limiting the matching set.
-- The relevance-ranked RPC remains available for the existing AI evidence preview.
create function public.search_passages_recent(
  search_query text, max_results integer default 20, include_history boolean default false
)
returns table(
  passage_id uuid, record_id uuid, title text, author_name text, occurred_at timestamptz,
  record_status text, source_name text, source_uri text, citation_locator text,
  excerpt text, rank real
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select websearch_to_tsquery('english',left(coalesce(search_query,''),500)) as query
  )
  select p.id,r.id,r.title,r.author_name,r.occurred_at,r.record_status,
    s.source_name,s.source_uri,p.citation_locator,left(p.content,1400),
    ts_rank_cd(p.search_vector,q.query)
  from public.passages p
  join public.records r on r.id=p.record_id and r.owner_id=p.owner_id
  join public.sources s on s.id=r.source_id and s.owner_id=r.owner_id
  cross join q
  where p.search_vector @@ q.query
    and s.sync_status <> 'revoked' and r.record_status <> 'deleted'
    and (coalesce(include_history,false) or r.record_status <> 'superseded')
  order by r.occurred_at desc nulls last,ts_rank_cd(p.search_vector,q.query) desc,p.id
  limit least(greatest(coalesce(max_results,20),1),50);
$$;
revoke all on function public.search_passages_recent(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.search_passages_recent(text,integer,boolean) to authenticated;
notify pgrst, 'reload schema';
