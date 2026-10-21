# Integration Lab

A small **Next.js 16 / TypeScript** API-integration playground for **Meta WhatsApp Cloud API**, **AWS S3**, and **Mailgun**. Includes a responsive dashboard, safe simulations that need no credentials, and explicitly gated live integrations for verified test accounts.

> **Important:** This is a developer demonstration, not a production-ready public messaging/file-storage service. Do **not** publicly deploy it with live credentials. External providers can charge money for live traffic.

## What it does

| Service | Demo mode (no credentials) | Live mode (credentials required) |
| --- | --- | --- |
| WhatsApp | Validates recipient and simulates a `hello_world` template send | Sends a template via Meta Graph API |
| Mailgun | Validates recipient and simulates a transactional email | Sends plain-text email via Mailgun HTTP API |
| S3 | Uploads/lists/downloads files in temporary server memory | Uploads files to private S3, lists objects, returns 60-second presigned downloads |

Demo mode never contacts a cloud provider and has **zero provider charges**. Demo files are stored in-process (20 most recent, 5 MB each) and disappear after a restart. Live APIs have not been exercised without provider credentials.

## Get started

Requires Node.js 20.9+ and npm.

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Start with **Demo** to test the dashboard. Credentials can be added later. For an offline build, use the attached project files and install packages once online.

### Enable real provider calls (explicit opt-in)

1. Populate provider secrets in `.env.local` (never commit this file).
2. Set `INTEGRATION_LAB_ADMIN_TOKEN` to a long random password, and `ENABLE_LIVE_INTEGRATIONS=true`.
3. Restart the Next.js server.
4. Open dashboard settings, enter the admin token, and switch to **Live**.
5. Send only to authorized test recipients; review the provider account's billing limits.

Live requests are rejected unless both the live switch and correct admin token are present. The admin token is only held in browser memory, never saved in local storage. Production also requires this token even for demo calls. Network access to the dashboard should be restricted to a trusted operator. Do not publish your `.env.local` or share screenshots containing secrets.

## WhatsApp setup

1. Create a Meta Developer app with the **WhatsApp** product and open **API Setup**.
2. Get the developer **test phone number ID** and temporary access token. Add a verified test recipient in Meta's dashboard.
3. Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in `.env.local`.
4. Optionally set `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_TEMPLATE_NAME`, and `WHATSAPP_TEMPLATE_LANGUAGE`; defaults are `v23.0`, `hello_world`, and `en_US`. Confirm the current supported Graph version and available template in your dashboard.
5. Enter the recipient number in international digit-only format, e.g. `919876543210`. The endpoint sends a template request; **API acceptance does not guarantee delivery**.

Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/

## Mailgun setup

1. Create a Mailgun account and locate your **sandbox domain**. Authorize and verify your recipient email address in Mailgun.
2. Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_FROM_EMAIL` in `.env.local`.
3. Set `MAILGUN_REGION=us` or `eu` to match your account's domain region.
4. Send a test message from the Mailgun panel. The endpoint calls `POST /v3/{domain}/messages` with HTTP Basic authentication and plain-text form fields.

Mailgun's sandbox generally only sends to authorized recipients. API acceptance does not guarantee inbox delivery. Check plan limits and trial status before enabling live calls.

Reference: https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages

## AWS S3 setup

1. Choose an AWS account **approved for spending**, a region, and a **private bucket** with public access blocked. Consider using a local emulator instead of AWS for no-billing testing.
2. Create a dedicated IAM principal with permission to `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` **only on the intended bucket and the configured `integration-lab/` prefix**. Avoid root credentials.
3. Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET` in `.env.local`. Temporary credentials can also use `AWS_SESSION_TOKEN`.
4. The Storage panel accepts PNG/JPEG/WebP/PDF/TXT files up to 5 MiB, adds a unique ID to object keys, and requests server-side encryption (SSE-S3).
5. Files remain private. Downloads use a presigned URL valid for **60 seconds**. Treat presigned URLs as temporary bearer links.

If using **Moto Server** locally, set `S3_ENDPOINT=http://127.0.0.1:5000`, `S3_FORCE_PATH_STYLE=true`, fake test AWS credentials, and create the bucket in Moto first. Moto runs entirely locally and avoids real AWS charges. The returned presigned URL points to the local emulator. Don't configure a publicly reachable emulator in this demo.

For extra safety, configure an AWS budget alert and review billing settings. S3 is not necessarily free on an existing AWS account.

Reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html

## HTTP endpoints

| Route | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/status` | GET | – | Live-enabled flag and non-secret credential availability |
| `/api/whatsapp/send` | POST | JSON `{ "mode": "demo", "to": "919876543210" }` | Simulated result or accepted Meta message ID |
| `/api/mailgun/send` | POST | JSON `{ "mode": "demo", "to": "test@example.com", "subject": "Hello", "message": "Test" }` | Simulated result or accepted Mailgun message ID |
| `/api/storage/upload` | POST | `multipart/form-data`: `mode`, `file` | File metadata |
| `/api/storage/list?mode=demo` | GET | – | Up to 50 file metadata entries |
| `/api/storage/download` | POST | JSON `{ "mode": "demo", "key": "..." }` | Base64 content in demo mode; 60-second presigned URL in live mode |

For live requests, use `"mode": "live"` or `mode=live`, and send the `x-lab-token` header. Keep this token out of logs and shared scripts.

## Verify

```bash
npm run lint
npm run typecheck
npm run build
```

Use demo mode to exercise each panel and confirm **no actual WhatsApp/email is sent and no AWS object is created**. Live provider E2E testing requires real credentials and authorized sandbox/test accounts.

## Security limitations

- This demo has one shared admin token and no user identities, session system, CSRF protection, abuse throttling, audit trail, malware scanning, or content-based file verification. Keep it local/private.
- Uploads are size- and MIME-limited, but do **not** trust client-supplied MIME types in production.
- The `5 MB` request-body limit is intended for demo workloads. For larger files in production, implement direct presigned uploads and browser-to-S3 transfer.
- Demo storage is a process-global in-memory Map, not persistent across restarts or serverless instances.
- A real response means an API accepted a request—not that an email/WhatsApp message was delivered.
- Cloud-provider pricing, free trials, permissions, and usage allowances may change.

## Project structure

```text
src/app/                     Next.js app and API route handlers
src/components/dashboard.tsx Interactive dashboard UI
src/lib/api.ts               Validation, authorization, response handling
src/lib/demo-storage.ts      Ephemeral local demo object store
src/lib/s3.ts                S3 client and private-prefix helpers
.env.example                 Names of required environment variables (no secrets)
```
