-- Calendar visibility for assigned future tasks, plus a secured shared/personal template library.
CREATE TABLE IF NOT EXISTS public.workspace_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('task', 'notice', 'invoice', 'general')),
  body_html text NOT NULL DEFAULT '' CHECK (char_length(body_html) <= 30000),
  is_shared boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_templates_shared_updated_idx
  ON public.workspace_templates (is_shared, updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_templates_created_by_idx
  ON public.workspace_templates (created_by, updated_at DESC);

ALTER TABLE public.workspace_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_templates TO authenticated;

DROP POLICY IF EXISTS workspace_templates_read ON public.workspace_templates;
CREATE POLICY workspace_templates_read
  ON public.workspace_templates FOR SELECT TO authenticated
  USING (is_shared OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS workspace_templates_insert_own ON public.workspace_templates;
CREATE POLICY workspace_templates_insert_own
  ON public.workspace_templates FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS workspace_templates_update_own ON public.workspace_templates;
CREATE POLICY workspace_templates_update_own
  ON public.workspace_templates FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS workspace_templates_delete_own ON public.workspace_templates;
CREATE POLICY workspace_templates_delete_own
  ON public.workspace_templates FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Existing task RLS only exposed already-released work to managers.
-- This additional permissive SELECT policy exposes future tasks only to their assignee,
-- allowing the calendar to display their upcoming dates without granting team-wide access.
DROP POLICY IF EXISTS tasks_assignee_calendar ON public.tasks;
CREATE POLICY tasks_assignee_calendar
  ON public.tasks FOR SELECT TO authenticated
  USING (assignee_id = (SELECT auth.uid()));
