# Meta-Shield

Meta-Shield is a zero-trust metadata defense system. It inspects user-uploaded files for privacy and security leaks, explains what those leaks mean, sanitizes supported files, and can forward the cleaned outputs by email or package them into a clean ZIP.

This repository is the Flask backend and backend-side documentation. The active Next.js dashboard lives in the sibling `../metaUI` directory.

## 1. What This Project Does

Meta-Shield processes user-supplied files through a consistent security pipeline:

1. Accept a file upload
2. Detect the file category
3. Extract metadata
4. Identify sensitive metadata
5. Assign a risk level
6. Strip metadata where supported
7. Return a structured report
8. Optionally download or email the sanitized output

The system currently supports:

- Images: `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`
- Documents: `.pdf`, `.docx`
- Media: `.mp4`, `.mov`, `.mkv`, `.mp3`, `.wav`, `.aac`

HEIC is not enabled by default.

## 2. Mental Model

If an AI or engineer needs one sentence to understand the codebase, it is this:

Meta-Shield is a Flask API that routes uploads to specialized metadata analyzers and cleaners by file type, while a sibling Next.js UI calls those routes through `/backend/*` rewrites.

The active system has two runtime layers:

- Backend: `metashield/`
- Frontend: `../metaUI/`

The backend is authoritative for:

- file validation
- metadata extraction
- risk scoring
- sanitization
- audit artifact creation
- SMTP delivery
- batch ZIP preparation

The frontend is a client/orchestrator for:

- upload UX
- scan / strip / send actions
- detailed findings display
- batch workflow controls

## 3. High-Level Architecture

```text
User
  |
  v
Next.js dashboard (../metaUI)
  |
  |  /backend/*
  v
Flask backend (metashield/app.py)
  |
  +--> Image path -----> exif_stripper.py
  |
  +--> Document path --> document_scanner.py / document_cleaner.py
  |
  +--> Media path -----> services/media_processor.py
  |
  +--> Single send ----> dlp_interceptor.py + services/email_service.py
  |
  +--> Batch send -----> routes/batch_mail.py + services/batch_processor.py
  |
  +--> Artifacts ------> uploads/ and outputs/
```

## 4. Repo Layout And Ownership

### Backend (`metashield/`)

```text
metashield/
|-- app.py
|-- exif_stripper.py
|-- document_scanner.py
|-- document_cleaner.py
|-- dlp_interceptor.py
|-- test_cli.py
|-- requirements.txt
|-- progress.md
|-- .env.example
|-- outputs/
|-- uploads/
|-- routes/
|   `-- batch_mail.py
`-- services/
    |-- batch_processor.py
    |-- email_service.py
    `-- media_processor.py
