-- Additive migration. Apply to an isolated Neon branch before production.
CREATE TABLE IF NOT EXISTS knowledge_assets (
 id uuid PRIMARY KEY, creator_id integer NOT NULL REFERENCES users(id),
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=104857600),
 parts integer NOT NULL CHECK(parts BETWEEN 1 AND 50), store_name text NOT NULL,
 ready boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_asset_parts (
 asset_id uuid NOT NULL REFERENCES knowledge_assets(id), part integer NOT NULL,
 size integer NOT NULL CHECK(size>0), PRIMARY KEY(asset_id,part)
);
CREATE TABLE IF NOT EXISTS knowledge_items (
 id uuid PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '',topic text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN ('script','video','presentation','document')),
 sections jsonb NOT NULL DEFAULT '[]',video_url text NOT NULL DEFAULT '',
 asset_id uuid REFERENCES knowledge_assets(id),pdf_asset_id uuid REFERENCES knowledge_assets(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 audience text NOT NULL DEFAULT 'all' CHECK(audience IN ('all','selected')),
 audience_ids integer[] NOT NULL DEFAULT '{}',creator_id integer NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz
);
CREATE INDEX IF NOT EXISTS knowledge_items_status_updated ON knowledge_items(status,updated_at DESC);
CREATE TABLE IF NOT EXISTS knowledge_favorites (
 user_id integer NOT NULL REFERENCES users(id),item_id uuid NOT NULL REFERENCES knowledge_items(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,item_id)
);
