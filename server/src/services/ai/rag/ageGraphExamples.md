# Apache AGE Graph — Cypher Examples

After migration 062 creates the schema, use these patterns to **populate** and **query** the graph.

## Populate (from application/event handlers)

```sql
-- Create Person vertex
SELECT * FROM cypher('messign_graph', $$
  CREATE (:Person {
    id: 'user-uuid-here',
    name: 'John Doe',
    role: 'engineer',
    department: 'engineering',
    tenant_id: 'tenant-uuid'
  })
$$) AS (v agtype);

-- Create Deal vertex
SELECT * FROM cypher('messign_graph', $$
  CREATE (:Deal {
    id: 'deal-uuid-here',
    name: 'Enterprise Contract',
    value: 150000,
    stage: 'negotiation',
    tenant_id: 'tenant-uuid'
  })
$$) AS (v agtype);

-- Create ASSIGNED_TO relationship
SELECT * FROM cypher('messign_graph', $$
  MATCH (p:Person {id: 'user-uuid'}), (d:Deal {id: 'deal-uuid'})
  CREATE (p)-[:ASSIGNED_TO {role: 'technical_lead', since: '2025-01-15'}]->(d)
$$) AS (e agtype);

-- Create PTORequest + HAS_PTO relationship
SELECT * FROM cypher('messign_graph', $$
  MATCH (p:Person {id: 'user-uuid'})
  CREATE (p)-[:HAS_PTO {start_date: '2025-04-01', end_date: '2025-04-10'}]->(
    :PTORequest {id: 'pto-uuid', status: 'approved', days: 7}
  )
$$) AS (e agtype);
```

## Query: Deals at risk due to PTO (killer query)

```sql
SELECT * FROM cypher('messign_graph', $$
  MATCH (p:Person)-[:ASSIGNED_TO]->(d:Deal),
        (p)-[:HAS_PTO]->(pto:PTORequest)
  WHERE d.stage IN ['negotiation', 'proposal', 'closing']
    AND pto.status = 'approved'
    AND pto.start_date <= '2025-04-15'
    AND d.tenant_id = 'current-tenant-uuid'
  RETURN d.name AS deal,
         d.value AS value,
         d.stage AS stage,
         p.name AS person,
         pto.start_date AS pto_start,
         pto.end_date AS pto_end
  ORDER BY d.value DESC
$$) AS (deal agtype, value agtype, stage agtype, person agtype, pto_start agtype, pto_end agtype);
```

Or use the service: `getDealsAtRiskDueToPTO(tenantId, { cutoffDate, stages })`
