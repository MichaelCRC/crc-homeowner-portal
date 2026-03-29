# CRC Unified Job Record Schema

> Defines the shared data structure for the future CRC CRM Core.
> Both the Homeowner Portal and Supplement Portal will converge on this schema
> when migrated to a shared database.

## Schema Version: 1.0.0
## Last Updated: 2026-03-29

---

## Core Identity

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | UUID | Both | Primary key |
| `token` | string | Homeowner | Portal access token (homeowner-only) |
| `address` | string | Both | Property address |
| `status` | string | Supplement | Internal workflow status (intake, scope_review, etc.) |
| `stage` | integer (1-6) | Homeowner | Customer-facing stage |

### Status ↔ Stage Mapping

| Supplement Status | Homeowner Stage | Label |
|-------------------|-----------------|-------|
| intake, documents_collecting | 1 | Claim Filed |
| photos_analyzing | 2 | Adjuster Scheduled |
| scope_generating, scope_review | 3 | Scope Received |
| scope_approved | 4 | Supplement In Review |
| approved, submitted | 5 | Approved & Scheduled |
| complete | 6 | Project Complete |

---

## Homeowner

| Field | Type | Notes |
|-------|------|-------|
| `homeowner.name` | string | Homeowner portal uses single `name` |
| `homeowner.firstName` | string | Supplement portal uses split names |
| `homeowner.lastName` | string | Supplement portal uses split names |
| `homeowner.email` | string | Both |
| `homeowner.phone` | string | Both |

**Migration note:** Unified schema should use `firstName` + `lastName` with a computed `name` getter.

---

## Insurance & Claim

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `carrier` | string | Both | Insurance company |
| `claimNumber` | string | Both | Claim reference |
| `dateOfLoss` | string (ISO) | Supplement | Not in homeowner portal |
| `policyType` | string | Supplement | RCV/ACV |
| `deductible` | number | Supplement | Dollar amount |
| `jobType` | string | Supplement | roof, siding, combo, gutters |
| `damageType` | string | Supplement | hail, wind, etc. |

---

## Adjuster

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `adjuster.name` | string | Both | |
| `adjuster.email` | string | Both | |
| `adjuster.phone` | string | Both | |

---

## Measurements (Supplement Only)

| Field | Type | Notes |
|-------|------|-------|
| `measurements.hoverId` | number | Hover job ID |
| `measurements.totalArea` | number | SF |
| `measurements.totalSquares` | number | SQ |
| `measurements.predominantPitch` | string | e.g., "6/12" |
| `measurements.ridgeLength` | number | LF |
| `measurements.hipLength` | number | LF |
| `measurements.valleyLength` | number | LF |
| `measurements.rakeLength` | number | LF |
| `measurements.eaveLength` | number | LF |
| `measurements.flashingLength` | number | LF |
| `measurements.stepFlashingLength` | number | LF |
| `measurements.dripEdgeLength` | number | LF |
| `measurements.facetCount` | number | |
| `measurements.sidingArea` | number | SF |
| `measurements.gutterLength` | number | LF |

---

## Storm Data (Supplement Only)

| Field | Type | Notes |
|-------|------|-------|
| `stormData.source` | string | "pdf_upload" or "manual" |
| `stormData.events[]` | array | Storm event records |
| `stormData.events[].date` | string | Event date |
| `stormData.events[].hailSize` | number | Inches |
| `stormData.events[].windSpeed` | number | MPH |
| `stormData.events[].eventType` | string | Hail/Wind/Hail+Wind |

---

## Scope (Supplement Only)

| Field | Type | Notes |
|-------|------|-------|
| `scope.lineItems[]` | array | Generated line items |
| `scope.lineItems[].code` | string | OHCO8X code (e.g., RFG SHNGL) |
| `scope.lineItems[].description` | string | |
| `scope.lineItems[].quantity` | number | |
| `scope.lineItems[].unit` | string | SQ, LF, SF, EA |
| `scope.lineItems[].category` | string | Roofing, Gutters, etc. |
| `scope.qualityCheck.passed` | boolean | |
| `scope.generatedAt` | string (ISO) | |
| `scopeSelections` | object | {code_action: boolean} |

