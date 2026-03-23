"""
Meta-Shield: Batch email route
Accept multiple uploads, sanitize each file, and send one email with the clean artifacts.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, jsonify, request, send_file
from werkzeug.utils import secure_filename

from services.batch_processor import process_batch_files
from services.email_service import (
    load_smtp_settings,
    parse_recipients,
    resolve_sender,
    send_email_with_attachments,
)


logger = logging.getLogger(__name__)


def create_batch_mail_blueprint(base_dir: Path) -> Blueprint:
    batch_mail_bp = Blueprint("batch_mail", __name__)
    temp_root = base_dir / ".metashield_tmp" / "temp"
    temp_root.mkdir(parents=True, exist_ok=True)
    artifact_dir = base_dir / "outputs"
    artifact_dir.mkdir(parents=True, exist_ok=True)

    @batch_mail_bp.route("/strip-batch", methods=["POST"])
    @batch_mail_bp.route("/strip_batch", methods=["POST"])
    def strip_batch():
        uploads = request.files.getlist("files") or request.files.getlist("files[]")
        uploads = [item for item in uploads if item and item.filename]
        if not uploads:
            return jsonify({"error": "At least one file is required"}), 400

        working_dir = temp_root / f"batch_{uuid4().hex}"
        working_dir.mkdir(parents=True, exist_ok=False)

        try:
            batch_result = process_batch_files(
                uploads,
                working_dir,
                zip_output=True,
            )

            if not batch_result["processed"]:
                return (
                    jsonify(
                        {
                            "message": "No files were processed successfully",
                            "total_files": batch_result["total_files"],
                            "processed": batch_result["processed"],
                            "failed": batch_result["failed"],
                            "details": _response_details(batch_result["details"]),
                            "risk_summary": batch_result["risk_summary"],
                            "download_url": None,
                            "download_artifact": None,
                        }
                    ),
                    400,
                )

            artifact_name, download_url = _persist_batch_archive(
                batch_result["archive_path"],
                artifact_dir,
            )

            return jsonify(
                {
                    "message": "Clean batch prepared successfully",
                    "total_files": batch_result["total_files"],
                    "processed": batch_result["processed"],
                    "failed": batch_result["failed"],
                    "details": _response_details(batch_result["details"]),
                    "risk_summary": batch_result["risk_summary"],
                    "download_url": download_url,
                    "download_artifact": artifact_name,
                    "zip_output": True,
                }
            )
        finally:
            shutil.rmtree(working_dir, ignore_errors=True)

    @batch_mail_bp.route("/send-mail-batch", methods=["POST"])
    @batch_mail_bp.route("/send_mail_batch", methods=["POST"])
    def send_mail_batch():
        uploads = request.files.getlist("files") or request.files.getlist("files[]")
        uploads = [item for item in uploads if item and item.filename]
        if not uploads:
            return jsonify({"error": "At least one file is required"}), 400

        recipient_raw = (
            request.form.get("recipient")
            or request.form.get("recipients")
            or request.form.get("to")
            or ""
        ).strip()
        if not recipient_raw:
            return jsonify({"error": "Recipient email is required"}), 400

        try:
            recipients = parse_recipients(recipient_raw)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        try:
            smtp_settings = load_smtp_settings()
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        if not smtp_settings.enabled:
            return jsonify(
                {
                    "error": (
                        "SMTP is not configured. Set SMTP_HOST (and optional SMTP_PORT, "
                        "SMTP_USER, SMTP_PASS, SMTP_USE_TLS, SMTP_DEFAULT_SENDER) and restart the backend."
                    )
                }
            ), 400

        try:
            sender = resolve_sender(request.form.get("sender"), smtp_settings)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        subject = (request.form.get("subject") or "").strip()
        body = (request.form.get("body") or "").strip()
        zip_output = _form_flag(request.form.get("zip_output"), default=True)

        working_dir = temp_root / f"batch_{uuid4().hex}"
        working_dir.mkdir(parents=True, exist_ok=False)

        try:
            batch_result = process_batch_files(
                uploads,
                working_dir,
                zip_output=zip_output,
            )

            processed_attachments = batch_result["attachments"]
            if not processed_attachments:
                logger.warning("Batch email aborted because no files were processed successfully.")
                return (
                    jsonify(
                        {
                            "message": "No files were processed successfully",
                            "total_files": batch_result["total_files"],
                            "processed": batch_result["processed"],
                            "failed": batch_result["failed"],
                            "details": _response_details(batch_result["details"]),
                            "risk_summary": batch_result["risk_summary"],
                            "zip_output": zip_output,
                        }
                    ),
                    400,
                )

            email_subject = subject or f"Sanitized batch from Meta-Shield ({batch_result['processed']} files)"
            email_body = body or (
                "The attached files were sanitized by Meta-Shield before being shared."
            )

            try:
                send_email_with_attachments(
                    sender=sender,
                    recipients=recipients,
                    subject=email_subject,
                    body=email_body,
                    attachments=processed_attachments,
                    settings=smtp_settings,
                )
            except Exception as exc:
                logger.exception("Batch email delivery failed.")
                return (
                    jsonify(
                        {
                            "error": f"SMTP delivery failed: {exc}",
                            "total_files": batch_result["total_files"],
                            "processed": batch_result["processed"],
                            "failed": batch_result["failed"],
                            "details": _response_details(batch_result["details"]),
                            "risk_summary": batch_result["risk_summary"],
                            "zip_output": zip_output,
                        }
                    ),
                    500,
                )

            logger.info(
                "Batch email sent to %s with %s processed file(s).",
                ", ".join(recipients),
                batch_result["processed"],
            )

            artifact_name, download_url = _persist_batch_archive(
                batch_result["archive_path"],
                artifact_dir,
            )

            return jsonify(
                {
                    "message": "Mail sent successfully",
                    "total_files": batch_result["total_files"],
                    "processed": batch_result["processed"],
                    "failed": batch_result["failed"],
                    "details": _response_details(batch_result["details"]),
                    "risk_summary": batch_result["risk_summary"],
                    "zip_output": zip_output,
                    "sender": sender,
                    "recipients": recipients,
                    "subject": email_subject,
                    "attachment_count": len(processed_attachments),
                    "archive_name": artifact_name,
                    "download_url": download_url,
                    "download_artifact": artifact_name,
                }
            )
        finally:
            shutil.rmtree(working_dir, ignore_errors=True)

    @batch_mail_bp.route("/download_batch_clean")
    def download_batch_clean():
        artifact = request.args.get("artifact")
        safe_name = secure_filename(Path(artifact or "").name)
        if not safe_name:
            return "Missing artifact", 400

        resolved_path = artifact_dir / safe_name
        if not resolved_path.exists():
            return "Batch artifact not found", 404

        return send_file(resolved_path, as_attachment=True, download_name=safe_name)

    return batch_mail_bp


def _form_flag(value, *, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _response_details(details: list[dict]) -> list[dict]:
    public_details = []
    for item in details:
        public_details.append(
            {
                "filename": item.get("filename"),
                "status": item.get("status"),
                "reason": item.get("reason"),
                "file_type": item.get("file_type"),
                "risk_level": item.get("risk_level"),
                "contains_hidden_data": item.get("contains_hidden_data"),
                "tags_removed": item.get("tags_removed"),
                "output_filename": item.get("output_filename"),
            }
        )

    return public_details


def _persist_batch_archive(archive_path: str | None, artifact_dir: Path) -> tuple[str | None, str | None]:
    if not archive_path:
        return None, None

    source_path = Path(archive_path)
    if not source_path.exists():
        return None, None

    artifact_name = f"clean_batch_{uuid4().hex}.zip"
    destination = artifact_dir / artifact_name
    shutil.copy2(source_path, destination)
    return artifact_name, f"/download_batch_clean?artifact={artifact_name}"
