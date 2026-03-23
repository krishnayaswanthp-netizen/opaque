"""
Meta-Shield: Document Metadata Scanner
Parse metadata from PDF and DOCX files without affecting the image pipeline.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError


DOCUMENT_EXTENSIONS = {".pdf", ".docx"}

SENSITIVE_DOC_TAGS = {
    "author": "Identity Exposure",
    "last_modified_by": "Internal User Leak",
    "comments": "Confidential Discussion",
    "revision_history": "Deleted Sensitive Data",
    "file_path": "Internal Infrastructure Leak",
    "creator": "Software Fingerprint",
    "producer": "Software Fingerprint",
    "creation_date": "Timeline Exposure",
    "modification_date": "Timeline Exposure",
    "embedded_objects": "Hidden Payload",
}

SEVERITY_RANK = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3,
}

WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
PATH_PATTERN = re.compile(
    r"(?:[A-Za-z]:\\[^\s<>:\"|?*]+(?:\\[^\s<>:\"|?*]+)*)"
    r"|(?:\\\\[^\s\\/:*?\"<>|]+\\[^\s<>:\"|?*]+(?:\\[^\s<>:\"|?*]+)*)"
    r"|(?:/(?:Users|home|srv|mnt|Volumes)/[^\s]+)",
)

FIELD_PROFILES = {
    "author": {
        "label": "Document Author",
        "group": "other_pii",
        "group_key": "author",
        "danger_level": "MEDIUM",
        "description": "This identifies who originally authored the document.",
        "attacker_use": "An attacker can link the file to a person, team, or account owner.",
        "danger_to_user": "It weakens anonymity and can expose the originator of sensitive material.",
        "recommendation": "Clear author names from document properties before external sharing.",
        "score": 20,
        "reason": "Author identity exposed in document metadata",
    },
    "last_modified_by": {
        "label": "Last Modified By",
        "group": "other_pii",
        "group_key": "last_modified_by",
        "danger_level": "HIGH",
        "description": "This shows the internal user or account that last edited the document.",
        "attacker_use": "An attacker can identify the latest internal editor and infer workflow ownership.",
        "danger_to_user": "It can expose employee identities, service accounts, or privileged internal users.",
        "recommendation": "Remove last-editor metadata before documents leave the organization.",
        "score": 30,
        "reason": "Last editor identity exposed",
    },
    "comments": {
        "label": "Comments",
        "group": "other_pii",
        "group_key": "comments",
        "danger_level": "CRITICAL",
        "description": "Hidden comments may contain review notes, discussion threads, or redlined content.",
        "attacker_use": "An attacker can recover internal discussion points, rejected text, or approval notes.",
        "danger_to_user": "Confidential context can leak even when the visible document looks safe.",
        "recommendation": "Delete comments and review notes before sharing the document externally.",
        "score": 35,
        "reason": "Hidden review comments detected",
    },
    "revision_history": {
        "label": "Revision History",
        "group": "other_pii",
        "group_key": "revision_history",
        "danger_level": "CRITICAL",
        "description": "Tracked changes indicate prior edits and potentially deleted content are still embedded.",
        "attacker_use": "An attacker can reconstruct earlier text, edits, and approval history.",
        "danger_to_user": "Removed or superseded sensitive content may still be recoverable.",
        "recommendation": "Accept or reject tracked changes and flatten the document before sending it out.",
        "score": 40,
        "reason": "Tracked changes or revision history present",
    },
    "file_path": {
        "label": "Internal File Path",
        "group": "other_pii",
        "group_key": "file_path",
        "danger_level": "HIGH",
        "description": "Internal paths can reveal workstation names, usernames, folders, or network shares.",
        "attacker_use": "An attacker can map internal systems, user naming patterns, and storage conventions.",
        "danger_to_user": "It leaks infrastructure details that help with phishing, lateral movement, or targeting.",
        "recommendation": "Remove custom properties and path-like references before distribution.",
        "score": 30,
        "reason": "Internal file path or share reference detected",
    },
    "creator": {
        "label": "Document Creator",
        "group": "device",
        "group_key": "creator",
        "danger_level": "HIGH",
        "description": "This reveals the authoring software or workflow that created the document.",
        "attacker_use": "An attacker can fingerprint the software stack and tailor exploits or social engineering.",
        "danger_to_user": "It reveals tooling choices and may expose outdated software or internal workflows.",
        "recommendation": "Strip creator and software metadata from the exported document copy.",
        "score": 15,
        "reason": "Document creator software exposed",
    },
    "producer": {
        "label": "Document Producer",
        "group": "device",
        "group_key": "producer",
        "danger_level": "HIGH",
        "description": "This shows the software component that produced the current document artifact.",
        "attacker_use": "An attacker can infer your conversion pipeline and software ecosystem.",
        "danger_to_user": "It can reveal internal tooling and make targeting or correlation easier.",
        "recommendation": "Clear producer metadata before sharing outside trusted boundaries.",
        "score": 15,
        "reason": "Producer software exposed",
    },
    "creation_date": {
        "label": "Creation Date",
        "group": "timestamps",
        "group_key": "created",
        "danger_level": "MEDIUM",
        "description": "This records when the document was originally created.",
        "attacker_use": "An attacker can build a timeline of document creation and project activity.",
        "danger_to_user": "It can expose schedules, project timing, and operational tempo.",
        "recommendation": "Reset or remove creation timestamps from externally shared copies.",
        "score": 10,
        "reason": "Creation timestamp exposed",
    },
    "modification_date": {
        "label": "Modification Date",
        "group": "timestamps",
        "group_key": "modified",
        "danger_level": "MEDIUM",
        "description": "This records when the document was last modified.",
        "attacker_use": "An attacker can infer editing windows, last-touch timing, and incident chronology.",
        "danger_to_user": "It reveals how recently the file changed and may expose live activity.",
        "recommendation": "Reset or remove modification timestamps before external sharing.",
        "score": 10,
        "reason": "Modification timestamp exposed",
    },
    "embedded_objects": {
        "label": "Embedded Objects",
        "group": "other_pii",
        "group_key": "embedded_objects",
        "danger_level": "CRITICAL",
        "description": "Embedded files or objects can hide extra payloads beyond the visible document body.",
        "attacker_use": "An attacker can recover hidden attachments, alternate content, or staged payloads.",
        "danger_to_user": "Sensitive hidden content can survive inside the file even if the visible pages look clean.",
        "recommendation": "Flatten or rebuild the document without embedded objects before sharing it.",
        "score": 35,
        "reason": "Embedded objects or hidden payloads detected",
    },
}


def is_document_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in DOCUMENT_EXTENSIONS


def extract_document_report(document_path: str) -> dict:
    """
    Parse PDF or DOCX metadata and return a report compatible with the
    image metadata report structure used elsewhere in Meta-Shield.
    """
    path = Path(document_path)
    suffix = path.suffix.lower()

    report = _build_base_report(path)
    if suffix == ".pdf":
        return _extract_pdf_report(path, report)
    if suffix == ".docx":
        return _extract_docx_report(path, report)

    report["error"] = f"Unsupported document type: {suffix or 'unknown'}"
    return report


def _build_base_report(path: Path) -> dict:
    return {
        "file": str(path),
        "file_type": "document",
        "document_type": path.suffix.lower().lstrip(".") or None,
        "file_size_kb": round(path.stat().st_size / 1024, 1),
        "gps": None,
        "gps_warning": None,
        "thumbnail_present": False,
        "thumbnail_size_bytes": 0,
        "sensitive_findings": [],
        "device": {},
        "timestamps": {},
        "other_pii": {},
        "safe_metadata": {},
        "metadata_found": [],
        "sensitive_tags": [],
        "attacker_use_cases": [],
        "recommendations": [],
        "contains_hidden_data": False,
        "raw_tag_count": 0,
        "sensitive_tag_count": 0,
        "risk_level": "LOW",
        "score": 0,
        "risk_reasons": [],
    }


def _extract_docx_report(path: Path, report: dict) -> dict:
    try:
        document = Document(str(path))
        core = document.core_properties
    except Exception:
        report["error"] = "Corrupted or unsupported Word document."
        return report

    metadata_values = {
        "author": _clean_text(_safe_core_property(core, "author")),
        "last_modified_by": _clean_text(_safe_core_property(core, "last_modified_by")),
        "creation_date": _format_datetime(_safe_core_property(core, "created")),
        "modification_date": _format_datetime(_safe_core_property(core, "modified")),
    }

    zip_file = None
    try:
        zip_file = ZipFile(path)
        app_props = _read_docx_app_properties(zip_file)
        comments_value = _read_docx_comments(zip_file) or _clean_text(_safe_core_property(core, "comments"))
        revision_history = _docx_has_tracked_changes(zip_file) or _docx_revision_flag(
            _safe_core_property(core, "revision")
        )
        file_path = _find_internal_path(_read_docx_metadata_strings(zip_file, app_props))
    except BadZipFile:
        report["error"] = "Corrupted or unsupported Word document."
        return report
    finally:
        if zip_file is not None:
            zip_file.close()

    if app_props.get("application"):
        metadata_values["creator"] = app_props["application"]
    if app_props.get("app_version"):
        metadata_values["producer"] = f"{app_props['application'] or 'Office'} {app_props['app_version']}".strip()
    if comments_value:
        metadata_values["comments"] = comments_value
    if revision_history:
        metadata_values["revision_history"] = "Tracked changes or prior revision markers present"
    if file_path:
        metadata_values["file_path"] = file_path

    report["safe_metadata"]["doc_type"] = "Word Document"
    _finalize_report(report, metadata_values)
    return report


def _extract_pdf_report(path: Path, report: dict) -> dict:
    try:
        reader = PdfReader(str(path))
    except (PdfReadError, Exception):
        report["error"] = "Corrupted or unsupported PDF file."
        return report

    metadata = reader.metadata or {}
    metadata_values = {
        "author": _clean_text(metadata.get("/Author")),
        "creator": _clean_text(metadata.get("/Creator")),
        "producer": _clean_text(metadata.get("/Producer")),
        "creation_date": _parse_pdf_date(metadata.get("/CreationDate")),
        "modification_date": _parse_pdf_date(metadata.get("/ModDate")),
    }

    embedded_objects = _pdf_has_embedded_objects(reader)
    if embedded_objects:
        metadata_values["embedded_objects"] = "Embedded files or hidden objects present"

    file_path = _find_internal_path(
        _collect_strings(
            [
                metadata.get("/Author"),
                metadata.get("/Creator"),
                metadata.get("/Producer"),
                metadata.get("/Title"),
                metadata.get("/Subject"),
                metadata.get("/Keywords"),
            ]
        )
    )
    if file_path:
        metadata_values["file_path"] = file_path

    report["safe_metadata"]["doc_type"] = "PDF"
    try:
        report["safe_metadata"]["page_count"] = str(len(reader.pages))
    except Exception:
        pass

    _finalize_report(report, metadata_values)
    return report


def _finalize_report(report: dict, metadata_values: dict) -> None:
    for key, value in metadata_values.items():
        if value in (None, "", [], {}):
            continue

        string_value = _stringify_value(value)
        report["metadata_found"].append({"label": key, "value": string_value})
        report["raw_tag_count"] += 1

        profile = FIELD_PROFILES.get(key)
        if not profile:
            continue

        group_name = profile["group"]
        report[group_name][profile["group_key"]] = string_value
        report["sensitive_tags"].append(key)
        report["sensitive_findings"].append(
            {
                "label": profile["label"],
                "value": string_value,
                "ifd_name": "document",
                "description": profile["description"],
                "attacker_use": profile["attacker_use"],
                "danger_to_user": profile["danger_to_user"],
                "danger_level": profile["danger_level"],
            }
        )
        report["risk_reasons"].append(profile["reason"])
        report["attacker_use_cases"].append(profile["attacker_use"])
        report["recommendations"].append(profile["recommendation"])
        report["score"] += profile["score"]

        if key in {"comments", "revision_history", "embedded_objects"}:
            report["contains_hidden_data"] = True

    report["sensitive_tag_count"] = len(report["sensitive_findings"])
    report["sensitive_findings"].sort(
        key=lambda item: (
            SEVERITY_RANK.get(item["danger_level"], 99),
            item["label"],
        )
    )
    report["sensitive_tags"] = list(dict.fromkeys(report["sensitive_tags"]))
    report["attacker_use_cases"] = list(dict.fromkeys(report["attacker_use_cases"]))
    report["recommendations"] = _dedupe_recommendations(report["recommendations"])
    report["risk_reasons"] = list(dict.fromkeys(report["risk_reasons"]))
    report["score"] = min(report["score"], 100)
    report["risk_level"] = _risk_level_for_report(report)

    if not report["recommendations"]:
        report["recommendations"] = [
            "Keep scanning inbound and outbound documents before external sharing.",
        ]


def _risk_level_for_report(report: dict) -> str:
    tags = set(report["sensitive_tags"])
    score = report["score"]

    if report["contains_hidden_data"] or tags.intersection({"comments", "revision_history", "embedded_objects"}):
        return "CRITICAL"
    if tags.intersection({"last_modified_by", "file_path", "creator", "producer"}) or score >= 60:
        return "HIGH"
    if tags.intersection({"author", "creation_date", "modification_date"}) and score >= 20:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "LOW"


def _read_docx_app_properties(zip_file: ZipFile) -> dict:
    app_props = {
        "application": None,
        "app_version": None,
    }
    try:
        root = ET.fromstring(zip_file.read("docProps/app.xml"))
    except Exception:
        return app_props

    for element in root.iter():
        tag_name = _local_name(element.tag)
        if tag_name == "Application":
            app_props["application"] = _clean_text(element.text)
        elif tag_name == "AppVersion":
            app_props["app_version"] = _clean_text(element.text)

    return app_props


def _read_docx_comments(zip_file: ZipFile) -> str | None:
    comment_candidates = [
        "word/comments.xml",
        "word/commentsExtended.xml",
    ]

    collected = []
    for part_name in comment_candidates:
        try:
            root = ET.fromstring(zip_file.read(part_name))
        except Exception:
            continue

        for element in root.iter():
            if _local_name(element.tag) != "comment":
                continue

            text_chunks = []
            author = _clean_text(element.attrib.get(f"{{{WORD_NS['w']}}}author"))
            if author:
                text_chunks.append(f"author={author}")

            comment_text = " ".join(
                text.strip()
                for text in element.itertext()
                if text and text.strip()
            )
            if comment_text:
                text_chunks.append(comment_text)

            if text_chunks:
                collected.append(" | ".join(text_chunks))

    if not collected:
        return None

    joined = "; ".join(collected)
    return _truncate(joined, 240)


def _docx_has_tracked_changes(zip_file: ZipFile) -> bool:
    tracked_tags = {"ins", "del", "moveFrom", "moveTo"}
    for part_name in zip_file.namelist():
        if not part_name.startswith("word/") or not part_name.endswith(".xml"):
            continue
        if "comments" in part_name:
            continue

        try:
            root = ET.fromstring(zip_file.read(part_name))
        except Exception:
            continue

        for element in root.iter():
            if _local_name(element.tag) in tracked_tags:
                return True

    return False


def _docx_revision_flag(revision_value) -> bool:
    try:
        return int(revision_value or 0) > 1
    except Exception:
        return False


def _read_docx_metadata_strings(zip_file: ZipFile, app_props: dict) -> list[str]:
    values = list(_collect_strings(app_props.values()))

    for part_name in ("docProps/core.xml", "docProps/custom.xml"):
        try:
            root = ET.fromstring(zip_file.read(part_name))
        except Exception:
            continue

        for element in root.iter():
            if element.text and element.text.strip():
                values.append(element.text.strip())

    return values


def _pdf_has_embedded_objects(reader: PdfReader) -> bool:
    try:
        attachments = reader.attachments
        if attachments:
            return True
    except Exception:
        pass

    try:
        attachment_list = list(reader.attachment_list)
        if attachment_list:
            return True
    except Exception:
        pass

    try:
        root = reader.trailer["/Root"]
        names = root.get("/Names")
        if names and names.get("/EmbeddedFiles"):
            return True
    except Exception:
        pass

    return False


def _clean_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_core_property(core_properties, name: str):
    try:
        return getattr(core_properties, name)
    except Exception:
        return None


def _format_datetime(value) -> str | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return _clean_text(value)


def _parse_pdf_date(value) -> str | None:
    raw = _clean_text(value)
    if not raw:
        return None

    match = re.match(
        r"^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+\-].*)?$",
        raw,
    )
    if not match:
        return raw

    year, month, day, hour, minute, second, timezone_part = match.groups()
    month = month or "01"
    day = day or "01"
    hour = hour or "00"
    minute = minute or "00"
    second = second or "00"

    try:
        parsed = datetime(
            int(year),
            int(month),
            int(day),
            int(hour),
            int(minute),
            int(second),
        )
    except ValueError:
        return raw

    tz_suffix = ""
    if timezone_part:
        tz_suffix = timezone_part.replace("'", "")
        if tz_suffix == "Z":
            tz_suffix = "+00:00"
        elif len(tz_suffix) == 5 and tz_suffix[0] in {"+", "-"}:
            tz_suffix = f"{tz_suffix[:3]}:{tz_suffix[3:]}"
        elif len(tz_suffix) >= 6 and tz_suffix[0] in {"+", "-"} and ":" not in tz_suffix:
            tz_suffix = f"{tz_suffix[:3]}:{tz_suffix[3:5]}"

    return f"{parsed.isoformat()}{tz_suffix}"


def _find_internal_path(values: list[str]) -> str | None:
    for value in values:
        match = PATH_PATTERN.search(value)
        if match:
            return match.group(0)
    return None


def _collect_strings(values) -> list[str]:
    strings = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            strings.extend(_collect_strings(value))
            continue

        text = _clean_text(value)
        if text:
            strings.append(text)
    return strings


def _stringify_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, tuple, set)):
        return ", ".join(_collect_strings(value))
    return str(value)


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def _dedupe_recommendations(recommendations: list[str]) -> list[str]:
    unique = []
    for item in recommendations:
        if item not in unique:
            unique.append(item)

    if not unique:
        return unique

    unique.append("Rescan the sanitized copy before emailing it outside the organization.")
    return list(dict.fromkeys(unique))


def _local_name(tag_name: str) -> str:
    if "}" not in tag_name:
        return tag_name
    return tag_name.rsplit("}", 1)[-1]
