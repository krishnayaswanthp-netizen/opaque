"""
Meta-Shield: Document Metadata Cleaner
Strip metadata from PDF and DOCX files while leaving image handling untouched.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError

from document_scanner import extract_document_report, is_document_file


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

COMMENT_REFERENCE_TAGS = {
    f"{{{WORD_NS}}}commentRangeStart",
    f"{{{WORD_NS}}}commentRangeEnd",
    f"{{{WORD_NS}}}commentReference",
}
UNWRAP_TRACK_CHANGE_TAGS = {
    f"{{{WORD_NS}}}ins",
    f"{{{WORD_NS}}}moveTo",
}
REMOVE_TRACK_CHANGE_TAGS = {
    f"{{{WORD_NS}}}del",
    f"{{{WORD_NS}}}moveFrom",
}

DOCX_DROPPED_PARTS = {
    "docProps/custom.xml",
    "word/comments.xml",
    "word/commentsextended.xml",
    "word/commentsids.xml",
    "word/people.xml",
}


def strip_document_metadata(input_path: str, output_path: str) -> dict:
    """
    Strip metadata from a PDF or DOCX file and return a summary report.
    """
    source_path = Path(input_path)
    if not is_document_file(source_path.name):
        raise ValueError(f"Unsupported document type: {source_path.suffix.lower() or 'unknown'}")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    before = extract_document_report(str(source_path))
    suffix = source_path.suffix.lower()

    if suffix == ".pdf":
        _strip_pdf(source_path, output)
    elif suffix == ".docx":
        _strip_docx(source_path, output)

    after = extract_document_report(str(output))
    return {
        "input_file": str(source_path),
        "output_file": str(output),
        "before": before,
        "after": after,
        "tags_removed": max(before["raw_tag_count"] - after["raw_tag_count"], 0),
        "size_before_kb": before["file_size_kb"],
        "size_after_kb": after["file_size_kb"],
        "stripped_at": datetime.now().isoformat(),
        "success": after["sensitive_tag_count"] == 0 and not after["contains_hidden_data"],
    }


def _strip_pdf(input_path: Path, output_path: Path) -> None:
    try:
        reader = PdfReader(str(input_path))
    except (PdfReadError, Exception) as exc:
        raise ValueError("Corrupted or unsupported PDF file.") from exc

    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata(
        {
            "/Author": "",
            "/Creator": "",
            "/Producer": "",
            "/Title": "",
            "/Subject": "",
            "/Keywords": "",
            "/CreationDate": "",
            "/ModDate": "",
        }
    )

    try:
        writer.xmp_metadata = None
    except Exception:
        pass

    with output_path.open("wb") as handle:
        writer.write(handle)


def _strip_docx(input_path: Path, output_path: Path) -> None:
    try:
        with ZipFile(input_path, "r") as source_zip, ZipFile(
            output_path,
            "w",
            compression=ZIP_DEFLATED,
        ) as dest_zip:
            for item in source_zip.infolist():
                normalized_name = item.filename.lower()
                if _should_drop_docx_part(normalized_name):
                    continue

                data = source_zip.read(item.filename)
                if normalized_name == "docprops/core.xml":
                    data = _sanitize_docx_core_properties(data)
                elif normalized_name == "docprops/app.xml":
                    data = _sanitize_docx_app_properties(data)
                elif normalized_name == "[content_types].xml":
                    data = _sanitize_docx_content_types(data)
                elif normalized_name.endswith(".rels"):
                    data = _sanitize_docx_relationships(data)
                elif normalized_name.startswith("word/") and normalized_name.endswith(".xml"):
                    data = _sanitize_docx_word_markup(data)

                dest_zip.writestr(item, data)
    except BadZipFile as exc:
        raise ValueError("Corrupted or unsupported Word document.") from exc
    except Exception as exc:
        if output_path.exists():
            output_path.unlink()
        raise ValueError("Unable to sanitize Word document metadata.") from exc


def _sanitize_docx_core_properties(xml_bytes: bytes) -> bytes:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return xml_bytes

    tags_to_blank = {
        "title",
        "subject",
        "creator",
        "keywords",
        "description",
        "lastModifiedBy",
        "revision",
        "category",
        "contentStatus",
        "identifier",
        "language",
        "version",
        "created",
        "modified",
        "lastPrinted",
    }

    for element in root.iter():
        if _local_name(element.tag) in tags_to_blank:
            element.text = ""

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_docx_app_properties(xml_bytes: bytes) -> bytes:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return xml_bytes

    tags_to_blank = {
        "Application",
        "AppVersion",
        "Company",
        "Manager",
        "HyperlinkBase",
        "Template",
    }

    for element in root.iter():
        if _local_name(element.tag) in tags_to_blank:
            element.text = ""

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_docx_content_types(xml_bytes: bytes) -> bytes:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return xml_bytes

    for element in list(root):
        part_name = element.attrib.get("PartName", "").lstrip("/").lower()
        if _should_drop_docx_part(part_name):
            root.remove(element)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_docx_relationships(xml_bytes: bytes) -> bytes:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return xml_bytes

    relationship_types_to_drop = (
        "/comments",
        "/commentsExtended",
        "/commentsIds",
        "/people",
        "/custom-properties",
    )

    for element in list(root):
        target = element.attrib.get("Target", "").replace("\\", "/").lstrip("/").lower()
        rel_type = element.attrib.get("Type", "")
        rel_type = rel_type.lower()
        if _should_drop_docx_part(target) or any(token in rel_type for token in relationship_types_to_drop):
            root.remove(element)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_docx_word_markup(xml_bytes: bytes) -> bytes:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return xml_bytes

    _sanitize_word_element(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_word_element(element) -> None:
    index = 0
    while index < len(element):
        child = element[index]
        _sanitize_word_element(child)

        if child.tag in COMMENT_REFERENCE_TAGS or child.tag in REMOVE_TRACK_CHANGE_TAGS:
            element.remove(child)
            continue

        if child.tag in UNWRAP_TRACK_CHANGE_TAGS:
            element.remove(child)
            insertion_index = index
            for grandchild in list(child):
                element.insert(insertion_index, grandchild)
                insertion_index += 1
            index = insertion_index
            continue

        index += 1


def _should_drop_docx_part(part_name: str) -> bool:
    normalized = part_name.replace("\\", "/").lower()
    if normalized in DOCX_DROPPED_PARTS:
        return True
    return normalized.startswith("word/comments")


def _local_name(tag_name: str) -> str:
    if "}" not in tag_name:
        return tag_name
    return tag_name.rsplit("}", 1)[-1]
