"""
Meta-Shield: Web Demo Interface
Upload an image, inspect its metadata, then strip it through the DLP flow.
"""

import os
from email.utils import getaddresses
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, render_template_string, request, send_file
from werkzeug.utils import secure_filename

from dlp_interceptor import DLPInterceptor
from exif_stripper import extract_metadata_report


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meta-Shield DLP Demo</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --blue: #58a6ff;
    --text: #e6edf3;
    --muted: #8b949e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: "Courier New", monospace; }
  header {
    padding: 24px 40px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
  }
  header h1 { font-size: 1.4rem; color: var(--green); letter-spacing: 2px; }
  header .badge {
    background: var(--green);
    color: #000;
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: 20px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
  }
  .card h2 {
    font-size: 0.9rem;
    color: var(--muted);
    letter-spacing: 2px;
    margin-bottom: 16px;
    text-transform: uppercase;
  }
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: 6px;
    padding: 40px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .upload-zone:hover { border-color: var(--blue); }
  .upload-zone input { display: none; }
  .upload-zone p { color: var(--muted); font-size: 0.85rem; margin-top: 8px; }
  button {
    background: var(--green);
    color: #000;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-weight: bold;
    font-size: 0.85rem;
    letter-spacing: 1px;
    margin-top: 12px;
    width: 100%;
    transition: opacity 0.2s;
  }
  button:hover { opacity: 0.85; }
  button.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
  button.danger { background: var(--red); color: #fff; }
  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: bold;
    margin: 2px;
  }
  .tag.critical { background: rgba(248,81,73,0.15); color: var(--red); border: 1px solid var(--red); }
  .tag.high { background: rgba(210,153,34,0.15); color: var(--yellow); border: 1px solid var(--yellow); }
  .tag.medium { background: rgba(88,166,255,0.15); color: var(--blue); border: 1px solid var(--blue); }
  .tag.low { background: rgba(63,185,80,0.15); color: var(--green); border: 1px solid var(--green); }
  .tag.clean { background: rgba(63,185,80,0.15); color: var(--green); border: 1px solid var(--green); }
  .meta-item { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.82rem; }
  .meta-item:last-child { border-bottom: none; }
  .meta-key { color: var(--muted); }
  .meta-val { color: var(--text); word-break: break-all; }
  .meta-val.danger { color: var(--red); }
  .gps-box {
    background: rgba(248,81,73,0.08);
    border: 1px solid var(--red);
    border-radius: 6px;
    padding: 12px;
    margin: 12px 0;
    font-size: 0.82rem;
  }
  .gps-box a { color: var(--red); }
  .gps-box.warning {
    background: rgba(210,153,34,0.08);
    border-color: var(--yellow);
    color: var(--yellow);
  }
  .gps-box.warning a { color: var(--yellow); }
  .risk-bar { height: 4px; border-radius: 2px; margin: 8px 0 16px; }
  .risk-CRITICAL { background: var(--red); }
  .risk-HIGH { background: var(--yellow); }
  .risk-MEDIUM { background: var(--blue); }
  .risk-LOW { background: var(--green); }
  .log-line { font-size: 0.78rem; color: var(--muted); padding: 4px 0; word-break: break-word; }
  .log-line .ok { color: var(--green); }
  .log-line .err { color: var(--red); }
  #status { font-size: 0.8rem; color: var(--muted); margin-top: 8px; min-height: 20px; }
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .detail-panel {
    display: none;
    margin-top: 16px;
  }
  .detail-card {
    background: rgba(88,166,255,0.06);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-top: 12px;
  }
  .detail-card:first-child { margin-top: 0; }
  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .detail-title {
    font-size: 0.9rem;
    font-weight: bold;
    color: var(--text);
  }
  .detail-row {
    font-size: 0.8rem;
    color: var(--text);
    margin-top: 8px;
    line-height: 1.45;
  }
  .detail-row strong {
    color: var(--muted);
    display: inline-block;
    min-width: 120px;
  }
</style>
</head>
<body>

<header>
  <h1>META-SHIELD</h1>
  <span class="badge">DLP DEMO</span>
  <span style="color:var(--muted); font-size:0.8rem; margin-left:auto;">Zero-Trust Email Interceptor</span>
</header>

