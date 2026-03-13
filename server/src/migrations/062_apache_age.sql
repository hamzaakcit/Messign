-- Migration: 062_apache_age.sql
-- Sprint 7–8: Cross-Module Graph Queries — Apache AGE property graph
-- Enables queries like "deals at risk because assigned engineer has PTO request"
-- Skips if AGE not installed (e.g. standard Postgres without AGE)
--
-- Prerequisites (manual or Docker):
--   - Install Apache AGE: https://age.apache.org/age-manual/master/intro/setup.html
--   - Or use: docker pull apache/age

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'age') THEN
    RAISE NOTICE 'Apache AGE not installed, skipping 062_apache_age';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS age;

  -- Create enterprise graph if not exists (idempotent)
  IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'messign_graph') THEN
    PERFORM ag_catalog.create_graph('messign_graph');
    RAISE NOTICE 'messign_graph created';
  ELSE
    RAISE NOTICE 'messign_graph already exists';
  END IF;

  -- Vertex labels (entities)
  -- Person: users/employees (id, name, role, department, tenant_id)
  BEGIN
    PERFORM ag_catalog.create_vlabel('messign_graph', 'Person');
    RAISE NOTICE 'Vertex label Person created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42P07' OR SQLERRM LIKE '%already exists%' THEN
      RAISE NOTICE 'Vertex label Person already exists';
    ELSE
      RAISE;
    END IF;
  END;

  -- Deal: CRM opportunities (id, name, value, stage, tenant_id)
  BEGIN
    PERFORM ag_catalog.create_vlabel('messign_graph', 'Deal');
    RAISE NOTICE 'Vertex label Deal created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42P07' OR SQLERRM LIKE '%already exists%' THEN
      RAISE NOTICE 'Vertex label Deal already exists';
    ELSE
      RAISE;
    END IF;
  END;

  -- PTORequest: time-off requests (id, status, days)
  BEGIN
    PERFORM ag_catalog.create_vlabel('messign_graph', 'PTORequest');
    RAISE NOTICE 'Vertex label PTORequest created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42P07' OR SQLERRM LIKE '%already exists%' THEN
      RAISE NOTICE 'Vertex label PTORequest already exists';
    ELSE
      RAISE;
    END IF;
  END;

  -- Edge labels (relationships)
  -- Person -[:ASSIGNED_TO {role, since}]-> Deal
  BEGIN
    PERFORM ag_catalog.create_elabel('messign_graph', 'ASSIGNED_TO');
    RAISE NOTICE 'Edge label ASSIGNED_TO created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42P07' OR SQLERRM LIKE '%already exists%' THEN
      RAISE NOTICE 'Edge label ASSIGNED_TO already exists';
    ELSE
      RAISE;
    END IF;
  END;

  -- Person -[:HAS_PTO {start_date, end_date}]-> PTORequest
  BEGIN
    PERFORM ag_catalog.create_elabel('messign_graph', 'HAS_PTO');
    RAISE NOTICE 'Edge label HAS_PTO created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42P07' OR SQLERRM LIKE '%already exists%' THEN
      RAISE NOTICE 'Edge label HAS_PTO already exists';
    ELSE
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'messign_graph schema ready (Person, Deal, PTORequest, ASSIGNED_TO, HAS_PTO)';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Apache AGE setup failed (may need LOAD age in session): %', SQLERRM;
END $$;
