# Accounting Document Vault — developer proof of concept

> **Synthetic documents only.** This module is **not** a production accounting, tax-filing, or document-compliance system. All its API routes intentionally refuse requests in `NODE_ENV=production` until a real authentication/authorization and database design is implemented.

## Scope

Open **http://localhost:3000/accounting/storage** or follow *Accounting Vault* in the Integration Lab sidebar.

- Register a document under a fictional client or employee name, Indian financial year (e.g. `2025-26`), category, and demo accountant assignment.
- Upload up to **8 MiB** per file: PDF, PNG, JPG/JPEG, WebP, TXT, DOCX, XLSX. The server checks extensions, content types and basic file signatures. **This is not malware scanning** or proof that Office ZIP contents are safe.
- Browse, search by client/filename/assigned staff, filter by category, financial year, or status.
- Move documents through `submitted`, `in_review`, `needs_changes`, `approved`, and `archived`. Illegal transitions are refused; review comments are recorded in an event history. Archiving is logical, not deletion or regulatory retention.
- Add a *new version* without destroying previous revisions. Download any revision.
- Mark an upload's source as **Simulated WhatsApp attachment** to demonstrate classification. **No Meta webhook, real WhatsApp-media API, or automated ingestion is implemented yet.**
- The UI does **not** authenticate employees. The “assigned to” field is informational, not an enforceable permission.

## Storage design and AWS SDK features

The module uses the existing `@aws-sdk/client-s3` v3 and `@aws-sdk/s3-request-presigner` packages from the main project. No new runtime dependencies.

| Operation in the module | AWS API/SDK operation | Why |
| --- | --- | --- |
| Upload a document revision | `PutObjectCommand` | Save private document bytes under a randomly generated object key, with SSE-S3 and explicit content type |
| Persist the review record | `PutObjectCommand` | Save a separate JSON record (`records/{id}.json`) containing client, FY, status, revisions and events |
| Browse the library | `ListObjectsV2Command` + `GetObjectCommand` | List record sidecars and load their contents (capped at ~250 records for this POC) |
| Read a particular document record | `GetObjectCommand` | Fetch and validate one record server-side |
| Confirm binary object exists | `HeadObjectCommand` | Verify existence before issuing a download |
| Securely download | `GetObjectCommand` + `getSignedUrl()` | Produce a **60-second** private bearer link; do not make the bucket public |
| Roll back a partially failed upload | `DeleteObjectCommand` | Remove the newly uploaded binary if the metadata write failed (best effort) |
| Upload a revised file | `PutObjectCommand` with **new key** | Retain earlier versions even when bucket-level S3 Versioning is disabled |

S3 records live inside the existing `S3_PREFIX` under `accounting-vault/`:

```text
integration-lab/
  accounting-vault/
    objects/<document UUID>/<revision UUID>     # actual bytes, no client name in object key
    records/<document UUID>.json                # JSON metadata and event timeline
```

In the `demo` mode, the same records and bytes persist in `/.local-data/accounting-vault/` on the developer's computer (Git-ignored). **No AWS requests or fees.** Do not put real tax or identity information there.

**Scalability boundary:** S3 is the binary store, *not* a suitable relational database. JSON sidecars demonstrate persistence without a database, but the record listing requires multiple S3 GETs, search is performed in the browser, and cross-server concurrent updates can overwrite metadata. Migrate records, employee identities, permissions, assignments, and audit history to a proper database and durable event log before real use.

### Free path 1 — Run locally without AWS credentials

```powershell
cd D:\Projects\integration-lab
npm install
Copy-Item .env.example .env.local
npm run dev
```

Use **Demo** in the vault. Upload a *fictional* PDF or TXT file and verify listing, review statuses, download, replacement, and old-revision retrieval. Changes persist across local server restarts. No AWS account or payment details are required.

### Free path 2 — Exercise *real S3-compatible SDK calls* using Moto

Moto is a local AWS API emulator. It is not AWS's hosted service, so **Moto tests cannot prove your AWS IAM policies, billing, bucket policy or AWS production behavior**. They do exercise the same `S3Client` command paths as the AWS configuration.

Install Python 3 and the Moto server package, then in **Terminal 1**:

```powershell
py -m pip install "moto[server]" boto3
py -m moto.server -H 127.0.0.1 -p 5000
```

In **Terminal 2**, create the local bucket (using *fake credentials*):