<div class="container">
  <div class="card" style="margin-bottom:24px;">
    <h2>Step 1 - Upload Image</h2>
    <div class="upload-zone" onclick="document.getElementById('fileInput').click()">
      <div style="font-size:2rem">[+]</div>
      <strong>Click to upload an image</strong>
      <p>Meta-Shield only analyzes metadata from files you provide</p>
      <input type="file" id="fileInput" accept=".jpg,.jpeg,.png,.tif,.tiff" onchange="handleFile(this)">
    </div>
    <p id="status">No file selected.</p>
  </div>

  <div class="grid">
    <div class="card" id="beforeCard" style="display:none;">
      <h2>Step 2 - Metadata Exposed (Before)</h2>
      <div id="beforeContent"></div>
      <button class="secondary" id="detailsButton" onclick="toggleDetailedView()" style="display:none; margin-top:16px;">
        Detailed View
      </button>
      <div class="detail-panel" id="detailsPanel"></div>
      <button class="danger" onclick="stripImage()" style="margin-top:16px;">
        Strip all metadata
      </button>
    </div>

    <div class="card" id="afterCard" style="display:none;">
      <h2>Step 3 - Forensically Clean (After)</h2>
      <div id="afterContent"></div>
      <button onclick="downloadClean()" style="margin-top:16px;">
        Download clean image
      </button>
    </div>
  </div>

  <div class="card" id="logCard" style="margin-top:24px; display:none;">
    <h2>DLP Interceptor Log</h2>
    <div id="logContent"></div>
  </div>
</div>

<script>
let uploadedFilename = null;
let currentSensitiveFindings = [];

