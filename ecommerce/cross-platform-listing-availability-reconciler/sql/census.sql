-- Poshmark census support: status vocabulary, sale detection, cleanup feed.
--
-- Root cause these address: the poller only ever read the default closet view
-- (available listings). Sold and deactivated listings were therefore invisible,
-- vti.sales stayed empty, and the differ could not tell a sale from a
-- deactivation from a deletion - it only saw "gone from the available view".

alter table vti.listings add column if not exists status_changed_at timestamptz;
alter table vti.listings drop constraint if exists listings_status_check;
alter table vti.listings add constraint listings_status_check
  check (status in ('available','reserved','sold','inactive','ended','unknown'));

-- Read-only feed for the Poshmark Inactive Cleanup page. Deletion itself
-- happens on Poshmark: this system has no login there, and Crosslist only
-- delists what it recorded as sold, so a deactivated listing is nobody's job
-- until a person deletes it.
create or replace function public.vti_poshmark_cleanup()
returns jsonb language sql stable security definer set search_path to 'vti','public' as $f$
  with t as (
    select l.external_listing_id id, l.url, l.quantity_listed qty,
           l.status_changed_at, l.status,
           coalesce((select si.title from vti.snapshot_items si
                      where si.external_listing_id = l.external_listing_id
                      order by si.snapshot_id desc limit 1), '') title
      from vti.listings l
     where l.platform_slug='poshmark' and l.status='inactive')
  select jsonb_build_object(
    'generated_at', now(),
    'newest_poll', (select max(fetched_at) from vti.snapshots
                     where platform_slug='poshmark' and complete),
    'inactive_count', (select count(*) from t),
    'inactive_units', (select coalesce(sum(qty),0) from t),
    'inactive', coalesce((select jsonb_agg(to_jsonb(t) order by t.status_changed_at desc nulls last)
                          from t), '[]'::jsonb))
$f$;

grant execute on function public.vti_poshmark_cleanup() to anon, authenticated;
notify pgrst, 'reload schema';

-- Hourly fast poll (available view only, ~47s) keeps the differ fed; the full
-- three-view census runs every six hours, because walking all three takes
-- ~145s and overran the edge runtime's wall clock on an hourly schedule.
select cron.schedule('vti-poshmark-census', '35 */6 * * *', $job$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/poshmark-poller',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer <anon key>'),
    body := '{"full":true}'::jsonb,
    timeout_milliseconds := 300000);
$job$);
