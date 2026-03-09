-- kb_documents: required by add_knowledge_hub. Idempotent.
CREATE TABLE IF NOT EXISTS kb_documents (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]',
    author_id VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'wiki',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    views INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
