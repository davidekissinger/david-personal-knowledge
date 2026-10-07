-- PRIVATE OPERATOR OUTPUT when populated. Never commit populated SQL.
-- No schema changes, functions, grants, owner enrollment, model calls, or network calls.
-- Each file is atomic; retry the same files after any interruption, then finalize.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $pk_import$
declare
  p jsonb := convert_from(decode('/*PAYLOAD_HEX*/','hex'),'UTF8')::jsonb;
  owner_uuid uuid := (p->>'owner')::uuid;
  bound_owner uuid;
  source_uuid uuid;
  run_uuid uuid := (p->>'run_id')::uuid;
  record_uuid uuid;
  existing public.records%rowtype;
  current_record public.records%rowtype;
  item jsonb;
  part jsonb;
  obs jsonb;
  export_hash text := p->'manifest'->>'export_sha256';
  receipt jsonb;
  imported integer := 0;
  duplicated integer := 0;
  new_status text;
  finished_count integer;
  expected_count integer := (p->>'batch_count')::integer;
begin
  if p->>'format' <> 'chatgpt-export-v1' or export_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Unsupported import envelope';
  end if;
  -- Admin execution is intentional. Do not grant clients write privileges to run this.
  -- Lock the binding so an owner change cannot race this transaction.
  select owner_id into bound_owner from private.app_control where singleton for share;
  if bound_owner is null or bound_owner <> owner_uuid or not exists (
      select 1 from auth.users where id=owner_uuid and email_confirmed_at is not null
  ) then
    raise exception 'Import denied: verified approved owner required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chatgpt-export-v1:' || owner_uuid::text,0));
  insert into public.sources(owner_id,source_type,source_name,external_id,access_scope,sync_status,metadata)
    values(owner_uuid,'chatgpt','ChatGPT private export archive','chatgpt-export-v1','private','processing',
      '{"importer":"chatgpt-export-v1","exports":{}}'::jsonb)
    on conflict(owner_id,source_type,external_id) do nothing;
  select id into source_uuid from public.sources
    where owner_id=owner_uuid and source_type='chatgpt' and external_id='chatgpt-export-v1'
      and access_scope='private' and sync_status <> 'revoked'
      and metadata->>'importer'='chatgpt-export-v1' for update;
  if source_uuid is null then
    raise exception 'Import denied: archive unavailable or revoked';
  end if;
  receipt := (p->'manifest') - 'prepared_at' - 'conversation_members';
  if (p->>'final')::boolean then
    select count(*) into finished_count from public.import_runs
      where owner_id=owner_uuid and source_id=source_uuid and status='complete'
      and id in (select value::uuid from jsonb_array_elements_text(p->'expected_runs'));
    if finished_count <> expected_count or expected_count < 1 then
      raise exception 'Import incomplete: finish every batch before finalizing';
    end if;
    if (select coalesce(sum(records_seen),0) from public.import_runs
        where owner_id=owner_uuid and source_id=source_uuid
        and id in (select value::uuid from jsonb_array_elements_text(p->'expected_runs')))
        <> (p->'manifest'->>'records')::integer then
      raise exception 'Import record totals do not match the manifest';
    end if;
    receipt := receipt || jsonb_build_object('status',case when (p->'manifest'->>'rejected')::integer > 0
      then 'partial' else 'complete' end, 'batch_count',expected_count);
    update public.sources set metadata=jsonb_set(metadata,array['exports',export_hash],receipt,true),
      last_synced_at=now(),updated_at=now() where id=source_uuid;
    update public.sources set sync_status=case when exists (
      select 1 from jsonb_each(metadata->'exports') e where e.value->>'status' <> 'complete'
    ) then 'partial' else 'complete' end where id=source_uuid;
    insert into public.import_runs(id,owner_id,source_id,status,records_seen,records_imported,records_failed,
      completed_at,error_summary)
      values(run_uuid,owner_uuid,source_uuid,receipt->>'status',(p->'manifest'->>'rejected')::integer,
        0,(p->'manifest'->>'rejected')::integer,now(),
        case when (p->'manifest'->>'rejected')::integer > 0
          then 'Some conversations were quarantined; inspect private rejected.json.' else null end)
      on conflict(id) do nothing;
  else
    if exists(select 1 from public.import_runs where id=run_uuid and owner_id=owner_uuid
      and source_id=source_uuid and status='complete') then
      return; -- The exact batch already committed; no duplicate passages or import runs.
    end if;
    if not exists(select 1 from public.sources where id=source_uuid and metadata->'exports' ? export_hash) then
      update public.sources set metadata=jsonb_set(metadata,array['exports',export_hash],
        receipt || '{"status":"processing"}'::jsonb,true),sync_status='partial',updated_at=now()
        where id=source_uuid;
    end if;
    insert into public.import_runs(id,owner_id,source_id,status,records_seen)
      values(run_uuid,owner_uuid,source_uuid,'processing',jsonb_array_length(p->'records'));
    for item in select value from jsonb_array_elements(p->'records') loop
      obs := item->'observation';
      select * into existing from public.records where source_id=source_uuid and owner_id=owner_uuid
        and external_id=item->>'external_id';
      if found then
        if existing.content_hash <> item->>'content_hash' then
          raise exception 'Record integrity conflict';
        end if;
        -- Preserve closed/deleted/superseded status; a repeated export never revives a record.
        if not coalesce(existing.metadata->'observations','[]'::jsonb) @> jsonb_build_array(obs) then
          update public.records set metadata=jsonb_set(metadata,'{observations}',
            coalesce(metadata->'observations','[]'::jsonb) || jsonb_build_array(obs)) where id=existing.id;
        end if;
        duplicated := duplicated + 1;
        continue;
      end if;
      select * into current_record from public.records
        where source_id=source_uuid and owner_id=owner_uuid
        and metadata->>'conversation_id'=item->>'conversation_id'
        and record_status in ('active','closed','deleted')
        order by created_at desc,id limit 1;
      new_status := 'active';
      if found then
        -- A deletion or explicit closure wins over a later export. Never undo it implicitly.
        if current_record.record_status = 'deleted' then
          continue; -- Do not repopulate content for a tombstoned conversation.
        elsif current_record.record_status = 'closed' then
          new_status := current_record.record_status;
        elsif (item->>'updated_at')::timestamptz > (current_record.metadata->>'source_updated_at')::timestamptz then
          update public.records set record_status='superseded' where id=current_record.id;
        else
          -- Older, equal-time, and undated snapshots cannot replace the current one.
          new_status := 'superseded';
        end if;
      end if;
      insert into public.records(owner_id,source_id,external_id,record_type,title,author_name,
        occurred_at,version_label,content_hash,record_status,metadata)
      values(owner_uuid,source_uuid,item->>'external_id','chatgpt_conversation_snapshot',item->>'title',
        'Mixed roles: user and assistant',(item->>'occurred_at')::timestamptz,
        'sha256:' || (item->>'content_hash'),item->>'content_hash',new_status,
        jsonb_build_object('importer','chatgpt-export-v1','conversation_id',item->>'conversation_id',
          'source_updated_at',item->'updated_at','observations',jsonb_build_array(obs),
          'omitted',item->'omitted','message_count',item->'message_count',
          'interpretation','Historical conversation evidence; assistant text is not a verified user fact'))
      returning id into record_uuid;
      for part in select value from jsonb_array_elements(item->'passages') loop
        insert into public.passages(owner_id,record_id,ordinal,content,citation_locator)
          values(owner_uuid,record_uuid,(part->>'ordinal')::integer,part->>'content',part->>'citation_locator');
      end loop;
      imported := imported + 1;
    end loop;
    update public.import_runs set status='complete',completed_at=now(),records_imported=imported,
      records_failed=0 where id=run_uuid;
  end if;
end
$pk_import$;
commit;
