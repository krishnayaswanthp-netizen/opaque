"""
Meta-Shield: Batch file processing helpers
Process multiple files, sanitize metadata, and prepare clean artifacts for one email.
"""

from __future__ import annotations

import logging
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from document_cleaner import strip_document_metadata
from document_scanner import DOCUMENT_EXTENSIONS, is_document_file
from dlp_interceptor import IMAGE_EXTENSIONS
from exif_stripper import strip_metadata


logger = logging.getLogger(__name__)
RISKY_LEVELS = {"HIGH", "CRITICAL"}
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | DOCUMENT_EXTENSIONS


def process_batch_files(
    files: list[FileStorage],
    temp_dir: Path,
    *,
    zip_output: bool = False,
) -> dict:
    temp_dir.mkdir(parents=True, exist_ok=True)
    incoming_dir = temp_dir / "incoming"
    clean_dir = temp_dir / "clean"
    incoming_dir.mkdir(parents=True, exist_ok=True)
    clean_dir.mkdir(parents=True, exist_ok=True)

    details = []
    processed_paths = []
    risky_files = 0
    safe_files = 0

    for index, upload in enumerate(files, start=1):
        result = _process_single_upload(upload, index, incoming_dir, clean_dir)
        details.append(result)

        if result["status"] != "success":
            logger.warning(
                "Batch processing failed for %s: %s",
                result["filename"],
                result.get("reason") or "unknown error",
            )
            continue

        artifact_path = Path(result["artifact_output_file"])
        processed_paths.append(artifact_path)

        if result["risk_level"] in RISKY_LEVELS or result.get("contains_hidden_data"):
            risky_files += 1
        else:
            safe_files += 1

        logger.info(
            "Batch processed %s as %s (%s -> %s)",
            result["filename"],
            result["file_type"],
            result["risk_level"],
            artifact_path.name,
        )

    attachments = processed_paths
    archive_path = None
    if zip_output and processed_paths:
        archive_path = temp_dir / "metashield_batch_clean.zip"
        _build_zip_archive(processed_paths, archive_path)
        attachments = [archive_path]

    return {
        "total_files": len(files),
        "processed": len(processed_paths),
        "failed": len(files) - len(processed_paths),
        "details": details,
        "attachments": [Path(path) for path in attachments],
        "archive_path": str(archive_path) if archive_path else None,
        "risk_summary": {
            "safe_files": safe_files,
            "risky_files": risky_files,
        },
    }


def _process_single_upload(
    upload: FileStorage,
    index: int,
    incoming_dir: Path,
    clean_dir: Path,
) -> dict:
    original_name = secure_filename(Path(upload.filename or "").name)
    if not original_name:
        return {
            "filename": upload.filename or f"file_{index}",
            "status": "failed",
            "reason": "Invalid or empty filename",
        }

    suffix = Path(original_name).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        return {
            "filename": original_name,
            "status": "failed",
            "reason": f"Unsupported file type. Allowed: {allowed}",
        }

    source_path = incoming_dir / f"{index:03d}_{original_name}"
    upload.stream.seek(0)
    upload.save(source_path)

    try:
        if suffix in IMAGE_EXTENSIONS:
            clean_path = clean_dir / f"clean_{index}_{Path(original_name).stem}.jpg"
            result = strip_metadata(str(source_path), str(clean_path))
            result["before"].setdefault("file_type", "image")
            result["after"].setdefault("file_type", "image")
            file_type = "image"
        elif is_document_file(original_name):
            clean_path = clean_dir / f"clean_{index}_{original_name}"
            result = strip_document_metadata(str(source_path), str(clean_path))
            file_type = "document"
        else:
            raise ValueError("Unsupported file type")
    except Exception as exc:
        return {
            "filename": original_name,
            "status": "failed",
            "reason": str(exc),
        }

    before = result["before"]
    return {
        "filename": original_name,
        "status": "success",
        "reason": None,
        "file_type": file_type,
        "risk_level": before.get("risk_level", "LOW"),
        "contains_hidden_data": before.get("contains_hidden_data", False),
        "tags_removed": result["tags_removed"],
        "artifact_output_file": str(result["output_file"]),
        "output_filename": Path(result["output_file"]).name,
    }


def _build_zip_archive(files: list[Path], archive_path: Path) -> None:
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        for file_path in files:
            archive.write(file_path, arcname=file_path.name)
