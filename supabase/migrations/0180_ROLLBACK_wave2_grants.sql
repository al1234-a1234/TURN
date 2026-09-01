-- ═══ تراجع الموجة ٢ (٠١٧٩) — يُطبَّق فقط إن ظهر عطل ═══
grant execute on function public.alert_peak_join_stall()                      to anon, authenticated, public;
grant execute on function public.alert_position_duplicates()                  to anon, authenticated, public;
grant execute on function public.set_branch_join_frozen(uuid,boolean,text)    to anon, public;
grant execute on function public.audit_row_delete()                           to anon, authenticated, public;
grant execute on function public.log_queue_event()                            to anon, authenticated, public;

grant all on public.platform_admins    to anon, authenticated;
grant all on public.push_subscriptions to anon, authenticated;
grant all on public.alert_config       to anon, authenticated;
grant all on public.alert_state        to anon, authenticated;
grant all on public.client_errors      to anon, authenticated;
