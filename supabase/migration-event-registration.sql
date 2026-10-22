-- Additive migration. Existing events, leads, attendees and vendors are retained.
BEGIN;
CREATE TABLE IF NOT EXISTS public.event_registration_forms (
 event_id bigint PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '', logo text NOT NULL DEFAULT '',
 fields jsonb NOT NULL, enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS registration_key uuid;
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS registration_answers jsonb;
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS registration_fields jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS event_attendees_registration_key_idx ON public.event_attendees(event_id,registration_key) WHERE registration_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_attendees_registration_phone_idx ON public.event_attendees(event_id,phone);

-- Serializes registrations on the event row, including the manual path.
CREATE OR REPLACE FUNCTION public.register_event_attendee(
 p_event_id bigint,p_name text,p_phone text,p_email text,p_source text,
 p_key uuid,p_answers jsonb,p_fields jsonb,p_version integer,p_public boolean
) RETURNS TABLE(attendee_id bigint,is_waitlisted boolean,already_registered boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE ev public.events%ROWTYPE; cfg public.event_registration_forms%ROWTYPE; existing public.event_attendees%ROWTYPE; waiting boolean;
BEGIN
 SELECT * INTO ev FROM public.events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
 IF p_public THEN
  SELECT * INTO cfg FROM public.event_registration_forms WHERE event_id=p_event_id FOR UPDATE;
  IF NOT FOUND OR NOT cfg.enabled OR ev.status IN ('done','cancelled') THEN RAISE EXCEPTION 'REGISTRATION_CLOSED'; END IF;
  IF cfg.version<>p_version THEN RAISE EXCEPTION 'FORM_CHANGED'; END IF;
  SELECT * INTO existing FROM public.event_attendees WHERE event_id=p_event_id AND
   (registration_key=p_key OR regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')) ORDER BY id LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT existing.id,COALESCE(existing.waitlisted,false),true;RETURN;END IF;
 END IF;
 SELECT COALESCE(ev.capacity,0)>0 AND count(*)>=ev.capacity INTO waiting FROM public.event_attendees WHERE event_id=p_event_id AND NOT COALESCE(waitlisted,false);
 INSERT INTO public.event_attendees(event_id,name,phone,email,waitlisted,source,registration_key,registration_answers,registration_fields)
 VALUES(p_event_id,p_name,p_phone,p_email,COALESCE(waiting,false),p_source,p_key,p_answers,p_fields)
 RETURNING id INTO attendee_id;
 RETURN QUERY SELECT attendee_id,COALESCE(waiting,false),false;
END;
$$;
COMMIT;
