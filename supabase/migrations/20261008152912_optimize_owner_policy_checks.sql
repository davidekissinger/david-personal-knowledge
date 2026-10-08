-- Evaluate the stable request user ID once per policy evaluation plan.
-- Ownership predicates, restrictive approval gates, and grants are unchanged.
alter policy sources_owner_all on public.sources
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy records_owner_all on public.records
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy passages_owner_all on public.passages
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy decisions_owner_all on public.decisions
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy import_runs_owner_all on public.import_runs
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
