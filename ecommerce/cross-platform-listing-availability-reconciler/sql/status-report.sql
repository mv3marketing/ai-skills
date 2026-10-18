-- Read-only status endpoint for the "VTI inventory QA audit" Claude Routine.
--
-- The Routine previously depended on the Supabase MCP connector. It had none
-- attached, so it fired daily, returned SUCCEEDED in ~15 seconds and audited
-- nothing - a false green light. Routine prompts cannot attach a connector from
-- the tools available here, so the dependency is removed instead: pg_cron
-- already computes the audit and the liveness verdict on schedule, and the
-- Routine reads the result over plain HTTPS with the publishable anon key.
--
-- Deliberately STABLE and read-only. A publishable key can therefore trigger no
-- writes; everything that writes stays behind pg_cron. The report carries the
-- freshness and exit status of every vti-* job, so a stale or failed pipeline is
-- visible in the payload and cannot be mistaken for a clean audit.
--
-- Called by the Routine as:
--   POST https://<ref>.supabase.co/rest/v1/rpc/vti_status_report
--   apikey + Authorization: Bearer <anon key>

create or replace function public.vti_status_report()
returns jsonb language sql stable security definer set search_path to 'vti','public' as $f$
  with liv as (select vti.liveness_metrics('poshmark',7) m),
  jobs as (select jsonb_agg(jsonb_build_object('job',j.jobname,'last_run',d.last_start,
                    'last_status',d.last_status,'failures_24h',d.f24) order by j.jobname) a
           from cron.job j left join lateral (
             select max(start_time) last_start,
                    (array_agg(status order by start_time desc))[1] last_status,
                    count(*) filter (where status<>'succeeded'
                                     and start_time>now()-interval '24 hours') f24
               from cron.job_run_details r where r.jobid=j.jobid) d on true
           where j.jobname like 'vti-%'),
  q as (select count(*) filter (where status in ('open','in_progress')
                                and vti.is_removal_task(reason)) removals,
               count(*) filter (where status in ('open','in_progress')
                                and not vti.is_removal_task(reason)) alerts,
               count(*) filter (where status='resolved') resolved
          from vti.work_queue),
  qa as (select to_jsonb(x) a from (
           select ran_at, severity, finding, details from vti.audit_log
            where agent='qa_auditor' order by ran_at desc limit 1) x),
  snap as (select jsonb_build_object('newest',max(fetched_at),
             'untrusted_of_last_24',count(*) filter (where not trusted),
             'incomplete_of_last_24',count(*) filter (where not complete)) a
           from (select * from vti.snapshots where platform_slug='poshmark'
                  order by fetched_at desc limit 24) s),
  f as (select jsonb_agg(x) a from (
          select severity, finding, ran_at from vti.audit_log
           where severity in ('critical','high') and ran_at > now()-interval '36 hours'
           order by ran_at desc limit 10) x)
  select jsonb_build_object('generated_at',now(),'liveness',liv.m,'cron',jobs.a,
    'snapshots',snap.a,'last_qa_audit',coalesce(qa.a,'null'::jsonb),
    'queue',jsonb_build_object('open_removals',q.removals,'open_alerts',q.alerts,
                               'resolved_ever',q.resolved),
    'recent_findings',coalesce(f.a,'[]'::jsonb))
  from liv,jobs,q,qa,snap,f
$f$;

grant execute on function public.vti_status_report() to anon, authenticated;
notify pgrst, 'reload schema';
