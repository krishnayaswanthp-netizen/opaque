# Meta-Shield

Meta-Shield is a zero-trust metadata defense demo built around a Flask backend and a Next.js
dashboard. It scans uploaded files for sensitive metadata, strips that metadata where supported,
and can optionally send sanitized attachments through SMTP.

The current build supports:

- Image metadata analysis and stripping
- PDF and DOCX metadata analysis and stripping
- Video and audio metadata analysis and stripping
- Single-file scan / strip / download workflows
- Multi-file dashboard workflows with one clean ZIP output
- Optional in-app email sending after sanitization

## Project layout

```text
metashield/
|-- app.py                    # Flask backend + legacy Flask UI
|-- exif_stripper.py          # image metadata scan + strip
|-- document_scanner.py       # PDF / DOCX metadata scan
|-- document_cleaner.py       # PDF / DOCX metadata strip
|-- dlp_interceptor.py        # DLP interception + email assembly
|-- test_cli.py               # CLI demo runner
|-- services/
|   |-- batch_processor.py    # multi-file sanitize + batch prep
|   `-- email_service.py      # SMTP / message helpers
|-- routes/
|   `-- batch_mail.py         # batch mail + batch clean download routes
|-- outputs/                  # generated clean artifacts and audits
|-- uploads/                  # uploaded source files
|-- progress.md               # implementation progress log
`-- requirements.txt

../metaUI/
|-- app/page.tsx              # integrated Next.js dashboard
`-- next.config.mjs           # proxies /backend/* to Flask
```

## Supported file types

- `.jpg`
- `.jpeg`
- `.png`
- `.tif`
- `.tiff`
- `.pdf`
- `.docx`
- `.mp4`
- `.mov`
- `.mkv`
- `.mp3`
- `.wav`
- `.aac`

HEIC is not enabled by default in this repo.

## Media tooling requirement

Video and audio support depends on `ffprobe` and `ffmpeg`.

Meta-Shield uses:

- `ffprobe` to inspect media metadata in JSON form
- `ffmpeg` with `-map_metadata -1` and stream copy mode to strip metadata without re-encoding

If those binaries are not installed, media scan / strip routes return a clear error instead of
breaking the rest of the application.

Install FFmpeg from the official distribution for your OS and make sure both `ffmpeg` and
`ffprobe` are available on your system `PATH` before starting the backend.

## Quick start

### 1. Install Python dependencies

From `metashield/` on Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

From `metashield/` on Windows Command Prompt:

```cmd
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
```

On macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Run the backend

From `metashield/`:

```bash
python app.py
```

Backend URL:

```text
http://127.0.0.1:5000
```

### 3. Run the Next.js dashboard

From the sibling `metaUI/` folder:

```bash
npm install
npm run dev
```

If Windows PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd install
npm.cmd run dev
```

Dashboard URL:

```text
http://127.0.0.1:3000
```

The dashboard proxies `/backend/*` requests to the Flask backend, so `python app.py`
must be running first.

### 4. Optional CLI demo

From `metashield/`:

```bash
python test_cli.py path/to/your_file
```

The CLI:

- scans the file
- prints the metadata exposure report
- writes a cleaned output
- runs the DLP interception flow
- stores artifacts in `outputs/`

## UI workflows

### Single-file workflow

Use the dashboard or legacy Flask UI to:

- upload one file
- scan metadata
- review sensitive findings
- strip metadata
- download the cleaned file
- optionally send the sanitized file by email

### Multi-file workflow

In the Next.js dashboard, you can select multiple files by:

- `Ctrl` + click on Windows for individual files
- `Shift` + click for a range
- dragging multiple files into the upload area

For multiple files, the dashboard can:

- prepare one clean ZIP of all supported files
- download that ZIP even if SMTP is not configured
- send one sanitized email containing the cleaned outputs
- process supported images, documents, videos, and audio files in the same batch

## SMTP setup

SMTP is optional. Scan, strip, and download features work without it.

To enable in-app email sending, create:

[.env](C:/Users/teju/OneDrive/Desktop/opaque/metashield/.env)

You can copy `.env.example`, then set:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your_app_password
SMTP_USE_TLS=true
SMTP_DEFAULT_SENDER=
```

Notes:

- `SMTP_PASS` should be an app password when using Gmail
- `SMTP_DEFAULT_SENDER` is optional
- if you change `.env`, restart `python app.py`

Optional environment variables for media-heavy workflows:

```text
METASHIELD_MEDIA_MAX_MB=200
METASHIELD_MAX_REQUEST_MB=512
```

- Default built-in values are `200 MB` per media file and `512 MB` per backend request
- `METASHIELD_MEDIA_MAX_MB` limits each uploaded media file
- `METASHIELD_MAX_REQUEST_MB` limits the total Flask request size, which matters for multi-file batches

## Backend endpoints

### Core routes

- `POST /upload`
- `POST /scan`
- `POST /strip`
- `GET /download_clean`
- `GET /download_original`
- `POST /send_email`

### Batch routes

- `POST /send-mail-batch`
- `POST /send_mail_batch`
- `POST /strip-batch`
- `POST /strip_batch`
- `GET /download_batch_clean?artifact=<name>`

## What Meta-Shield detects

### Images

- GPS coordinates and altitude
- camera make / model / software fingerprints
- serial numbers and owner-style fields
- timestamps and timezone offsets
- host computer names
- embedded thumbnail leakage
- invalid or placeholder GPS blocks

### Documents

- PDF author, creator, producer, and document timestamps
- DOCX author and last modified by
- comments, revision history, and custom properties
- hidden or embedded-content indicators where detectable

### Video and audio

- location tags and QuickTime GPS-style metadata where present
- encoder and software fingerprints
- device make and model metadata
- creation timestamps
- artist, owner, publisher, and descriptive fields
- embedded cover art or auxiliary attachment streams

## Risk model

- `CRITICAL`: exact location data, hidden comments, tracked revisions, embedded objects
- `HIGH`: internal user identities, device fingerprints, software / infrastructure exposure
- `MEDIUM`: author plus timeline metadata
- `LOW`: minimal or no meaningful sensitive metadata

## Output artifacts

Generated artifacts are written to:

```text
outputs/
```

Common outputs include:

- `clean_email.eml`
- `clean_<name>.jpg`
- `clean_<name>.pdf`
- `clean_<name>.docx`
- `clean_<name>.mp4`
- `clean_<name>.mov`
- `clean_<name>.mkv`
- `clean_<name>.mp3`
- `clean_<name>.wav`
- `clean_<name>.aac`
- `clean_batch_<id>.zip`
- `latest_audit.json`

## Python usage

```python
from document_cleaner import strip_document_metadata
from document_scanner import extract_document_report
from exif_stripper import extract_metadata_report, strip_metadata

image_report = extract_metadata_report("photo.jpg")
image_result = strip_metadata("photo.jpg", "clean_photo.jpg")

doc_report = extract_document_report("report.docx")
doc_result = strip_document_metadata("report.docx", "clean_report.docx")
```

## Notes

- The legacy Flask UI is still available at `http://127.0.0.1:5000`
- The newer dashboard lives in the sibling `metaUI/` app
- The project now uses only user-supplied files for analysis
- Batch clean download works even when SMTP is not configured
- Media files larger than the configured limit are rejected to protect backend memory and temp storage

For a milestone-by-milestone record of what was implemented and why, see
[progress.md](C:/Users/teju/OneDrive/Desktop/opaque/metashield/progress.md).
