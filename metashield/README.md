# Meta-Shield

Meta-Shield is a small Python demo that scans image metadata, strips sensitive EXIF fields,
and simulates a DLP gateway sanitizing email attachments before they leave the network.

## Project layout

```text
metashield/
|-- exif_stripper.py      # metadata parsing and stripping
|-- dlp_interceptor.py    # mock email interceptor / DLP flow
|-- app.py                # Flask web UI
|-- test_cli.py           # CLI demo runner
`-- requirements.txt
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

### 4. Run the web demo

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

The web app lets you upload an image, inspect the exposed metadata, strip it,
and download the clean result. It only analyzes files you provide.

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
