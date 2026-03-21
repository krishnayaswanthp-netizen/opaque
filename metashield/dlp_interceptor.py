"""
Meta-Shield: Mock DLP Email Interceptor
Simulates an email gateway that intercepts outgoing emails,
strips EXIF from attachments, and forwards a clean email.
"""

import json
import smtplib
from datetime import datetime
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from exif_stripper import strip_metadata


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"


class DLPInterceptor:
    """
    Zero-Trust Email Interceptor.
    Intercepts an outgoing email, strips EXIF from image attachments,
    and optionally forwards the sanitized email via SMTP.
    """

    def __init__(
        self,
        smtp_host=None,
        smtp_port=587,
        smtp_user=None,
        smtp_pass=None,
        use_tls=True,
        artifact_dir=None,
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_pass = smtp_pass
        self.use_tls = use_tls
        self.interception_log = []
        self.artifact_dir = Path(artifact_dir) if artifact_dir else DEFAULT_OUTPUT_DIR
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def intercept(
        self,
        sender: str,
        recipients: list,
        subject: str,
        body: str,
        attachments: list,
        send_email: bool = False,
    ) -> dict:
        """
        Full interception pipeline:
        1. Scan attachments for metadata
        2. Strip EXIF from image attachments
        3. Build a clean email
        4. Optionally send it via SMTP
        """
        start_time = datetime.now()
        audit = {
            "intercepted_at": start_time.isoformat(),
            "sender": sender,
            "recipients": recipients,
            "subject": subject,
            "total_attachments": len(attachments),
            "images_processed": 0,
            "non_image_attachments": 0,
            "total_tags_removed": 0,
            "attachment_reports": [],
            "email_sent": False,
            "clean_email_path": None,
            "clean_email_output": None,
            "artifact_dir": str(self.artifact_dir),
        }

        clean_attachments = []

        for index, raw_path in enumerate(attachments, start=1):
            attachment_path = Path(raw_path)
            if not attachment_path.exists():
                raise FileNotFoundError(f"Attachment not found: {attachment_path}")

            extension = attachment_path.suffix.lower()
            if extension in IMAGE_EXTENSIONS:
                clean_name = f"clean_{index}_{attachment_path.stem}.jpg"
                artifact_clean_path = self.artifact_dir / clean_name

                result = strip_metadata(str(attachment_path), str(artifact_clean_path))
                result["artifact_output_file"] = str(artifact_clean_path)

                audit["images_processed"] += 1
                audit["total_tags_removed"] += result["tags_removed"]
                audit["attachment_reports"].append(result)
                clean_attachments.append(artifact_clean_path)
            else:
                clean_attachments.append(attachment_path)
                audit["non_image_attachments"] += 1
                audit["attachment_reports"].append(
                    {
                        "file": str(attachment_path),
                        "type": "non-image",
                        "action": "passed through unchanged",
                    }
                )

        msg = self._build_email(sender, recipients, subject, body, clean_attachments)
        clean_email_output = self.artifact_dir / "clean_email.eml"
        with open(clean_email_output, "wb") as handle:
            handle.write(msg.as_bytes())

        audit["clean_email_path"] = str(clean_email_output)
        audit["clean_email_output"] = str(clean_email_output)

        if send_email and self.smtp_host:
            self._send(msg, sender, recipients)
            audit["email_sent"] = True

        audit["duration_ms"] = round(
            (datetime.now() - start_time).total_seconds() * 1000,
            1,
        )
        audit["audit_report_output"] = str(self.artifact_dir / "latest_audit.json")
        with open(audit["audit_report_output"], "w", encoding="utf-8") as handle:
            json.dump(audit, handle, indent=2)

        self.interception_log.append(audit)
        return audit

    def _build_email(self, sender, recipients, subject, body, attachments):
        msg = MIMEMultipart()
        msg["From"] = sender
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = f"[META-SHIELD SANITIZED] {subject}"
        msg["X-MetaShield"] = "EXIF-stripped by Meta-Shield DLP v1.0"

        msg.attach(
            MIMEText(
                body
                + "\n\n---\n[Meta-Shield] This email was processed and image metadata was stripped.",
                "plain",
            )
        )

        for attachment_path in attachments:
            with open(attachment_path, "rb") as handle:
                data = handle.read()
            part = MIMEBase("application", "octet-stream")
            part.set_payload(data)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{Path(attachment_path).name}"',
            )
            msg.attach(part)

        return msg

    def _send(self, msg, sender, recipients):
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            if self.use_tls:
                server.starttls()
            if self.smtp_user and self.smtp_pass:
                server.login(self.smtp_user, self.smtp_pass)
            server.sendmail(sender, recipients, msg.as_bytes())
