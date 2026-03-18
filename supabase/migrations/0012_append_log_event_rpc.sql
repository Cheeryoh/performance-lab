-- Migration: 0012_append_log_event_rpc
-- RPC function to atomically append a Claude Code hook event to exam_sessions.log_events

create or replace function append_log_event(
  p_session_id uuid,
  p_event      jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  update exam_sessions
  set log_events = log_events || jsonb_build_array(
    p_event || jsonb_build_object('_received_at', now())
  )
  where id = p_session_id;
end;
$$;