```

### Frontend (`../metaUI/`)

```text
metaUI/
|-- app/page.tsx
|-- app/layout.tsx
|-- app/globals.css
|-- components/opaque/
|   |-- header.tsx
|   |-- upload-box.tsx
|   |-- results-panel.tsx
|   |-- action-panel.tsx
|   |-- batch-panel.tsx
|   |-- scan-logs.tsx
|   `-- dashboard-primitives.tsx
|-- lib/metashield-types.ts
|-- lib/metashield-client.ts
`-- next.config.mjs
```

## 5. Backend Module Map

This section is intended to let another AI quickly understand where logic lives.

### `app.py`

Primary Flask entry point.

Responsibilities:

- bootstraps Flask
- loads `.env`
- configures request-size limits
- registers the batch blueprint
- exposes the core routes:
  - `POST /upload`
  - `POST /scan`
  - `POST /strip`
  - `POST /send_email`
  - `GET /download_clean`
  - `GET /download_original`
- keeps the legacy Flask UI alive at `/`
- dispatches files by type to image, document, or media handlers

Important behavior:

- default backend request cap is `512 MB`
- debug defaults to on
- Flask auto-reloader defaults to off to avoid dev-proxy disconnects during artifact writes

### `exif_stripper.py`

Image metadata engine.

Responsibilities:

- parse EXIF
- detect sensitive tags
- explain attacker use and user danger
- detect GPS exposure and invalid GPS placeholders
- detect embedded thumbnails
- strip EXIF by rewriting the image

### `document_scanner.py`

Document metadata scanner for PDF and DOCX.

Responsibilities:

- detect whether a file is a supported document
- extract PDF and DOCX metadata
- detect sensitive document indicators such as:
  - author identities
  - last modified by
  - comments
  - revision / tracked changes flags
  - embedded objects
  - internal path leakage
- assign risk levels and recommendations

### `document_cleaner.py`

Document metadata cleaner.

Responsibilities:

- sanitize PDF metadata
- sanitize DOCX core/app/custom properties
- remove comments and tracked-change style markup where handled
- write clean outputs to `outputs/`

### `services/media_processor.py`

Video and audio metadata engine.

Responsibilities:

- detect supported media files
- enforce per-file media size limits
- extract metadata through `ffprobe`
- strip metadata through `ffmpeg`
- detect sensitive media fields such as:
  - encoder / producer / toolchain
  - creation timestamps
  - location-style tags
  - device identifiers
  - artist / owner / publisher fields
  - hidden or auxiliary streams

Important behavior:

- default media size cap is `200 MB` per file
- uses `-map_metadata -1` and stream-copy mode
- uses `-fflags +bitexact` to avoid FFmpeg re-stamping `Lavf...` encoder metadata on cleaned outputs

### `dlp_interceptor.py`

Single-file sanitize-and-forward pipeline.

Responsibilities:

- take one file through clean-and-audit flow
- reuse the appropriate cleaner based on file type
- assemble sanitized email content
- write audit artifacts such as:
  - `clean_email.eml`
  - `latest_audit.json`

This is the main single-file DLP path.

### `services/email_service.py`

Shared SMTP helper layer.

Responsibilities:

- load SMTP settings from environment
- parse recipients
- resolve sender
- create and send one email with attachments

### `services/batch_processor.py`

Multi-file sanitize layer.

Responsibilities:

- iterate through many uploaded files
- sanitize each supported file independently
- continue if one file fails
- collect per-file status
- build batch ZIP artifacts

### `routes/batch_mail.py`

Batch endpoints.

Responsibilities:

- expose one-email batch send route
- expose batch strip / clean-ZIP preparation route
- expose batch clean download route

Route names:

- `POST /send-mail-batch`
- `POST /send_mail_batch`
- `POST /strip-batch`
- `POST /strip_batch`
- `GET /download_batch_clean?artifact=<name>`

### `test_cli.py`

CLI runner for local verification.

Responsibilities:

- scan one file
- print the report
- sanitize the file
- run the DLP interception path
- write outputs for manual inspection

## 6. Frontend Module Map

The active dashboard is no longer a single giant component. It was refactored into composed pieces.

### `../metaUI/app/page.tsx`

Top-level orchestration for the dashboard.

Responsibilities:

- choose between single-file and batch flows
- own high-level stage transitions
- call API client helpers
- pass normalized state into presentational components

### `../metaUI/lib/metashield-client.ts`

Single place for backend requests.

Responsibilities:

- upload a file
- scan a file
- strip a file
- send a single sanitized email
- prepare a batch clean ZIP
- send a batch email
- normalize JSON error payloads with `ApiPayloadError`

### `../metaUI/lib/metashield-types.ts`

Shared frontend contract types.

Important shapes:

- `MetadataReport`
- `StripResponse`
- `SendEmailResponse`
- `BatchMailResponse`

### `../metaUI/components/opaque/*`

The dashboard UI is split into focused sections:

- `header.tsx`: top header and stage framing
- `upload-box.tsx`: file selection, drag/drop, multi-select behavior
- `scan-logs.tsx`: rolling log display
- `results-panel.tsx`: metadata findings and exposure view
- `action-panel.tsx`: strip / send / download actions
- `batch-panel.tsx`: batch ZIP and batch send UX
- `dashboard-primitives.tsx`: shared cards, badges, helpers, presentation primitives

### `../metaUI/next.config.mjs`

Important frontend runtime behavior:

- rewrites `/backend/*` to the Flask server on port `5000`
- sets the proxy body-size cap
- allows local dev origins

Default proxy body-size limit is `512mb`.

## 7. File-Type Routing Rules

The backend routes by extension.

### Images

Extensions:

- `.jpg`
- `.jpeg`
- `.png`
- `.tif`
- `.tiff`

Scanner:

- `extract_metadata_report()` in `exif_stripper.py`

Cleaner:

- `strip_metadata()` in `exif_stripper.py`

### Documents

Extensions:

- `.pdf`
- `.docx`

Scanner:

- `extract_document_report()` in `document_scanner.py`

Cleaner:

- `strip_document_metadata()` in `document_cleaner.py`

### Media

Extensions:

- `.mp4`
- `.mov`
- `.mkv`
- `.mp3`
- `.wav`
- `.aac`

Scanner:

- `extract_media_metadata()` in `services/media_processor.py`

Cleaner:

- `strip_media_metadata()` in `services/media_processor.py`

## 8. Core Runtime Flows

### Single-file scan

1. Frontend uploads the file through `/upload`
2. Backend stores the original in `uploads/`
3. Frontend calls `/scan` with the stored filename
4. Backend picks the file handler by extension
5. Specialized scanner returns a normalized `MetadataReport`
6. Frontend renders findings, risk, and recommendations

### Single-file strip

1. Frontend calls `/strip`
2. Backend routes to the correct cleaner
3. Cleaner writes `outputs/clean_<filename>`
4. Backend returns before/after reports, removal stats, and audit details
5. Frontend offers download and optional email actions

### Single-file email send

1. Frontend submits sender, recipients, subject, and body to `/send_email`
2. Backend validates SMTP configuration
3. Backend reuses the DLP interceptor
4. Sanitized file is attached to one email
5. Email is sent once

### Batch clean ZIP

1. Frontend submits many files to `/strip-batch`
2. Batch processor sanitizes each supported file
3. Failures are collected without aborting the batch
4. Backend builds one ZIP artifact
5. Frontend receives `download_url`

### Batch send

1. Frontend submits many files plus one set of email fields to `/send-mail-batch`
2. Batch processor sanitizes supported files
3. Backend optionally zips outputs
4. Backend sends one email only
5. Response returns counts and per-file details

## 9. Response Shapes

The exact payloads are represented in `../metaUI/lib/metashield-types.ts`. The main shapes are:

### `MetadataReport`

Normalized scan result.

Common fields:

- `file`
- `file_type`
- `file_size_kb`
- `gps`
- `gps_warning`
- `sensitive_findings`
- `raw_tag_count`
- `sensitive_tag_count`
- `risk_level`
- `risk_reasons`
- `recommendations`
- `contains_hidden_data`
- `error`

Document-specific fields:

- `document_type`

Media-specific fields:

- `media_type`

### `StripResponse`

Normalized sanitize result.

Common fields:

- `before`
- `after`
- `tags_removed`
- `size_before_kb`
- `size_after_kb`
- `stripped_at`
- `success`
- `duration_ms`
- `audit`
- `clean_file`
- `smtp_enabled`
- `smtp_default_sender`

### `BatchMailResponse`

Batch result shape.

Common fields:

- `message`
- `error`
- `total_files`
- `processed`
- `failed`
- `details`
- `risk_summary`
- `zip_output`
- `attachment_count`
- `archive_name`
- `download_url`

## 10. Risk Model

Meta-Shield uses a coarse security severity model:

- `LOW`: little or no meaningful sensitive metadata
- `MEDIUM`: author or timeline metadata present
- `HIGH`: device fingerprints, internal users, encoder/toolchain, software stack, or infrastructure hints
- `CRITICAL`: direct location data, comments, tracked revisions, embedded objects, hidden streams, or other hidden-content exposure

The exact rules vary by file type, but the scanner outputs are normalized into the same top-level `risk_level` shape.

## 11. Storage Model

### `uploads/`

Holds the stored original uploads used for scan and strip operations.

### `outputs/`

Holds generated artifacts, such as:

- clean files
- clean batch ZIPs
- `clean_email.eml`
- `latest_audit.json`

Common artifact names:

- `clean_<name>.jpg`
- `clean_<name>.pdf`
- `clean_<name>.docx`
- `clean_<name>.mp4`
- `clean_<name>.mp3`
- `clean_batch_<id>.zip`

## 12. Configuration

### SMTP

Create `.env` from `.env.example`.

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your_app_password
SMTP_USE_TLS=true
SMTP_DEFAULT_SENDER=
```

Notes:

- `SMTP_PASS` should be an app password for Gmail
- `SMTP_DEFAULT_SENDER` can be blank if the sender is entered in the UI

### Backend limits

Optional overrides:

```text
METASHIELD_MEDIA_MAX_MB=200
METASHIELD_MAX_REQUEST_MB=512
METASHIELD_DEBUG=true
METASHIELD_USE_RELOADER=false
```

Meaning:

- `METASHIELD_MEDIA_MAX_MB`: per-media-file limit
- `METASHIELD_MAX_REQUEST_MB`: Flask request-size limit
- `METASHIELD_DEBUG`: backend debug mode
- `METASHIELD_USE_RELOADER`: re-enable Flask auto-reload if explicitly needed

### Frontend limit

Optional override in the `metaUI` shell:

```text
METASHIELD_PROXY_MAX_BODY_SIZE=512mb
```

This controls the Next.js proxy limit for `/backend/*`.

## 13. Dependencies

### Python packages

From `requirements.txt`:

- `Flask`
- `Pillow`
- `piexif`
- `python-docx`
- `pypdf`

### System tools

Required for media support:

- `ffmpeg`
- `ffprobe`

If they are missing, media routes return clear errors rather than crashing the whole app.

## 14. Run The Project

### Backend

From `metashield/`:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Backend URL:

```text
http://127.0.0.1:5000
```

### Frontend

From the sibling `metaUI/` directory:

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend URL:

```text
http://127.0.0.1:3000
```

## 15. Operational Notes And Gotchas

- The backend is Flask, not FastAPI
- The legacy Flask UI still exists at `http://127.0.0.1:5000`
- The main modern UI is the sibling Next.js dashboard
- The project now operates only on user-supplied files
- Batch clean download works even if SMTP is not configured
- Media files beyond the configured limit are rejected intentionally
- FFmpeg and FFprobe must be on `PATH` for media support
- The Flask reloader is off by default because artifact writes can trigger mid-request restarts that look like proxy disconnects in Next.js dev mode
- The cleaned media pipeline explicitly avoids FFmpeg adding a fresh `encoder=Lavf...` metadata tag

## 16. How To Verify Quickly

### Backend compile check

```powershell
python -m py_compile app.py exif_stripper.py document_scanner.py document_cleaner.py dlp_interceptor.py test_cli.py services\batch_processor.py services\email_service.py services\media_processor.py routes\batch_mail.py
```

### CLI check

```powershell
python test_cli.py path\to\your_file
```

### Frontend build check

From `../metaUI/`:

```powershell
npm.cmd run build
```

## 17. If Another AI Needs To Continue Work

Start here:

1. Read this `README.md`
2. Read `progress.md`
3. Inspect `app.py` for route entry points
4. Inspect the specialized file handlers based on the feature area:
   - image: `exif_stripper.py`
   - document: `document_scanner.py` and `document_cleaner.py`
   - media: `services/media_processor.py`
   - single send: `dlp_interceptor.py`
   - batch send / batch ZIP: `services/batch_processor.py` and `routes/batch_mail.py`
5. If the task is frontend-related, move next to the sibling `../metaUI` directory and inspect:
   - `app/page.tsx`
   - `lib/metashield-client.ts`
   - `lib/metashield-types.ts`
   - `components/opaque/*`

For the implementation history and why decisions were made, see:

- [progress.md](C:/Users/teju/OneDrive/Desktop/opaque/metashield/progress.md)