---

## Photos

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `companycamProjectId` | string | Homeowner | CC project link |
| `photos.source` | string | Supplement | companycam_auto, pdf, etc. |
| `photos.categories` | object | Supplement | HAAG categorized photos |
| `photos.photoCount` | number | Supplement | |
| `photos.haagDamage` | object | Supplement | HAAG analysis results |
| `photos.components` | object | Supplement | Detected roof components |

---

## Documents

### Homeowner Portal
| Field | Type | Notes |
|-------|------|-------|
| `documents[]` | array | Uploaded files |
| `documents[].id` | UUID | |
| `documents[].filename` | string | Server filename |
| `documents[].originalName` | string | Upload name |
| `documents[].type` | string | scope, insurance, other |
| `documents[].size` | number | Bytes |
| `documents[].status` | string | received, reviewed |
| `documents[].uploadedAt` | string (ISO) | |

### Supplement Portal
| Field | Type | Notes |
|-------|------|-------|
| `documents.hoverReport` | string | Filename |
| `documents.stormReport` | string | Filename |
| `documents.claimsReport` | string | Filename |

**Migration note:** Unified schema should use the homeowner portal's array format for all documents.

---

## Messages (Homeowner Only)

| Field | Type | Notes |
|-------|------|-------|
| `messages[]` | array | Communication log |
| `messages[].id` | UUID | |
| `messages[].from` | string | Sender name |
| `messages[].body` | string | Message text |
| `messages[].direction` | string | inbound/outbound |
| `messages[].timestamp` | string (ISO) | |

---

## History & Audit

### Homeowner Portal
| Field | Type | Notes |
|-------|------|-------|
| `stageHistory[]` | array | Stage change log |
| `stageHistory[].stage` | number | |
| `stageHistory[].timestamp` | string (ISO) | |
| `stageHistory[].note` | string | |

### Supplement Portal
| Field | Type | Notes |
|-------|------|-------|
| `timeline[]` | array | Action log |
| `timeline[].action` | string | |
| `timeline[].timestamp` | string (ISO) | |
| `timeline[].detail` | string | |

**Migration note:** Unified schema should merge both into a single `activityLog[]` array.

---

## Timestamps

| Field | Type | Homeowner | Supplement |
|-------|------|-----------|------------|
| `createdAt` | string (ISO) | ✓ | As `created_at` |
| `updatedAt` | string (ISO) | ✓ | As `updated_at` |

**Migration note:** Standardize on camelCase (`createdAt`, `updatedAt`).

---

## Fields Unique to Each Portal

### Homeowner Only
- `token` — Portal access URL
- `messages[]` — Communication log
- `stageHistory[]` — Stage change tracking
- `stage` — Customer-facing stage (1-6)

### Supplement Only
- `status` — Internal workflow status
- `measurements` — Hover roof data
- `stormData` — Hail Recon analysis
- `scope` — XBuild generated scope
- `scopeSelections` — Review modal choices
- `photos.categories` — HAAG analysis
- `photos.haagDamage` — Damage assessment
- `timeline[]` — System event log
- `dateOfLoss`, `jobType`, `policyType`, `deductible`, `damageType`
- `carrierPattern` — Carrier intelligence data
- `coverPhotoUrl` — Selected cover photo
- `photoMode` — haag/simple toggle

---

## Unified Schema Recommendation

When building the CRC CRM Core, the unified record should:

1. Use UUID `id` as primary key across all portals
2. Store both `status` (internal) and `stage` (customer) with automatic mapping
3. Use `firstName`/`lastName` with computed `name`
4. Use document array format (not named slots)
5. Merge `stageHistory` + `timeline` into single `activityLog`
6. Use camelCase timestamps
7. Add `portalToken` field for homeowner access
8. All supplement-specific fields nested under namespaces (`measurements.*`, `scope.*`, `stormData.*`)
9. Messages array shared — both portals can read/write
10. Webhook sync replaced by direct database reads