async function handleFile(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('status').textContent = `Uploading ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.error) {
    document.getElementById('status').textContent = `Error: ${data.error}`;
    return;
  }

  uploadedFilename = data.filename;
  document.getElementById('status').textContent = `Uploaded: ${data.filename}`;
  await scanImage();
}

async function scanImage() {
  const res = await fetch('/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: uploadedFilename })
  });
  const report = await res.json();
  if (report.error) {
    document.getElementById('status').textContent = `Error: ${report.error}`;
    return;
  }
  renderBefore(report);
}

async function stripImage() {
  const res = await fetch('/strip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: uploadedFilename })
  });
  const result = await res.json();
  if (result.error) {
    document.getElementById('status').textContent = `Error: ${result.error}`;
    return;
  }
  renderAfter(result.after);
  renderLog(result);
}

function downloadClean() {
  window.location.href = '/download_clean';
}

function riskClass(risk) {
  return risk.toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDetailedView() {
  const panel = document.getElementById('detailsPanel');
  if (!currentSensitiveFindings.length) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = currentSensitiveFindings.map((finding) => `
    <div class="detail-card">
      <div class="detail-head">
        <div class="detail-title">${escapeHtml(finding.label)}</div>
        <span class="tag ${riskClass(finding.danger_level)}">${escapeHtml(finding.danger_level)}</span>
      </div>
      <div class="detail-row"><strong>Found value:</strong> ${escapeHtml(finding.value)}</div>
      <div class="detail-row"><strong>What it is:</strong> ${escapeHtml(finding.description)}</div>
      <div class="detail-row"><strong>Attacker use:</strong> ${escapeHtml(finding.attacker_use)}</div>
      <div class="detail-row"><strong>User danger:</strong> ${escapeHtml(finding.danger_to_user)}</div>
    </div>
  `).join('');
}

function toggleDetailedView() {
  const button = document.getElementById('detailsButton');
  const panel = document.getElementById('detailsPanel');
  const isHidden = panel.style.display === 'none' || panel.style.display === '';

  if (isHidden) {
    renderDetailedView();
    panel.style.display = 'block';
    button.textContent = 'Hide Detailed View';
  } else {
    panel.style.display = 'none';
    button.textContent = 'Detailed View';
  }
}

function renderBefore(report) {
  const card = document.getElementById('beforeCard');
  const content = document.getElementById('beforeContent');
  const detailsButton = document.getElementById('detailsButton');
  const detailsPanel = document.getElementById('detailsPanel');
  card.style.display = 'block';
  currentSensitiveFindings = report.sensitive_findings ?? [];
  detailsButton.style.display = currentSensitiveFindings.length ? 'block' : 'none';
  detailsButton.textContent = 'Detailed View';
  detailsPanel.style.display = 'none';
  detailsPanel.innerHTML = '';

  let html = `
    <span class="tag ${riskClass(report.risk_level)}">${report.risk_level} RISK</span>
    <div class="risk-bar risk-${report.risk_level}"></div>
    <div class="meta-item"><span class="meta-key">File: </span><span class="meta-val">${report.file}</span></div>
    <div class="meta-item"><span class="meta-key">Size: </span><span class="meta-val">${report.file_size_kb} KB</span></div>
    <div class="meta-item"><span class="meta-key">Total EXIF tags: </span><span class="meta-val">${report.raw_tag_count}</span></div>
    <div class="meta-item"><span class="meta-key">Sensitive tags: </span><span class="meta-val danger">${report.sensitive_tag_count}</span></div>
  `;

  if (report.thumbnail_present) {
    html += `<div class="meta-item"><span class="meta-key">Embedded thumbnail: </span><span class="meta-val danger">PRESENT (${(report.thumbnail_size_bytes / 1024).toFixed(1)} KB)</span></div>`;
  }

  if (report.gps) {
    html += `<div class="gps-box">
      <strong>GPS coordinates exposed</strong><br>
      Lat: ${report.gps.latitude} | Lon: ${report.gps.longitude}<br>
      Altitude: ${report.gps.altitude_m ?? 'N/A'} m<br>
      <a href="${report.gps.maps_url}" target="_blank">Open in Google Maps</a>
    </div>`;
  } else if (report.gps_warning) {
    html += `<div class="gps-box warning">
      <strong>GPS metadata detected</strong><br>
      ${report.gps_warning}
    </div>`;
  }

  if (Object.keys(report.device).length) {
    html += `<div class="meta-item"><span class="meta-key">Device: </span>
      <span class="meta-val danger">${report.device.make ?? ''} ${report.device.model ?? ''}</span></div>`;
    if (report.device.serial) {
      html += `<div class="meta-item"><span class="meta-key">Serial: </span><span class="meta-val danger">${report.device.serial}</span></div>`;
    }
    if (report.device.software) {
      html += `<div class="meta-item"><span class="meta-key">Software: </span><span class="meta-val">${report.device.software}</span></div>`;
    }
  }

  if (Object.keys(report.timestamps).length) {
    for (const [key, value] of Object.entries(report.timestamps)) {
      html += `<div class="meta-item"><span class="meta-key">${key}: </span><span class="meta-val danger">${value}</span></div>`;
    }
  }

  if (Object.keys(report.other_pii).length) {
    for (const [key, value] of Object.entries(report.other_pii)) {
      html += `<div class="meta-item"><span class="meta-key">${key}: </span><span class="meta-val danger">${value}</span></div>`;
    }
  }

  html += `<div style="margin-top:12px;"><strong style="font-size:0.8rem;color:var(--muted)">Risks:</strong><div class="pill-row">`;
  for (const reason of (report.risk_reasons ?? [])) {
    html += `<span class="tag critical">${reason}</span>`;
  }
  html += `</div></div>`;
  content.innerHTML = html;
}

function renderAfter(report) {
  const card = document.getElementById('afterCard');
  const content = document.getElementById('afterContent');
  card.style.display = 'block';

  content.innerHTML = `
    <span class="tag clean">CLEAN</span>
    <div class="risk-bar risk-LOW"></div>
    <div class="meta-item"><span class="meta-key">Sensitive tags: </span><span class="meta-val" style="color:var(--green)">0</span></div>
    <div class="meta-item"><span class="meta-key">Embedded thumbnail: </span><span class="meta-val" style="color:var(--green)">STRIPPED</span></div>
    <div class="meta-item"><span class="meta-key">GPS: </span><span class="meta-val" style="color:var(--green)">STRIPPED</span></div>
    <div class="meta-item"><span class="meta-key">Device info: </span><span class="meta-val" style="color:var(--green)">STRIPPED</span></div>
    <div class="meta-item"><span class="meta-key">Timestamps: </span><span class="meta-val" style="color:var(--green)">STRIPPED</span></div>
    <div class="meta-item"><span class="meta-key">Owner / Artist: </span><span class="meta-val" style="color:var(--green)">STRIPPED</span></div>
    <div class="meta-item"><span class="meta-key">File size: </span><span class="meta-val">${report.file_size_kb} KB</span></div>
  `;
}

function renderLog(result) {
  const logCard = document.getElementById('logCard');
  const logContent = document.getElementById('logContent');
  const audit = result.audit || {};
  const firstAttachment = (audit.attachment_reports || []).find(item => item.before);
  logCard.style.display = 'block';

  logContent.innerHTML = `
    <div class="log-line"><span class="ok">[INTERCEPT]</span> File intercepted before leaving the network</div>
    <div class="log-line"><span class="ok">[PARSE]</span> Binary EXIF headers parsed - ${result.before.raw_tag_count} tags found</div>
    <div class="log-line"><span class="err">[ALERT]</span> ${result.before.sensitive_tag_count} sensitive tags detected (risk: ${result.before.risk_level})</div>
    <div class="log-line"><span class="ok">[STRIP]</span> ${result.tags_removed} tags removed</div>
    <div class="log-line"><span class="ok">[VERIFY]</span> Post-strip scan: 0 sensitive tags remaining</div>
    <div class="log-line"><span class="ok">[EXPORT]</span> Clean attachment: ${firstAttachment?.artifact_output_file ?? result.clean_file ?? 'N/A'}</div>
    <div class="log-line"><span class="ok">[EMAIL]</span> Clean email artifact: ${audit.clean_email_output ?? 'N/A'}</div>
    <div class="log-line"><span class="ok">[AUDIT]</span> Audit JSON: ${audit.audit_report_output ?? 'N/A'}</div>
    <div class="log-line" style="margin-top:8px; color:var(--muted)">Duration: ${result.duration_ms ?? '-'} ms | Stripped at: ${result.stripped_at}</div>
  `;
}
</script>
</body>
</html>
"""


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_PATH = None
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def _load_local_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


_load_local_env_file(BASE_DIR / ".env")


def _is_allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _smtp_settings() -> dict:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port_raw = (os.getenv("SMTP_PORT") or "587").strip()

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError("SMTP_PORT must be a valid integer") from exc

    default_sender = (
        os.getenv("SMTP_DEFAULT_SENDER")
        or os.getenv("SMTP_FROM")
        or os.getenv("SMTP_USER")
        or ""
    ).strip()

    return {
        "enabled": bool(host),
        "smtp_host": host or None,
        "smtp_port": port,
        "smtp_user": (os.getenv("SMTP_USER") or "").strip() or None,
        "smtp_pass": (os.getenv("SMTP_PASS") or "").strip() or None,
        "use_tls": _env_flag("SMTP_USE_TLS", default=True),
        "default_sender": default_sender or None,
    }


def _build_smtp_interceptor() -> tuple[DLPInterceptor, dict]:
    settings = _smtp_settings()
    if not settings["enabled"]:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST (and optional SMTP_PORT, "
            "SMTP_USER, SMTP_PASS, SMTP_USE_TLS, SMTP_DEFAULT_SENDER) and restart the backend."
        )

    interceptor = DLPInterceptor(
        smtp_host=settings["smtp_host"],
        smtp_port=settings["smtp_port"],
        smtp_user=settings["smtp_user"],
        smtp_pass=settings["smtp_pass"],
        use_tls=settings["use_tls"],
    )
    return interceptor, settings


def _parse_recipients(raw_value) -> list[str]:
    if isinstance(raw_value, str):
        sources = [raw_value]
    elif isinstance(raw_value, list):
        sources = [str(item) for item in raw_value if str(item).strip()]
    else:
        sources = []

    parsed = [address.strip() for _, address in getaddresses(sources) if address.strip()]
    unique = list(dict.fromkeys(parsed))
    if not unique:
        raise ValueError("At least one valid recipient email address is required")
    return unique


def _resolve_uploaded_path(filename: str):
    safe_name = secure_filename(filename or "")
    if not safe_name:
        raise ValueError("Invalid or empty filename")

    resolved_path = UPLOAD_DIR / safe_name
    if not resolved_path.exists():
        raise FileNotFoundError(f"Uploaded file not found: {safe_name}")
    return safe_name, str(resolved_path)


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/upload", methods=["POST"])
def upload():
    incoming_file = request.files.get("file")
    if not incoming_file or not incoming_file.filename:
        return jsonify({"error": "No file provided"}), 400

    safe_name = secure_filename(Path(incoming_file.filename).name)
    if not safe_name or not _is_allowed_file(safe_name):
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return jsonify({"error": f"Unsupported file type. Allowed: {allowed}"}), 400

    unique_name = f"{Path(safe_name).stem}_{uuid4().hex[:8]}{Path(safe_name).suffix.lower()}"
    destination = UPLOAD_DIR / unique_name
    incoming_file.save(destination)
    return jsonify({"filename": unique_name, "path": str(destination)})


@app.route("/scan", methods=["POST"])
def scan():
    data = request.get_json(silent=True) or {}
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    try:
        _, image_path = _resolve_uploaded_path(filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404

    return jsonify(extract_metadata_report(image_path))


@app.route("/strip", methods=["POST"])
def strip():
    global CLEAN_PATH

    data = request.get_json(silent=True) or {}
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    try:
        safe_name, image_path = _resolve_uploaded_path(filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404

    interceptor = DLPInterceptor()
    try:
        audit = interceptor.intercept(
            sender="web-demo@metashield.local",
            recipients=["outbound@example.com"],
            subject=f"Web upload: {safe_name}",
            body="Attachment processed through the Meta-Shield web demo.",
            attachments=[image_path],
            send_email=False,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    attachment_report = next(
        (item for item in audit["attachment_reports"] if item.get("before")),
        None,
    )
    if not attachment_report:
        return jsonify({"error": "No image attachment report was generated"}), 500

    CLEAN_PATH = attachment_report.get("artifact_output_file") or attachment_report["output_file"]
    response = {
        **attachment_report,
        "duration_ms": audit["duration_ms"],
        "audit": audit,
        "clean_file": CLEAN_PATH,
        "smtp_enabled": _smtp_settings()["enabled"],
        "smtp_default_sender": _smtp_settings()["default_sender"],
    }
    return jsonify(response)


@app.route("/send_email", methods=["POST"])
def send_email():
    global CLEAN_PATH

    data = request.get_json(silent=True) or {}
    filename = data.get("filename")
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    try:
        recipients = _parse_recipients(data.get("recipients"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        safe_name, image_path = _resolve_uploaded_path(filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404

    try:
        interceptor, smtp_settings = _build_smtp_interceptor()
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    sender = (data.get("sender") or smtp_settings["default_sender"] or "").strip()
    if not sender:
        return jsonify(
            {
                "error": (
                    "A sender email address is required. Provide one in the form or set "
                    "SMTP_DEFAULT_SENDER / SMTP_FROM on the backend."
                )
            }
        ), 400

    email_subject = subject or f"Sanitized image from Meta-Shield: {safe_name}"
    email_body = body or (
        "This attachment was sanitized by Meta-Shield before being sent."
    )

    try:
        audit = interceptor.intercept(
            sender=sender,
            recipients=recipients,
            subject=email_subject,
            body=email_body,
            attachments=[image_path],
            send_email=True,
        )
    except Exception as exc:
        return jsonify({"error": f"SMTP delivery failed: {exc}"}), 500

    attachment_report = next(
        (item for item in audit["attachment_reports"] if item.get("before")),
        None,
    )
    if attachment_report:
        CLEAN_PATH = (
            attachment_report.get("artifact_output_file")
            or attachment_report.get("output_file")
            or CLEAN_PATH
        )

    return jsonify(
        {
            "message": f"Sanitized email sent to {', '.join(recipients)}",
            "email_sent": audit.get("email_sent", False),
            "sender": sender,
            "recipients": recipients,
            "subject": email_subject,
            "duration_ms": audit["duration_ms"],
            "clean_file": CLEAN_PATH,
            "clean_email_output": audit.get("clean_email_output"),
            "audit_report_output": audit.get("audit_report_output"),
            "attachment_report": attachment_report,
            "audit": audit,
            "smtp_enabled": smtp_settings["enabled"],
            "smtp_default_sender": smtp_settings["default_sender"],
        }
    )


@app.route("/download_clean")
def download_clean():
    if not CLEAN_PATH or not os.path.exists(CLEAN_PATH):
        return "No clean file available", 404
    return send_file(CLEAN_PATH, as_attachment=True)


@app.route("/download_original")
def download_original():
    filename = request.args.get("filename")
    if not filename:
        return "Missing filename", 400

    try:
        safe_name, original_path = _resolve_uploaded_path(filename)
    except ValueError as exc:
        return str(exc), 400
    except FileNotFoundError as exc:
        return str(exc), 404

    return send_file(original_path, as_attachment=True, download_name=safe_name)


if __name__ == "__main__":
    print("\nMeta-Shield DLP Demo")
    print("=" * 40)
    print("Open http://127.0.0.1:5000 in your browser\n")
    app.run(debug=True, port=5000)
