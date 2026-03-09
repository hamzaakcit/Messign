-- projects: required by add_opportunity_hub_columns, fix_all_missing_columns_and_tables.
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type VARCHAR(50) NOT NULL DEFAULT 'product',
    progress INT NOT NULL DEFAULT 0,
    team JSONB NOT NULL DEFAULT '[]',
    capacity JSONB NOT NULL DEFAULT '{"current":0,"max":5}',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
