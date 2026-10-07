"""Generate a rollback-only integration check using synthetic conversation content.

Run with --owner EXISTING_VERIFIED_UUID --output /private/outside/repo/check.sql.
Execute the output with an authorized database operator. It never commits.
"""
import argparse
import json
import os
from pathlib import Path
from test_chatgpt_import import ingest, conversation


def checks(owner):
    def manifest(export_hash, rejected=0):
        return {"export_sha256": export_hash, "records": 1, "rejected": rejected,
                "archive_uri": "private-archive:synthetic", "format": ingest.VERSION}

    def sql(text, updated, export_hash, final=False, rejected=0, target=None):
        c = conversation(text, updated)
        rec = ingest.normalize_conversation(c, "conversations.json", 0, export_hash)
        full = ingest.render_sql(target or owner, manifest(export_hash, rejected), [] if final else [rec],
                                 1 if final else 0, 1, final)
        return full[full.index("do $pk_import$"):full.rindex("commit;")]

    def fail(statement, expected):
        return f"""do $expect$ begin
          begin execute $attempt${statement}$attempt$;
            raise exception 'Expected rejection did not occur';
          exception when others then
            if position('{expected}' in SQLERRM)=0 then raise; end if;
          end;
        end $expect$;\n"""

    def assert_sql(condition, label):
        return f"do $check$ begin if not ({condition}) then raise exception 'Check failed: {label}'; end if; end $check$;\n"

    source = "source_id in (select id from public.sources where external_id='chatgpt-export-v1')"
    output = "begin;\n"
    output += assert_sql("not exists(select 1 from public.sources where external_id='chatgpt-export-v1')",
                         "check requires an unused importer source")
    output += fail(sql("Old", 1000, "a" * 64, target="00000000-0000-0000-0000-000000000001"), "approved owner required")
    output += sql("Old", 1000, "a" * 64)
    output += sql("Old", 1000, "a" * 64)  # exact retry
    output += assert_sql(f"(select count(*) from public.records where {source})=1", "exact retry record dedup")
    output += assert_sql("(select count(*) from public.import_runs where " + source + ")=1", "exact retry run dedup")
    output += sql("Old", 1000, "a" * 64, True)
    output += sql("Old", 1000, "b" * 64)
    output += assert_sql(f"(select count(*) from public.records where {source})=1", "overlapping export dedup")
    output += assert_sql(f"(select jsonb_array_length(metadata->'observations') from public.records where {source})=2", "both observations retained")
    output += sql("New", 3000, "c" * 64)
    output += sql("Middle", 2000, "d" * 64)
    output += assert_sql(f"(select count(*) from public.records where {source} and record_status='active')=1", "one active snapshot")
    output += assert_sql(f"(select metadata->>'source_updated_at' from public.records where {source} and record_status='active')='1970-01-01T00:50:00+00:00'", "older import cannot replace current")
    output += fail(sql("Missing", 4000, "e" * 64, True), "finish every batch")
    output += sql("Partial", 4000, "f" * 64, rejected=1)
    output += sql("Partial", 4000, "f" * 64, True, rejected=1)
    output += assert_sql("(select metadata->'exports'->('" + "f" * 64 + "')->>'status' from public.sources where external_id='chatgpt-export-v1')='partial'", "quarantine visible in receipt")
    output += "update public.sources set sync_status='revoked' where external_id='chatgpt-export-v1';\n"
    output += fail(sql("Revoked", 5000, "1" * 64), "archive unavailable or revoked")
    output += "update public.sources set sync_status='partial' where external_id='chatgpt-export-v1';\n"
    output += f"update public.records set record_status='deleted' where {source} and record_status='active';\n"
    output += sql("After deletion", 6000, "2" * 64)
    output += assert_sql(f"(select count(*) from public.records where {source} and record_status='active')=0", "no resurrection")
    output += assert_sql(f"(select count(*) from public.records where {source})=4", "deleted content not repopulated")
    # Deleted records are hidden by RLS, so use an unrelated synthetic conversation for read checks.
    rec = ingest.normalize_conversation({**conversation("Owner-visible marker"), "id": "other-synthetic"}, "conversations.json", 0, "3" * 64)
    full = ingest.render_sql(owner, manifest("3" * 64), [rec], 0, 1)
    output += full[full.index("do $pk_import$"):full.rindex("commit;")]
    output += f"select set_config('request.jwt.claims','{json.dumps({'sub': owner, 'role': 'authenticated'})}',true);\nset local role authenticated;\n"
    output += assert_sql(f"(select count(*) from public.records where {source} and record_status='active')=1", "owner read")
    output += fail("insert into public.sources(owner_id,source_type,source_name) values('" + owner + "','chatgpt','deny')", "permission denied")
    output += "reset role;\nselect set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-000000000002\",\"role\":\"authenticated\"}',true);\nset local role authenticated;\n"
    output += assert_sql("(select count(*) from public.sources)=0", "non-owner read denied")
    output += "reset role;\nset local role anon;\n"
    output += fail("select count(*) from public.sources", "permission denied")
    output += "reset role;\nrollback;\nselect 'ingestion checks passed; all fixtures rolled back' as result;\n"
    return output


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--owner", required=True)
    p.add_argument("--output", required=True, type=Path)
    a = p.parse_args()
    os.umask(0o077)
    path = ingest.outside_repository(a.output)
    with open(path, "x") as f:
        f.write(checks(a.owner))
