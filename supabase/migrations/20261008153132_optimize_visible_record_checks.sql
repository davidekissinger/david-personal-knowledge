-- Evaluate visible parent sets once instead of running a correlated lookup per row.
-- Composite IDs retain the original parent/owner match, including source revocation.
alter policy records_source_visible on public.records using (
  record_status <> 'deleted' and (source_id, owner_id) in (
    select s.id, s.owner_id from public.sources s where s.sync_status <> 'revoked'
  )
);
alter policy passages_record_visible on public.passages using (
  (record_id, owner_id) in (select r.id, r.owner_id from public.records r)
);
