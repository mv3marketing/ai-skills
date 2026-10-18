-- VTI actuator liveness monitor (Supabase project ljixfxazhmskkufcgxie, schema vti).
--
-- Replaces a monitor whose if/elsif chain asserted that whichever direction it
-- had not just measured "still works". On 13 Oct it reported "inbound stopped
-- while delisting still works"; on 15 Oct, "delisting stopped while
-- cross-listing still works". Both were false: nothing had arrived for 8 days
-- and removals were running at ~1/day. Each direction is now judged only on its
-- own evidence, and an actuator that moves but cannot clear its backlog is
-- reported as degraded rather than alive.
--
-- Applied as CREATE OR REPLACE under the original (text, integer) signature so
-- the existing pg_cron job `vti-actuator-liveness` keeps working unchanged.

-- One pass over consecutive complete snapshots: what vanished, what appeared.
create or replace function vti.storefront_transitions(p_platform text)
returns table (fetched_at timestamptz, gone integer, appeared integer)
language sql stable security definer set search_path to 'vti','public' as $f$
  with ordered as (
    select id, fetched_at, lag(id) over (order by fetched_at) prev_id
      from vti.snapshots where platform_slug = p_platform and complete
  )
  select o.fetched_at,
    (select count(*)::int from vti.snapshot_items pi
      where pi.snapshot_id = o.prev_id
        and not exists (select 1 from vti.snapshot_items ci
                         where ci.snapshot_id = o.id
                           and ci.external_listing_id = pi.external_listing_id)),
    (select count(*)::int from vti.snapshot_items ci
      where ci.snapshot_id = o.id
        and not exists (select 1 from vti.snapshot_items pi
                         where pi.snapshot_id = o.prev_id
                           and pi.external_listing_id = ci.external_listing_id))
  from ordered o where o.prev_id is not null
$f$;

-- Work meaning "this should no longer be listed". Deliberately excludes the
-- monitor's own alerts, which would otherwise count as their own demand.
create or replace function vti.is_removal_task(p_reason text)
returns boolean language sql immutable as $f$
  select p_reason like 'Sold %' or p_reason like 'DUPLICATE LIVE LISTING%'
$f$;

-- Raise a finding once. The previous monitor de-duplicated only on
-- 'Actuator appears DEAD%', so every 6-hourly run inserted another row and
-- buried the real removal backlog under 34 copies of its own alert.
create or replace function vti.raise_finding(
  p_agent text, p_platform text, p_msg text, p_severity text,
  p_details jsonb, p_dedupe_prefix text)
returns void
language plpgsql security definer set search_path to 'vti','public' as $f$
begin
  insert into vti.audit_log (agent, finding, severity, details)
  values (p_agent, p_msg, p_severity, p_details);

  insert into vti.work_queue (platform_slug, action, reason, severity, assignee)
  select p_platform, 'manual_review', p_msg, p_severity, 'human'
   where not exists (
     select 1 from vti.work_queue w
      where w.platform_slug = p_platform
        and w.status in ('open','in_progress')
        and w.action = 'manual_review'
        and w.reason like p_dedupe_prefix || '%');
end;
$f$;

