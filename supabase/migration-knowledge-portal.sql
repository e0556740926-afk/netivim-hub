-- Additive portal upgrade. Existing content and audience restrictions are preserved.
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS portal jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS knowledge_department_members (
 user_id integer NOT NULL REFERENCES users(id),
 department text NOT NULL CHECK(department IN ('community','guidance')),
 PRIMARY KEY(user_id,department)
);
CREATE INDEX IF NOT EXISTS knowledge_portal_department ON knowledge_items((portal->>'department'));
CREATE INDEX IF NOT EXISTS knowledge_portal_area ON knowledge_items((portal->>'area'),updated_at DESC);
