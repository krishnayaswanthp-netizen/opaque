"""
Meta-Shield: Media metadata scanner and cleaner
Extract metadata from supported audio/video files with ffprobe and strip it with ffmpeg.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".aac"}
MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS
DEFAULT_MEDIA_MAX_MB = 200
SEVERITY_RANK = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3,
}
PATH_PATTERN = re.compile(
    r"(?:[A-Za-z]:\\[^\s<>:\"|?*]+(?:\\[^\s<>:\"|?*]+)*)"
    r"|(?:\\\\[^\s\\/:*?\"<>|]+\\[^\s<>:\"|?*]+(?:\\[^\s<>:\"|?*]+)*)"
    r"|(?:/(?:Users|home|srv|mnt|Volumes)/[^\s]+)",
)
ISO_6709_PATTERN = re.compile(
    r"^(?P<lat>[+-]\d{2}(?:\.\d+)?)(?P<lon>[+-]\d{3}(?:\.\d+)?)(?P<alt>[+-]\d+(?:\.\d+)?)?/?$"
)
LAT_LON_PATTERN = re.compile(
    r"(?P<lat>[+-]?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(?P<lon>[+-]?\d{1,3}(?:\.\d+)?)"
)

TAG_ALIASES = {
    "artist": "artist",
    "album_artist": "artist",
    "author": "artist",
    "composer": "artist",
    "performer": "artist",
    "publisher": "publisher",
    "copyright": "copyright",
    "creation_time": "creation_time",
    "date": "creation_time",
    "year": "creation_time",
    "com.apple.quicktime.creationdate": "creation_time",
    "encoder": "encoder",
    "encoded_by": "encoder",
    "software": "software",
    "application": "software",
    "writing_application": "software",
    "com.apple.quicktime.software": "software",
    "make": "make",
    "com.apple.quicktime.make": "make",
    "model": "model",
    "com.apple.quicktime.model": "model",
    "comment": "comment",
    "description": "comment",
    "synopsis": "comment",
    "location": "location",
    "location-eng": "location",
    "com.apple.quicktime.location.iso6709": "location",
    "com.apple.quicktime.location.name": "location",
    "owner": "owner",
}

FIELD_PROFILES = {
    "location": {
        "label": "Precise Location",
        "group": "other_pii",
        "group_key": "location",
        "danger_level": "CRITICAL",
        "description": "Embedded media location can reveal where the recording happened.",
        "attacker_use": "An attacker can map filming or recording locations and correlate them with people or routines.",
        "danger_to_user": "It can expose home, office, travel, or meeting locations to unauthorized recipients.",
        "recommendation": "Strip location tags from media before sharing outside trusted boundaries.",
        "score": 40,
        "reason": "Precise media location metadata exposed",
    },
    "creation_time": {
        "label": "Creation Timestamp",
        "group": "timestamps",
        "group_key": "creation_time",
        "danger_level": "MEDIUM",
        "description": "This records when the audio or video was created.",
        "attacker_use": "An attacker can reconstruct activity timelines and recording windows.",
        "danger_to_user": "It reveals when events happened and can expose operational tempo or schedules.",
        "recommendation": "Remove creation timestamps from media shared outside the organization.",
        "score": 15,
        "reason": "Media creation timestamp exposed",
    },
    "encoder": {
        "label": "Encoder",
        "group": "device",
        "group_key": "encoder",
        "danger_level": "HIGH",
        "description": "This identifies the encoder or toolchain used to produce the file.",
        "attacker_use": "An attacker can fingerprint your software stack and tailor exploits or phishing.",
        "danger_to_user": "It reveals tooling choices and may expose outdated or internal workflows.",
        "recommendation": "Strip encoder tags from exported media when sharing externally.",
        "score": 20,
        "reason": "Encoder or production tool exposed",
    },
    "software": {
        "label": "Software",
        "group": "device",
        "group_key": "software",
        "danger_level": "HIGH",
        "description": "This reveals the application or OS component that handled the media file.",
        "attacker_use": "An attacker can infer the software environment behind the recording or edit pipeline.",
        "danger_to_user": "It can expose internal tools, device families, or patch posture.",
        "recommendation": "Strip software-identifying tags before distribution.",
        "score": 20,
        "reason": "Software fingerprint exposed in media metadata",
    },
    "make": {
        "label": "Device Make",
        "group": "device",
        "group_key": "make",
        "danger_level": "HIGH",
        "description": "This identifies the manufacturer of the device that recorded the media.",
        "attacker_use": "An attacker can profile likely hardware and correlate recordings with device fleets.",
        "danger_to_user": "It contributes to device fingerprinting and narrows the source device pool.",
        "recommendation": "Remove device make data before sharing externally.",
        "score": 15,
        "reason": "Recording device make exposed",
    },
    "model": {
        "label": "Device Model",
        "group": "device",
        "group_key": "model",
        "danger_level": "HIGH",
        "description": "This identifies the recording device model.",
        "attacker_use": "An attacker can tie media to specific phone or camera models and tailor targeting.",
        "danger_to_user": "It strengthens device fingerprinting and source attribution.",
        "recommendation": "Strip device model metadata before external delivery.",
        "score": 15,
        "reason": "Recording device model exposed",
    },
    "artist": {
        "label": "Artist / Author",
        "group": "other_pii",
        "group_key": "artist",
        "danger_level": "MEDIUM",
        "description": "This can identify the person or account associated with the media.",
        "attacker_use": "An attacker can link the file to a person, role, or internal identity.",
        "danger_to_user": "It weakens anonymity and may expose creators or performers.",
        "recommendation": "Clear artist and author-style tags before sharing externally.",
        "score": 20,
        "reason": "Media author or artist identity exposed",
    },
    "publisher": {
        "label": "Publisher",
        "group": "other_pii",
        "group_key": "publisher",
        "danger_level": "MEDIUM",
        "description": "This can reveal the organization or system that published the media.",
        "attacker_use": "An attacker can infer internal ownership, distribution paths, or business context.",
        "danger_to_user": "It can expose internal departments, brands, or distribution workflows.",
        "recommendation": "Remove publisher metadata before external sharing.",
        "score": 15,
        "reason": "Publisher metadata exposed",
    },
    "copyright": {
        "label": "Copyright / Rights",
        "group": "other_pii",
        "group_key": "copyright",
        "danger_level": "LOW",
        "description": "This can identify ownership, authorship, or internal rights statements.",
        "attacker_use": "An attacker can correlate ownership information with teams or organizations.",
        "danger_to_user": "It can reveal who controls or originated the file.",
        "recommendation": "Review copyright fields before external release.",
        "score": 10,
        "reason": "Ownership or rights metadata exposed",
    },
    "comment": {
        "label": "Comments / Description",
        "group": "other_pii",
        "group_key": "comment",
        "danger_level": "CRITICAL",
        "description": "Hidden comments or descriptions may contain internal notes, identifiers, or context.",
        "attacker_use": "An attacker can recover discussion notes, descriptions, or staging information not obvious from playback.",
        "danger_to_user": "Internal context can leak even when the media itself seems safe to share.",
        "recommendation": "Strip descriptive and comment fields from the media before sending it out.",
        "score": 35,
        "reason": "Hidden comment or descriptive metadata detected",
    },
    "owner": {
        "label": "Owner",
        "group": "other_pii",
        "group_key": "owner",
        "danger_level": "MEDIUM",
        "description": "This can identify the owner of the media file or the originating device account.",
        "attacker_use": "An attacker can tie the file to a user account or team owner.",
        "danger_to_user": "It exposes identity and ownership details beyond the media content itself.",
        "recommendation": "Remove owner tags before external sharing.",
        "score": 20,
        "reason": "Owner identity exposed in media metadata",
    },
    "file_path": {
        "label": "Internal File Path",
        "group": "other_pii",
        "group_key": "file_path",
        "danger_level": "HIGH",
        "description": "Internal paths can reveal workstation names, usernames, folders, or network shares.",
        "attacker_use": "An attacker can map internal infrastructure and user naming patterns.",
        "danger_to_user": "It leaks environmental details that aid phishing, targeting, or lateral movement.",
        "recommendation": "Remove comments and custom tags that reference internal file paths.",
        "score": 30,
        "reason": "Internal file path reference detected in media metadata",
    },
    "embedded_streams": {
        "label": "Embedded Attachments",
        "group": "other_pii",
        "group_key": "embedded_streams",
        "danger_level": "CRITICAL",
        "description": "Extra data, attachment, or cover-art streams can hide content beyond normal playback.",
        "attacker_use": "An attacker can recover hidden payloads, attached artwork, or sidecar data streams.",
        "danger_to_user": "Sensitive material can survive inside the media container even if playback looks harmless.",
        "recommendation": "Rebuild the media container without attachment or auxiliary metadata streams before sharing it.",
        "score": 35,
        "reason": "Embedded attachment or auxiliary stream detected",
    },
}


def is_media_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in MEDIA_EXTENSIONS


def media_size_limit_mb() -> int:
    raw_value = (os.getenv("METASHIELD_MEDIA_MAX_MB") or str(DEFAULT_MEDIA_MAX_MB)).strip()
    try:
        value = int(raw_value)
    except ValueError:
        value = DEFAULT_MEDIA_MAX_MB
    return max(value, 1)


def media_size_limit_bytes() -> int:
    return media_size_limit_mb() * 1024 * 1024


def ensure_media_size_within_limit(file_path: str | Path) -> None:
    path = Path(file_path)
    size_bytes = path.stat().st_size
    limit_mb = media_size_limit_mb()
    limit_bytes = media_size_limit_bytes()

    if size_bytes > limit_bytes:
        actual_mb = round(size_bytes / (1024 * 1024), 1)
        raise ValueError(
            f"Media files larger than {limit_mb} MB are not allowed. "
            f"Received {actual_mb} MB for {path.name}."
        )


def extract_media_metadata(file_path: str) -> dict:
    path = Path(file_path)
    report = _build_base_report(path)
    if not is_media_file(path.name):
        report["error"] = f"Unsupported media type: {path.suffix.lower() or 'unknown'}"
        return report

    try:
        ensure_media_size_within_limit(path)
        probe_payload = _run_ffprobe(path)
    except ValueError as exc:
        report["error"] = str(exc)
        return report

    format_info = probe_payload.get("format") or {}
    streams = probe_payload.get("streams") or []
    report["media_type"] = _infer_media_type(path, streams)
    report["format_info"] = _build_format_info(format_info, streams)
    report["streams_info"] = [_stream_summary(stream) for stream in streams]
    report["safe_metadata"] = {
        "container": report["format_info"].get("format_name"),
        "duration_seconds": report["format_info"].get("duration_seconds"),
        "bit_rate_bps": report["format_info"].get("bit_rate_bps"),
        "stream_count": str(len(streams)),
        "stream_types": ", ".join(
            dict.fromkeys(
                stream.get("codec_type", "unknown")
                for stream in streams
                if stream.get("codec_type")
            )
        ),
    }

    entries = _metadata_entries(format_info, streams)
    hidden_streams = _hidden_stream_description(streams)
    if hidden_streams:
        entries.append(
            {
                "label": "container.embedded_streams",
                "value": hidden_streams,
                "canonical_key": "embedded_streams",
            }
        )
        report["contains_hidden_data"] = True

    file_path_value = _find_internal_path(entry["value"] for entry in entries)
    if file_path_value:
        entries.append(
            {
                "label": "container.file_path",
                "value": file_path_value,
                "canonical_key": "file_path",
            }
        )

    report["metadata_found"] = [
        {
            "label": entry["label"],
            "value": entry["value"],
        }
        for entry in entries
    ]
    report["raw_tag_count"] = len(entries)

    _apply_sensitive_profiles(report, entries)

    gps = _extract_location(entries)
    if gps:
        report["gps"] = gps
        report["gps_warning"] = None
    elif "location" in report["sensitive_tags"]:
        report["gps_warning"] = "Location metadata is embedded in the media container."

    if not report["recommendations"]:
        report["recommendations"] = [
            "Keep scanning outbound media files and ship only sanitized copies.",
        ]

    return report


def strip_media_metadata(input_path: str, output_path: str) -> dict:
    source_path = Path(input_path)
    if not is_media_file(source_path.name):
        raise ValueError(f"Unsupported media type: {source_path.suffix.lower() or 'unknown'}")

    ensure_media_size_within_limit(source_path)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    before = extract_media_metadata(str(source_path))
    if before.get("error"):
        raise ValueError(before["error"])

    _run_ffmpeg_strip(source_path, output)

    after = extract_media_metadata(str(output))
    if after.get("error"):
        raise ValueError(after["error"])

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
        "file_type": "media",
        "media_type": before.get("media_type"),
    }


def _build_base_report(path: Path) -> dict:
    return {
        "file": str(path),
        "file_type": "media",
        "media_type": None,
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
        "format_info": {},
        "streams_info": [],
    }


def _run_ffprobe(path: Path) -> dict:
    command = [
        _required_tool("ffprobe"),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError(f"ffprobe timed out while inspecting {path.name}.") from exc

    if result.returncode != 0:
        error_text = (result.stderr or result.stdout or "").strip()
        raise ValueError(
            f"ffprobe failed to inspect {path.name}: {error_text or 'unknown error'}"
        )

    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"ffprobe returned invalid JSON for {path.name}.") from exc


def _run_ffmpeg_strip(input_path: Path, output_path: Path) -> None:
    command = [
        _required_tool("ffmpeg"),
        "-y",
        "-i",
        str(input_path),
        "-map",
        "0",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        # Prevent FFmpeg from stamping a fresh Lavf encoder tag onto the cleaned container.
        "-fflags",
        "+bitexact",
        "-c",
        "copy",
        str(output_path),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        raise ValueError(f"ffmpeg timed out while stripping metadata from {input_path.name}.") from exc

    if result.returncode != 0:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        error_text = (result.stderr or result.stdout or "").strip()
        raise ValueError(
            f"ffmpeg failed to strip metadata from {input_path.name}: {error_text or 'unknown error'}"
        )


def _required_tool(name: str) -> str:
    resolved = shutil.which(name)
    if resolved:
        return resolved

    if name == "ffprobe":
        raise ValueError(
            "ffprobe is required for media metadata scanning. Install FFmpeg/FFprobe and restart Meta-Shield."
        )

    raise ValueError(
        "ffmpeg is required for media metadata stripping. Install FFmpeg and restart Meta-Shield."
    )


def _metadata_entries(format_info: dict, streams: list[dict]) -> list[dict]:
    entries = []

    format_tags = format_info.get("tags") or {}
    for raw_key, raw_value in format_tags.items():
        value = _clean_text(raw_value)
        if not value:
            continue
        entries.append(
            {
                "label": f"format.{raw_key}",
                "value": value,
                "canonical_key": _canonical_key(raw_key),
            }
        )

    for stream in streams:
        stream_index = stream.get("index", 0)
        stream_tags = stream.get("tags") or {}
        for raw_key, raw_value in stream_tags.items():
            value = _clean_text(raw_value)
            if not value:
                continue
            entries.append(
                {
                    "label": f"stream[{stream_index}].{raw_key}",
                    "value": value,
                    "canonical_key": _canonical_key(raw_key),
                }
            )

    return entries


def _apply_sensitive_profiles(report: dict, entries: list[dict]) -> None:
    grouped_values: dict[str, list[str]] = {}

    for entry in entries:
        canonical_key = entry["canonical_key"]
        if canonical_key not in FIELD_PROFILES:
            continue
        grouped_values.setdefault(canonical_key, [])
        if entry["value"] not in grouped_values[canonical_key]:
            grouped_values[canonical_key].append(entry["value"])

    for canonical_key, values in grouped_values.items():
        profile = FIELD_PROFILES[canonical_key]
        value = "; ".join(values)

        report[profile["group"]][profile["group_key"]] = value
        report["sensitive_tags"].append(canonical_key)
        report["sensitive_findings"].append(
            {
                "label": profile["label"],
                "value": value,
                "ifd_name": "media",
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

        if canonical_key == "creation_time":
            report["timestamps"][profile["group_key"]] = value

        if canonical_key == "embedded_streams":
            report["contains_hidden_data"] = True

    report["score"] = min(report["score"], 100)
    report["sensitive_tags"] = list(dict.fromkeys(report["sensitive_tags"]))
    report["attacker_use_cases"] = list(dict.fromkeys(report["attacker_use_cases"]))
    report["recommendations"] = _dedupe(report["recommendations"])
    report["risk_reasons"] = list(dict.fromkeys(report["risk_reasons"]))
    report["sensitive_findings"].sort(
        key=lambda item: (
            SEVERITY_RANK.get(item["danger_level"], 99),
            item["label"],
        )
    )
    report["sensitive_tag_count"] = len(report["sensitive_findings"])
    report["risk_level"] = _risk_level(report)


def _risk_level(report: dict) -> str:
    tags = set(report["sensitive_tags"])
    score = report["score"]

    if tags.intersection({"location", "comment", "embedded_streams"}) or report["contains_hidden_data"]:
        return "CRITICAL"
    if tags.intersection({"encoder", "software", "make", "model", "file_path"}) or score >= 55:
        return "HIGH"
    if tags.intersection({"artist", "publisher", "creation_time", "owner"}) or score >= 20:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "LOW"


def _build_format_info(format_info: dict, streams: list[dict]) -> dict:
    duration = _safe_float(format_info.get("duration"))
    bit_rate = _safe_int(format_info.get("bit_rate"))
    return {
        "format_name": _clean_text(format_info.get("format_name")),
        "format_long_name": _clean_text(format_info.get("format_long_name")),
        "duration_seconds": duration,
        "bit_rate_bps": bit_rate,
        "stream_count": len(streams),
    }


def _stream_summary(stream: dict) -> dict:
    summary = {
        "index": stream.get("index"),
        "codec_type": stream.get("codec_type"),
        "codec_name": stream.get("codec_name"),
        "codec_long_name": stream.get("codec_long_name"),
        "tags": {
            key: value
            for key, value in (stream.get("tags") or {}).items()
            if _clean_text(value)
        },
    }

    if stream.get("codec_type") == "video":
        summary["width"] = stream.get("width")
        summary["height"] = stream.get("height")
        summary["frame_rate"] = stream.get("avg_frame_rate")
    elif stream.get("codec_type") == "audio":
        summary["sample_rate"] = stream.get("sample_rate")
        summary["channels"] = stream.get("channels")

    disposition = stream.get("disposition") or {}
    if disposition:
        summary["disposition"] = disposition

    return summary


def _hidden_stream_description(streams: list[dict]) -> str | None:
    hidden_descriptions = []
    for stream in streams:
        codec_type = _clean_text(stream.get("codec_type")) or "unknown"
        disposition = stream.get("disposition") or {}

        if codec_type in {"attachment", "data"}:
            hidden_descriptions.append(
                f"stream {stream.get('index', '?')} ({codec_type})"
            )
            continue

        if disposition.get("attached_pic"):
            hidden_descriptions.append(
                f"stream {stream.get('index', '?')} (attached cover art)"
            )

    if not hidden_descriptions:
        return None

    return ", ".join(hidden_descriptions)


def _infer_media_type(path: Path, streams: list[dict]) -> str:
    suffix = path.suffix.lower()
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"

    for stream in streams:
        codec_type = (stream.get("codec_type") or "").lower()
        if codec_type == "video":
            return "video"
        if codec_type == "audio":
            return "audio"

    return "media"


def _extract_location(entries: list[dict]) -> dict | None:
    location_values = [
        entry["value"]
        for entry in entries
        if entry["canonical_key"] == "location"
    ]
    for value in location_values:
        parsed = _parse_location(value)
        if parsed:
            lat, lon, altitude = parsed
            return {
                "latitude": lat,
                "longitude": lon,
                "altitude_m": altitude,
                "maps_url": f"https://maps.google.com/?q={lat},{lon}",
            }
    return None


def _parse_location(value: str) -> tuple[float, float, float | None] | None:
    cleaned = value.strip()

    iso_match = ISO_6709_PATTERN.match(cleaned)
    if iso_match:
        lat = float(iso_match.group("lat"))
        lon = float(iso_match.group("lon"))
        altitude_raw = iso_match.group("alt")
        altitude = float(altitude_raw) if altitude_raw is not None else None
        if _valid_lat_lon(lat, lon):
            return round(lat, 6), round(lon, 6), altitude

    lat_lon_match = LAT_LON_PATTERN.search(cleaned)
    if lat_lon_match:
        lat = float(lat_lon_match.group("lat"))
        lon = float(lat_lon_match.group("lon"))
        if _valid_lat_lon(lat, lon):
            return round(lat, 6), round(lon, 6), None

    return None


def _valid_lat_lon(lat: float, lon: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lon <= 180


def _find_internal_path(values) -> str | None:
    for value in values:
        match = PATH_PATTERN.search(value)
        if match:
            return match.group(0)
    return None


def _canonical_key(raw_key: str) -> str | None:
    normalized = raw_key.strip().lower().replace(" ", "_")
    return TAG_ALIASES.get(normalized)


def _clean_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_float(value) -> float | None:
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def _safe_int(value) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _dedupe(values: list[str]) -> list[str]:
    unique = list(dict.fromkeys(values))
    if not unique:
        return unique

    unique.append("Rescan the sanitized media copy before forwarding it outside the organization.")
    return list(dict.fromkeys(unique))