-- Raw numbers only, no verdict.
create or replace function vti.liveness_metrics(p_platform text, p_window_days int default 7)
returns jsonb language sql stable security definer set search_path to 'vti','public' as $f$
  with t as materialized (select * from vti.storefront_transitions(p_platform)),
  s as (select max(fetched_at) hi from vti.snapshots where platform_slug=p_platform and complete),
  a as (select min(fetched_at) lo,
          max(fetched_at) filter (where gone>0) lg,
          max(fetched_at) filter (where appeared>0) ln,
          coalesce(sum(gone)     filter (where fetched_at > (select hi from s)-make_interval(days=>p_window_days)),0) outq,
          coalesce(sum(appeared) filter (where fetched_at > (select hi from s)-make_interval(days=>p_window_days)),0) inq
        from t),
  b as (select count(*) bk from vti.work_queue where platform_slug=p_platform
           and status in ('open','in_progress') and vti.is_removal_task(reason)),
  n as (select count(*) c from vti.work_queue where platform_slug=p_platform
           and status in ('open','in_progress') and not vti.is_removal_task(reason)),
  sa as (select count(*) c from vti.sales where sold_at > now()-make_interval(days=>p_window_days))
  select jsonb_build_object('platform',p_platform,'window_days',p_window_days,'newest_poll',s.hi,
    'removals',a.outq,'arrivals',a.inq,'backlog',b.bk,'monitor_alerts_open',n.c,'sales',sa.c,
    'hours_since_removal',round(extract(epoch from (s.hi-coalesce(a.lg,a.lo)))/3600.0,1),
    'hours_since_arrival',round(extract(epoch from (s.hi-coalesce(a.ln,a.lo)))/3600.0,1))
  from s,a,b,n,sa
$f$;

-- Verdict. Three independent axes; none vouches for another.
--   outbound  stalled  - nothing has disappeared within p_quiet_hours
--             degraded - moving, but too slowly to clear the known backlog
--   inbound   stalled  - nothing has appeared within p_quiet_hours
--   detection blind    - no sale recorded at all, so quantity cannot be
--                        decremented and overselling cannot be prevented
create or replace function vti.check_actuator_liveness(
  p_platform text default 'poshmark', p_quiet_hours integer default 36)
returns jsonb language plpgsql security definer set search_path to 'vti','public' as $f$
declare
  win  int := 7;       -- trailing window, days
  maxb numeric := 30;  -- a backlog needing longer than this to clear is not "working"
  m jsonb; o text; i text; d text; sev text; clr numeric; rate numeric;
begin
  m := vti.liveness_metrics(p_platform, win);
  if m->>'newest_poll' is null then
    perform vti.raise_finding('actuator_liveness', p_platform,
      'Liveness UNMEASURABLE on '||p_platform||': no complete storefront snapshot exists.',
      'critical', m, 'Liveness UNMEASURABLE');
    return m || jsonb_build_object('severity','critical','measurable',false);
  end if;
  rate := round((m->>'removals')::numeric / greatest(win,1), 2);
  clr  := case when rate > 0 then round((m->>'backlog')::numeric / rate, 1) end;
  o := case when (m->>'hours_since_removal')::numeric > p_quiet_hours then 'stalled'
            when (m->>'backlog')::int > 0 and (clr is null or clr > maxb) then 'degraded'
            else 'ok' end;
  i := case when (m->>'hours_since_arrival')::numeric > p_quiet_hours then 'stalled' else 'ok' end;
  d := case when (m->>'sales')::int = 0 then 'blind' else 'ok' end;
  sev := case when d = 'blind' or (o = 'stalled' and i = 'stalled') then 'critical'
              when o <> 'ok' or i <> 'ok' then 'high' else 'info' end;
  if o <> 'ok' then perform vti.raise_finding('actuator_liveness', p_platform,
    format('Outbound delisting %s on %s: %s removals in %s days (%s/day), %s queued, %s days to clear.',
      upper(o), p_platform, m->>'removals', win, rate, m->>'backlog', coalesce(clr::text,'never')),
    'high', m, 'Outbound delisting'); end if;
  if i <> 'ok' then perform vti.raise_finding('actuator_liveness', p_platform,
    format('Inbound cross-listing STALLED on %s: no new listing for %s hours.', p_platform, m->>'hours_since_arrival'),
    'high', m, 'Inbound cross-listing'); end if;
  if d <> 'ok' then perform vti.raise_finding('actuator_liveness', p_platform,
    format('Sale detection BLIND on %s: no sale recorded in %s days, so quantity cannot be decremented.', p_platform, win),
    'critical', m, 'Sale detection BLIND'); end if;
  return m || jsonb_build_object('measurable',true,'severity',sev,'inbound',i,'outbound',o,
    'detection',d,'per_day',rate,'days_to_clear',clr);
end;
$f$;
