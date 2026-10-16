-- Additive S1 foundation. Singleton approval and read-only grants stay in place.
create table public.vaults (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 status text not null default 'active' check(status in ('active','suspended')),
 deployment_profile text not null default 'managed_shared' check(deployment_profile = 'managed_shared'),
 created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table public.vault_memberships (
 vault_id uuid not null,
 user_id uuid not null,
 role text not null default 'owner' check(role = 'owner'),
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(vault_id,user_id),
 foreign key(vault_id,user_id) references public.vaults(id,owner_id) on delete cascade
);
alter table public.vaults enable row level security;
alter table public.vault_memberships enable row level security;
revoke all on public.vaults, public.vault_memberships from public,anon,authenticated;
grant select on public.vaults, public.vault_memberships to authenticated;
create policy vault_owner_read on public.vaults for select to authenticated
 using(owner_id = (select auth.uid()));
create policy membership_self_read on public.vault_memberships for select to authenticated
 using(user_id = (select auth.uid()));
create index vault_memberships_user_idx on public.vault_memberships(user_id,vault_id);

-- Derive ownership from existing trusted rows, never from email or user metadata.
insert into public.vaults(owner_id)
 select owner_id from private.app_control where owner_id is not null
 union select owner_id from public.sources
 union select owner_id from public.records
 union select owner_id from public.passages
 union select owner_id from public.decisions
 union select owner_id from public.import_runs;
insert into public.vault_memberships(vault_id,user_id) select id,owner_id from public.vaults;

-- Legacy operator imports omit vault_id; resolve only the registered owner vault.
-- Invoker rights deliberately preserve the caller's privileges and RLS.
create function private.assign_record_vault() returns trigger
 language plpgsql security invoker set search_path = '' as $$
begin
 if new.vault_id is null then
   select id into new.vault_id from public.vaults where owner_id = new.owner_id;
 end if;
 if new.vault_id is null then raise exception 'A registered vault is required' using errcode='23514'; end if;
 if TG_OP = 'UPDATE' and (new.vault_id is distinct from old.vault_id or new.owner_id is distinct from old.owner_id) then
   raise exception 'Vault ownership is immutable' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function private.assign_record_vault() from public,anon,authenticated;

do $$
declare t text;
begin
 foreach t in array array['sources','records','passages','decisions','import_runs'] loop
   execute format('alter table public.%I add column vault_id uuid',t);
   execute format('update public.%I r set vault_id=v.id from public.vaults v where v.owner_id=r.owner_id',t);
   execute format('alter table public.%I alter column vault_id set not null',t);
   execute format('alter table public.%I add constraint %I foreign key(vault_id,owner_id) references public.vaults(id,owner_id)',t,t||'_vault_owner_fk');
   execute format('alter table public.%I add constraint %I unique(id,vault_id,owner_id)',t,t||'_id_vault_owner_key');
   execute format('create index %I on public.%I(vault_id)',t||'_vault_idx',t);
   execute format('create trigger assign_vault before insert or update on public.%I for each row execute function private.assign_record_vault()',t);
   execute format('create policy %I on public.%I as restrictive for all to authenticated using(vault_id in (select m.vault_id from public.vault_memberships m join public.vaults v on v.id=m.vault_id where m.user_id=(select auth.uid()) and m.revoked_at is null and v.status=''active'')) with check(vault_id in (select m.vault_id from public.vault_memberships m join public.vaults v on v.id=m.vault_id where m.user_id=(select auth.uid()) and m.revoked_at is null and v.status=''active''))',t||'_vault_membership',t);
 end loop;
end;
$$;
alter table public.records add constraint records_source_vault_fk foreign key(source_id,vault_id,owner_id) references public.sources(id,vault_id,owner_id);
alter table public.passages add constraint passages_record_vault_fk foreign key(record_id,vault_id,owner_id) references public.records(id,vault_id,owner_id);
alter table public.decisions add constraint decisions_passage_vault_fk foreign key(supporting_passage_id,vault_id,owner_id) references public.passages(id,vault_id,owner_id);
alter table public.decisions add constraint decisions_supersedes_vault_fk foreign key(supersedes_id,vault_id,owner_id) references public.decisions(id,vault_id,owner_id);
alter table public.import_runs add constraint import_runs_source_vault_fk foreign key(source_id,vault_id,owner_id) references public.sources(id,vault_id,owner_id);

create function public.my_vault() returns jsonb
 language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('id',v.id,'role',m.role,'deploymentProfile',v.deployment_profile,'status',v.status)
 from public.vaults v join public.vault_memberships m on m.vault_id=v.id
 where v.owner_id=(select auth.uid()) and m.user_id=(select auth.uid())
 and m.revoked_at is null and v.status='active' and (select private.is_app_owner());
$$;
revoke all on function public.my_vault() from public,anon,authenticated;
grant execute on function public.my_vault() to authenticated;
notify pgrst, 'reload schema';
