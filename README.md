# SHOBA AI Backend v1.2

Secure API layer and first discovery-engine implementation for SHOBA Connect.

## Endpoints
- `GET /api/health` — WordPress connectivity check
- `GET /api/ready` — required environment check
- `GET /api/listings` — authenticated WordPress listing retrieval
- `GET /api/discover?q=...&location=...&category=...` — authenticated ranked discovery

Authentication: `X-SHOBA-API-Key` or `Authorization: Bearer <key>`.

## Boundary
SHOBA owns discovery, records, enrichment, verification states and ecosystem intelligence. VEESBLE remains responsible for website intelligence, audit evidence, diagnosis and scoring.

## Important
This package does not auto-publish discovered businesses. External discovery candidates remain subject to deduplication, provenance, ownership verification, business-status checks and SHOBA review before publication.