```powershell
$env:AWS_ACCESS_KEY_ID = "testing"
$env:AWS_SECRET_ACCESS_KEY = "testing"
$env:AWS_DEFAULT_REGION = "us-east-1"
py -c "import boto3; boto3.client('s3', endpoint_url='http://127.0.0.1:5000', region_name='us-east-1').create_bucket(Bucket='accounting-vault-local')"
```

Set these entries in **`.env.local`** (which must remain private):

```dotenv
ENABLE_LIVE_INTEGRATIONS=true
INTEGRATION_LAB_ADMIN_TOKEN=put-a-long-random-password-here
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=testing
AWS_SECRET_ACCESS_KEY=testing
S3_BUCKET=accounting-vault-local
S3_PREFIX=integration-lab/
S3_ENDPOINT=http://127.0.0.1:5000
S3_FORCE_PATH_STYLE=true
```

Restart Next.js and open the vault. Select **Live S3**, enter your admin token, and click **Connect / refresh**. The **Live S3** toggle actually uses Moto in this setup, so there are no AWS charges. Test upload, listing, review changes, revisions, and downloads. The presigned download URL points to `127.0.0.1:5000` and expires after 60 seconds.

### Company-owned AWS testing (later)

Use a dedicated **private test bucket**, not real customer data or personal AWS billing. Turn on **Block Public Access**, enforce HTTPS, use least-privilege IAM credentials, and consider budget alerts. Remove local-emulator options from `.env.local`:

```dotenv
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
```

The sample policy below assumes `S3_BUCKET=company-test-bucket` and `S3_PREFIX=integration-lab/`. Replace only the bucket placeholder. A limited role or IAM identity should have access to no other buckets; never use root access keys.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListVaultMetadataOnly",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::company-test-bucket",
      "Condition": { "StringLike": { "s3:prefix": ["integration-lab/accounting-vault/records/*"] } }
    },
    {
      "Sid": "ReadWriteVaultObjectsOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::company-test-bucket/integration-lab/accounting-vault/*"
    }
  ]
}
```

The original generic Storage panel uses a broader prefix and may not work under this limited policy; the Accounting Vault will. IAM restrictions must be verified with an authorized AWS administrator.

**Cost warnings:** AWS free-plan eligibility and credits depend on account. S3 is usage-based; storage, requests, retrieval, transfer, and retained old revisions may incur charges when on a paid account. **Moto and local Demo cost ₹0 in AWS fees.** Do not enable company live calls without approval.

## API reference

All endpoints below are **local-development-only**. With `mode=demo` they use local disk; with `mode=live` they use the configured S3 endpoint, require `ENABLE_LIVE_INTEGRATIONS=true` and a matching `x-lab-token` header.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/accounting/documents?mode=demo` | GET | List up to 250 record summaries |
| `/api/accounting/documents` | POST | Form data: `mode`, `client`, `financialYear`, `category`, `source`, `assignedTo`, `file` |
| `/api/accounting/documents/{id}` | PATCH | JSON: `mode`, `status`, optional `assignedTo` and `note` |
| `/api/accounting/documents/{id}/replace` | POST | Form data: `mode`, `file`; stores a new revision |
| `/api/accounting/documents/{id}/download` | POST | JSON: `mode`, optional `revisionId`; returns local base64 or presigned URL |

Raw S3 keys stay on the server; the browser receives stable document/revision IDs and metadata. Download links are short-lived **bearer URLs** and must not be posted in public chats or logged.

## Verification

```powershell
npm run lint
npm run typecheck
npm run build
node --test
```

Test manually with fabricated documents: upload; filter; restart and confirm persistence; submit → review → approve; reject submitted → approved; replace, then download both versions; archive and restore; switch to Moto and test again when ready.

## Before actual accounting-client data

This module deliberately **does not** implement: real employee login/identity, per-client authorization, a production database, virus and document scanning, security event storage, audit immutability, retention/deletion rules, backups/restore, DPIA or regulatory assessment, ITR e-filing, file-to-client ownership verification, automated WhatsApp media downloads, or reliable concurrent writes across multiple app instances. Do not deploy it for those uses until the requirements are designed, implemented and reviewed with the client and security team.

## AWS references

- [SDK v3 JavaScript S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [S3 upload via presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) (future path for larger uploads)
- [S3 security best practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [S3 object metadata / copy behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/copy-object.html)
- [Presigned download URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)
- [Moto server](https://docs.getmoto.org/en/latest/docs/server_mode.html)
