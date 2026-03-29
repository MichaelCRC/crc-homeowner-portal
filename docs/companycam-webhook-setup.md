# CompanyCam Webhook Setup

Register this webhook so inspection photos automatically appear in the homeowner portal.

## Endpoint

```
https://crc-homeowner-portal.onrender.com/webhook/companycam
```

## Setup Steps

1. Log in to CompanyCam at **app.companycam.com**
2. Go to **Settings** (gear icon, top right)
3. Select **Integrations** or **Webhooks** from the sidebar
4. Click **Add Webhook** or **New Webhook**
5. Enter the following:
   - **URL:** `https://crc-homeowner-portal.onrender.com/webhook/companycam`
   - **Events:** Select `photo.created` (and `photo.updated` if available)
   - **Active:** Enabled
6. Save

## How It Works

- When a photo is taken on any CompanyCam project, CompanyCam fires a webhook to the URL above
- The homeowner portal matches the photo to a job by **project name vs job address**
- If matched, the photo is stored to the job record and appears in the homeowner's Photos tab
- Photos are categorized as **Inspection** or **Post-Install** based on CompanyCam tags

## Matching Logic

The webhook matches photos to jobs by:
1. **CompanyCam Project ID** — if the job has a `companycamProjectId` stored
2. **Address match** — if the CompanyCam project name contains the job's street address

For best results, name CompanyCam projects with the full street address (e.g., "4521 Riverside Dr, Columbus, OH 43220").

## Photo Categorization

Photos tagged with `install`, `complete`, `after`, or `final` in CompanyCam are categorized as **Post-Install**. All other photos are categorized as **Inspection**.

## Testing

Send a test POST to verify the endpoint is live:

```bash
curl -X POST https://crc-homeowner-portal.onrender.com/webhook/companycam \
  -H "Content-Type: application/json" \
  -d '{"project":{"id":"12345","name":"4521 Riverside Dr Columbus OH"},"photo":{"id":"test-1","photo_url":"https://example.com/photo.jpg","captured_at":"2026-03-29T12:00:00Z","tags":[]}}'
```

Expected response: `{"success":true,"matched":true,"jobId":"..."}`
(or `"matched":false` if no job matches that address)
