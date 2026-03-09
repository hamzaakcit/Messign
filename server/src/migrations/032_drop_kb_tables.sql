-- Drop legacy kb_* tables after consolidation to knowledge_* tables.
-- Run after 030_consolidate_knowledge.sql has been verified.

DROP TABLE IF EXISTS kb_activities CASCADE;
DROP TABLE IF EXISTS kb_acknowledgements CASCADE;
DROP TABLE IF EXISTS kb_flags CASCADE;
DROP TABLE IF EXISTS kb_user_pins CASCADE;
DROP TABLE IF EXISTS kb_collection_documents CASCADE;
DROP TABLE IF EXISTS kb_collections CASCADE;
DROP TABLE IF EXISTS kb_document_tags CASCADE;
DROP TABLE IF EXISTS kb_tags CASCADE;
DROP TABLE IF EXISTS kb_categories CASCADE;
DROP TABLE IF EXISTS kb_documents CASCADE;
