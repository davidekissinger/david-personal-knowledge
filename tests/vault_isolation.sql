-- Operator-only regression test. All fixtures, enrollment changes and grants roll back.
-- Run after the migration with ON_ERROR_STOP. Never commit actual user IDs here.
begin;
set local statement_timeout = '30s';
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','vault-a@example.invalid',now()),
 ('22222222-2222-4222-8222-222222222222','vault-b@example.invalid',now());
insert into public.vaults(id,owner_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.vault_memberships(vault_id,user_id) select id,owner_id from public.vaults where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.sources(id,owner_id,source_type,source_name,external_id,sync_status) values
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','upload','Same source','same-source','complete'),
 ('bbbbbbbb-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','upload','Same source','same-source','complete');
insert into public.records(id,owner_id,source_id,external_id,record_type,title) values
 ('aaaaaaaa-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','same-record','note','Same title'),
 ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000001','same-record','note','Same title');
insert into public.passages(id,owner_id,record_id,ordinal,content) values
 ('aaaaaaaa-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000002',0,'vaultisolationfixture A'),
 ('bbbbbbbb-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002',0,'vaultisolationfixture B');
insert into public.decisions(owner_id,statement,status,supporting_passage_id) values
 ('11111111-1111-4111-8111-111111111111','Synthetic A','proposed','aaaaaaaa-0000-4000-8000-000000000003'),
 ('22222222-2222-4222-8222-222222222222','Synthetic B','proposed','bbbbbbbb-0000-4000-8000-000000000003');
insert into public.import_runs(owner_id,source_id) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000001');

-- Forged parent, ownership and vault references must fail even for operator writes.
do $$ begin
 begin
   insert into public.records(owner_id,source_id,record_type) values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-0000-4000-8000-000000000001','note');
   raise exception 'cross-owner parent accepted';
 exception when foreign_key_violation then null; end;
 begin
   insert into public.sources(owner_id,vault_id,source_type,source_name) values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','upload','forged');
   raise exception 'cross-vault insert accepted';
 exception when foreign_key_violation then null; end;
 begin
   update public.records set vault_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='aaaaaaaa-0000-4000-8000-000000000002';
   raise exception 'ownership reassignment accepted';
 exception when check_violation then null; end;
end $$;

-- Exercise both identities independently under the unchanged singleton gate.
-- Temporary enrollment is invisible outside this transaction and rolls back.
update private.app_control set owner_id='11111111-1111-4111-8111-111111111111' where singleton;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.vaults) <> 1 or (select count(*) from public.records) <> 1
 or (select count(*) from public.sources) <> 1 or (select count(*) from public.passages) <> 1
 or (select count(*) from public.decisions) <> 1 or (select count(*) from public.import_runs) <> 1 then raise exception 'A isolation failed'; end if;
 if (select count(*) from public.passages where id='bbbbbbbb-0000-4000-8000-000000000003') <> 0 then raise exception 'direct ID leak'; end if;
 if (select count(*) from public.search_passages('vaultisolationfixture')) <> 1 or (select count(*) from public.search_passages_recent('vaultisolationfixture')) <> 1 then raise exception 'search isolation failed'; end if;
 if public.my_vault()->>'id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then raise exception 'wrong vault context'; end if;
 if has_table_privilege('authenticated','public.records','INSERT') or has_table_privilege('authenticated','public.vault_memberships','UPDATE') then raise exception 'unexpected write privilege'; end if;
end $$;
reset role;
update public.vault_memberships set revoked_at=now() where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$ begin
 if (select count(*) from public.records) <> 0 or (select count(*) from public.passages) <> 0 or public.my_vault() is not null
 or (select count(*) from public.search_passages('vaultisolationfixture')) <> 0 then raise exception 'revocation failed'; end if;
end $$;
reset role;
update public.vault_memberships set revoked_at=null where user_id='11111111-1111-4111-8111-111111111111';
update public.vaults set status='suspended' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
do $$ begin
 if (select count(*) from public.records) <> 0 or public.my_vault() is not null then raise exception 'suspension failed'; end if;
end $$;
reset role;
update private.app_control set owner_id='22222222-2222-4222-8222-222222222222' where singleton;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.records) <> 1 or (select count(*) from public.passages) <> 1
 or (select count(*) from public.sources) <> 1 or (select count(*) from public.decisions) <> 1
 or (select count(*) from public.import_runs) <> 1 then raise exception 'B isolation failed'; end if;
 if public.my_vault()->>'id' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then raise exception 'B context failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 if has_table_privilege('anon','public.records','SELECT') or has_function_privilege('anon','public.my_vault()','EXECUTE') then raise exception 'anonymous access granted'; end if;
end $$;
reset role;
select 'vault isolation, revocation, suspension, parent constraints, read-only and anonymous checks passed' as result;
rollback;
