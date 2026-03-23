# Meta-Shield

Meta-Shield is a small Python demo that scans image metadata, strips sensitive EXIF fields,
and simulates a DLP gateway sanitizing email attachments before they leave the network.

## Project layout

```text
metashield/
|-- exif_stripper.py      # metadata parsing and stripping
|-- dlp_interceptor.py    # mock email interceptor / DLP flow
|-- app.py                # Flask backend + legacy web UI
|-- test_cli.py           # CLI demo runner
`-- requirements.txt

../metaUI/
|-- app/page.tsx          # integrated Next.js frontend
`-- next.config.mjs       # proxies /backend/* to Flask
```

## How to run

### 1. Create a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the CLI on your image

```bash
python test_cli.py path/to/your_photo.jpg
```

What it does:

- Reads the image you provide
- Prints the metadata risk report before stripping
- Writes a clean image with metadata removed
- Runs the mock DLP interception flow
- Exports artifacts to the local `outputs/` folder

### 4. Run the Meta-Shield backend

```bash
python app.py
```

This starts the Flask backend on:

```text
http://127.0.0.1:5000
```

Optional SMTP settings for in-app email sending:

1. Create a local `.env` file in `metashield/`.
You can copy `.env.example` to `.env`.

2. Put only SMTP transport settings in that file:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your_app_password
SMTP_USE_TLS=true
SMTP_DEFAULT_SENDER=
```

3. Start the backend normally:

```bash
python app.py
```

If `SMTP_HOST` is not set in `.env`, the scan/strip/download flow still works, but the
"Send Sanitized Email" action in the UI stays disabled.

### 5. Run the integrated `metaUI` frontend

In a second terminal:

Windows PowerShell:

```powershell
cd ..\metaUI
npm install
npm run dev
```

macOS / Linux:

```bash
cd ../metaUI
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

The Next.js UI proxies `/backend/*` to the Flask app on `http://127.0.0.1:5000`,
so the Python backend must be running first.

If your Flask backend runs on a different URL, set:

```text
METASHIELD_BACKEND_URL=http://your-host:your-port
```

before starting the Next.js app.

### 6. Legacy Flask UI

The original Flask page still works at:

```text
http://127.0.0.1:5000
```

Both UIs only analyze files you explicitly upload from your machine.
When SMTP is configured on the backend, the integrated `metaUI` flow can also
send a sanitized attachment directly from the application after stripping.
The sender, recipients, subject, and body are entered in the UI, not in the CLI.

## Supported input formats

- `.jpg`
- `.jpeg`
- `.png`
- `.tif`
- `.tiff`

JPEG and TIFF are the safest paths for EXIF-heavy demos. HEIC is not enabled by default in this repo.

## Output artifacts

Running the interceptor writes reusable artifacts to:

```text
outputs/
```

You should see files like:

- `clean_email.eml`
- `clean_1_<name>.jpg`
- `latest_audit.json`

## Use it from Python

```python
from exif_stripper import extract_metadata_report, strip_metadata

report = extract_metadata_report("your_photo.jpg")
print(report)

result = strip_metadata("your_photo.jpg", "clean_photo.jpg")
print(result)
```

## SMTP integration

```python
from dlp_interceptor import DLPInterceptor

dlp = DLPInterceptor(
    smtp_host="smtp.gmail.com",
    smtp_port=587,
    smtp_user="you@gmail.com",
    smtp_pass="your_app_password",
)

audit = dlp.intercept(
    sender="employee@corp.com",
    recipients=["client@external.com"],
    subject="Whiteboard photos",
    body="See attached.",
    attachments=["photo.jpg"],
    send_email=True,
)
```

The web app uses the same interceptor internally. The SMTP-related backend
environment variables are:

- `SMTP_HOST`
- `SMTP_PORT` (defaults to `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_USE_TLS` (`true` by default)
- `SMTP_DEFAULT_SENDER` or `SMTP_FROM`

`SMTP_DEFAULT_SENDER` is optional. If you leave it blank, the UI will ask for
the sender email address when you send the sanitized attachment.

## What gets stripped

- GPS coordinates and altitude
- Camera make, model, serial number, and software
- Owner, artist, copyright, and user comments
- Timestamps and timezone offsets
- Host computer names

## Risk levels

- `CRITICAL`: GPS coordinates or device serial present
- `HIGH`: 5 or more sensitive tags
- `MEDIUM`: 2 to 4 sensitive tags
- `LOW`: 0 or 1 sensitive tag