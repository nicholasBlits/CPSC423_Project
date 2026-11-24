-- When the welcome email went out, so each player gets it at most once.
-- The email address itself is never stored.
alter table public.players
  add column welcome_email_sent_at timestamptz;
