"""
Meta-Shield: Email delivery helpers
Shared SMTP loading and email construction for batch delivery flows.
"""

from __future__ import annotations

import mimetypes
import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import getaddresses
from pathlib import Path


@dataclass(frozen=True)
class SMTPSettings:
    enabled: bool
    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    smtp_pass: str | None
    use_tls: bool
    default_sender: str | None


def load_smtp_settings() -> SMTPSettings:
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

    return SMTPSettings(
        enabled=bool(host),
        smtp_host=host or None,
        smtp_port=port,
        smtp_user=(os.getenv("SMTP_USER") or "").strip() or None,
        smtp_pass=(os.getenv("SMTP_PASS") or "").strip() or None,
        use_tls=_env_flag("SMTP_USE_TLS", default=True),
        default_sender=default_sender or None,
    )


def parse_recipients(raw_value) -> list[str]:
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


def resolve_sender(sender: str | None, settings: SMTPSettings) -> str:
    resolved = (sender or settings.default_sender or "").strip()
    if resolved:
        return resolved

    raise ValueError(
        "A sender email address is required. Provide one in the form or set "
        "SMTP_DEFAULT_SENDER / SMTP_FROM on the backend."
    )


def send_email_with_attachments(
    *,
    sender: str,
    recipients: list[str],
    subject: str,
    body: str,
    attachments: list[Path],
    settings: SMTPSettings,
) -> None:
    if not settings.enabled or not settings.smtp_host:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST (and optional SMTP_PORT, "
            "SMTP_USER, SMTP_PASS, SMTP_USE_TLS, SMTP_DEFAULT_SENDER) and restart the backend."
        )

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = f"[META-SHIELD SANITIZED] {subject}"
    msg["X-MetaShield"] = "Batch metadata-sanitized by Meta-Shield DLP v1.0"
    msg.set_content(
        body
        + "\n\n---\n[Meta-Shield] This email was processed and supported attachment metadata was sanitized."
    )

    for attachment_path in attachments:
        file_path = Path(attachment_path)
        content_type, _ = mimetypes.guess_type(file_path.name)
        if not content_type:
            maintype, subtype = "application", "octet-stream"
        else:
            maintype, subtype = content_type.split("/", 1)

        with file_path.open("rb") as handle:
            msg.add_attachment(
                handle.read(),
                maintype=maintype,
                subtype=subtype,
                filename=file_path.name,
            )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.use_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_pass:
            server.login(settings.smtp_user, settings.smtp_pass)
        server.send_message(msg)


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}
