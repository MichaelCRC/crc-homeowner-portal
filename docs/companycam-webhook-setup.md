# CompanyCam Webhook Setup

Register this webhook so inspection photos automatically appear in the homeowner portal.

## Prerequisites

You need a **CompanyCam access token**. Generate one at:
**https://app.companycam.com/access_tokens**

## Step 1: Choose a Webhook Secret

Pick a random string to use as your webhook signing secret. This is used to verify that incoming requests actually came from CompanyCam.

Example: `crc-webhook-2026-secret` (use something stronger in production)

Save this — you'll add it to Render as `COMPANYCAM_WEBHOOK_SECRET`.

## Step 2: Register the Webhook via CompanyCam API

CompanyCam webhooks are registered via their API, not a settings panel. Run this curl command (replace the two values in caps):

```bash
curl -X POST https://api.companycam.com/v2/webhooks \
  -H "Authorization: Bearer YOUR_COMPANYCAM_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://crc-homeowner-portal.onrender.com/webhook/companycam",
    "scopes": ["photo.created", "photo.updated"],
    "token": "YOUR_WEBHOOK_SECRET"
  }'
```

Replace:
- `YOUR_COMPANYCAM_ACCESS_TOKEN` — from Step 1 (app.companycam.com/access_tokens)
- `YOUR_WEBHOOK_SECRET` — the secret string you chose

CompanyCam will respond with the created webhook object including its ID.

## Step 3: Add Env Var to Render

Go to your **crc-homeowner-portal** service on Render:
1. Settings → Environment
2. Add: `COMPANYCAM_WEBHOOK_SECRET` = the same secret string from Step 2
3. Save → Manual Deploy

## How It Works

1. A photo is taken in CompanyCam on any project
2. CompanyCam sends a POST to your webhook URL with the photo data
3. The request includes an `X-CompanyCam-Signature` header (HMAC-SHA1 of the body using your secret)
4. The homeowner portal verifies the signature, then matches the photo to a job by **project name vs job address**
5. If matched, the photo is stored to the job record and appears in the homeowner's Photos tab

## Matching Logic

The webhook matches photos to jobs by:
1. **CompanyCam Project ID** — if the job already has a `companycamProjectId` stored
2. **Address match** — if the CompanyCam project name contains the job's street address

For best results, name CompanyCam projects with the full street address (e.g., "4521 Riverside Dr, Columbus, OH 43220").

## Photo Categorization

Photos tagged with `install`, `complete`, `after`, or `final` in CompanyCam are shown as **Post-Install**. All other photos are shown as **Inspection**.

## Signature Verification

Every incoming request is verified using HMAC-SHA1:
- CompanyCam signs the request body with your webhook secret
- Sends the signature in the `X-CompanyCam-Signature` header
- The portal calculates the same HMAC and does a timing-safe comparison
- Rejected if signatures don't match (prevents spoofed requests)

If `COMPANYCAM_WEBHOOK_SECRET` is not set in Render, signature verification is skipped (useful for initial testing).

## Available Webhook Scopes

| Scope | Description |
|-------|-------------|
| `photo.created` | New photo taken (recommended) |
| `photo.updated` | Photo edited or tagged |
| `project.created` | New project created |
| `project.updated` | Project details changed |
| `document.created` | Document uploaded |
| `*` | All events (not recommended) |

## Managing Webhooks

List all registered webhooks:
```bash
curl https://api.companycam.com/v2/webhooks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Delete a webhook:
```bash
curl -X DELETE https://api.companycam.com/v2/webhooks/WEBHOOK_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing

Test the endpoint with a simulated payload:

```bash
curl -X POST https://crc-homeowner-portal.onrender.com/webhook/companycam \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "photo.created",
    "created_at": 1711670400,
    "payload": {
      "id": "test-photo-1",
      "photo_url": "https://example.com/photo.jpg",
      "captured_at": "2026-03-29T12:00:00Z",
      "tags": [],
      "project": {
        "id": "12345",
        "name": "4521 Riverside Dr Columbus OH"
      }
    },
    "webhook_id": "test"
  }'
```

Note: This test will skip signature verification if `COMPANYCAM_WEBHOOK_SECRET` is not set.
