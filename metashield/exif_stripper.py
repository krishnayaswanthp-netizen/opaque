"""
Meta-Shield: EXIF Metadata Stripper
Core engine for parsing and stripping EXIF metadata from images.
"""

from datetime import datetime
from pathlib import Path

import piexif
from PIL import Image


SENSITIVE_TAGS = {
    # GPS block
    0x0000: "GPS Version",
    0x0001: "GPS Latitude Ref",
    0x0002: "GPS Latitude",
    0x0003: "GPS Longitude Ref",
    0x0004: "GPS Longitude",
    0x0005: "GPS Altitude Ref",
    0x0006: "GPS Altitude",
    0x0007: "GPS Timestamp",
    0x000C: "GPS Speed Ref",
    0x000D: "GPS Speed",
    0x0010: "GPS Image Direction Ref",
    0x0011: "GPS Image Direction",
    0x001D: "GPS Date",
    # Device fingerprint
    0x010F: "Camera Make",
    0x0110: "Camera Model",
    0x0131: "Software",
    0x013B: "Artist",
    0x8298: "Copyright",
    0x9003: "Date Taken",
    0x9004: "Date Digitized",
    0x9010: "Offset Time",
    0xA430: "Camera Owner",
    0xA431: "Camera Serial Number",
    0xA432: "Lens Info",
    0xA433: "Lens Make",
    0xA434: "Lens Model",
    0xA435: "Lens Serial Number",
    # Miscellaneous PII
    0x013C: "Host Computer",
    0x9286: "User Comment",
    0x927C: "Maker Note",
}

SAFE_TAGS = {
    0xA002: "Image Width",
    0xA003: "Image Height",
    0xA001: "Color Space",
    0x0128: "Resolution Unit",
    0x011A: "X Resolution",
    0x011B: "Y Resolution",
}

SEVERITY_RANK = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
}


def _safe_rational_to_float(value):
    """Convert an EXIF rational tuple to float, returning None if malformed."""
    try:
        numerator, denominator = value
        if denominator == 0:
            return None
        return numerator / denominator
    except Exception:
        return None


def dms_to_decimal(dms, ref):
    """Convert GPS DMS tuples to decimal degrees."""
    try:
        deg = _safe_rational_to_float(dms[0])
        minutes = _safe_rational_to_float(dms[1])
        seconds = _safe_rational_to_float(dms[2])
        if deg is None or minutes is None or seconds is None:
            return None
        decimal = deg + minutes / 60 + seconds / 3600
        if ref in ["S", "W"]:
            decimal = -decimal
        return round(decimal, 6)
    except Exception:
        return None


def _decode_text(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip("\x00 ")
    return str(value).strip()


def _decode_user_comment(value):
    if not value:
        return None
    raw = value[8:] if isinstance(value, bytes) and len(value) > 8 else value
    return _decode_text(raw)


def _is_valid_gps_ref(value, axis):
    valid_refs = {"lat": {"N", "S"}, "lon": {"E", "W"}}
    return value in valid_refs[axis]


def _format_sensitive_value(label, value):
    if label in {"GPS Latitude", "GPS Longitude"} and isinstance(value, (tuple, list)):
        parts = []
        for component in value:
            component_value = _safe_rational_to_float(component)
            parts.append("invalid" if component_value is None else str(round(component_value, 6)))
        return ", ".join(parts)

    if label == "GPS Altitude":
        altitude = _safe_rational_to_float(value)
        return "invalid" if altitude is None else f"{round(altitude, 1)} m"

    if label == "GPS Timestamp" and isinstance(value, (tuple, list)):
        parts = [_safe_rational_to_float(component) for component in value]
        if all(part is not None for part in parts):
            return f"{int(parts[0]):02d}:{int(parts[1]):02d}:{int(parts[2]):02d} UTC"
        return "invalid"

    decoded = _decode_text(value)
    if decoded:
        return decoded
    if isinstance(value, (tuple, list)):
        return "invalid or empty structured value"
    return "present"


def _get_sensitive_context(label):
    if label in {"GPS Latitude", "GPS Longitude", "GPS Altitude", "GPS Timestamp", "GPS Date"}:
        return {
            "description": "This is precise geolocation metadata recorded by the device.",
            "attacker_use": "An attacker can map where the photo was taken and correlate it with addresses, travel, or movement history.",
            "danger_to_user": "It can expose home, office, meeting sites, travel routes, and physical presence patterns.",
            "danger_level": "CRITICAL",
        }

    if label in {"GPS Image Direction", "GPS Image Direction Ref", "GPS Speed", "GPS Speed Ref"}:
        return {
            "description": "This is movement or orientation metadata associated with the capture location.",
            "attacker_use": "An attacker can infer direction of travel, the way the camera was pointing, or movement context.",
            "danger_to_user": "It adds situational detail that makes location-based stalking or site reconstruction easier.",
            "danger_level": "HIGH",
        }

    if label.startswith("GPS "):
        return {
            "description": "This is supporting GPS metadata that helps reconstruct location data.",
            "attacker_use": "An attacker can combine it with other GPS fields to understand how the device stored location details.",
            "danger_to_user": "Even helper GPS fields can confirm that geotagging was enabled and support broader location analysis.",
            "danger_level": "MEDIUM",
        }

    if label in {"Camera Serial Number", "Lens Serial Number"}:
        return {
            "description": "This is a unique hardware identifier for the imaging device.",
            "attacker_use": "An attacker can track the same device across multiple uploads and link separate incidents or identities.",
            "danger_to_user": "It creates a durable fingerprint that can be tied back to you or your equipment over time.",
            "danger_level": "CRITICAL",
        }

    if label in {"Camera Make", "Camera Model", "Software", "Lens Info", "Lens Make", "Lens Model", "Maker Note"}:
        return {
            "description": "This is device fingerprinting metadata about the phone, camera, lens, or capture software.",
            "attacker_use": "An attacker can profile your device stack, narrow down ownership, and correlate multiple files to the same source.",
            "danger_to_user": "It helps identify or track the device you use, which can reduce anonymity.",
            "danger_level": "HIGH",
        }

    if label in {"Date Taken", "Date Digitized", "Offset Time"}:
        return {
            "description": "This is timestamp metadata showing when the file was captured and the device time zone context.",
            "attacker_use": "An attacker can reconstruct schedules, attendance, time zones, and the chronology of events.",
            "danger_to_user": "It can reveal routines, whereabouts at specific times, and operational timing.",
            "danger_level": "HIGH",
        }

    if label in {"Artist", "Copyright", "Camera Owner", "Host Computer", "User Comment"}:
        return {
            "description": "This is identity or free-text metadata that may contain names, ownership info, device names, or internal notes.",
            "attacker_use": "An attacker can extract personal names, workstation names, project details, or other direct clues about the owner.",
            "danger_to_user": "It can expose personal identity, internal context, or sensitive notes that should not leave the organization.",
            "danger_level": "HIGH",
        }

    return {
        "description": "This is metadata that can reveal information about the file, device, or capture context.",
        "attacker_use": "An attacker can combine it with other metadata fields to build a stronger profile of the source.",
        "danger_to_user": "Even small metadata leaks become more dangerous when multiple files are correlated together.",
        "danger_level": "MEDIUM",
    }


def _build_sensitive_finding(label, value, ifd_name):
    context = _get_sensitive_context(label)
    return {
        "label": label,
        "value": _format_sensitive_value(label, value),
        "ifd_name": ifd_name,
        "description": context["description"],
        "attacker_use": context["attacker_use"],
        "danger_to_user": context["danger_to_user"],
        "danger_level": context["danger_level"],
    }


def extract_metadata_report(image_path: str) -> dict:
    """
    Parse EXIF metadata from an image and return a structured report.
    Does not modify the source file.
    """
    report = {
        "file": str(image_path),
        "file_size_kb": round(Path(image_path).stat().st_size / 1024, 1),
        "gps": None,
        "gps_warning": None,
        "thumbnail_present": False,
        "thumbnail_size_bytes": 0,
        "sensitive_findings": [],
        "device": {},
        "timestamps": {},
        "other_pii": {},
        "safe_metadata": {},
        "raw_tag_count": 0,
        "sensitive_tag_count": 0,
        "risk_level": "LOW",
        "risk_reasons": [],
    }

    try:
        exif_data = piexif.load(image_path)
    except Exception:
        report["error"] = "No EXIF data found or unsupported format."
        return report

    all_tags = []
    for ifd_name in ("0th", "Exif", "GPS", "1st"):
        ifd = exif_data.get(ifd_name, {})
        for tag_id, value in ifd.items():
            all_tags.append((ifd_name, tag_id, value))

    report["raw_tag_count"] = len(all_tags)

    for ifd_name, tag_id, value in all_tags:
        label = SENSITIVE_TAGS.get(tag_id)
        if not label:
            continue
        report["sensitive_findings"].append(_build_sensitive_finding(label, value, ifd_name))

    thumbnail = exif_data.get("thumbnail")
    if thumbnail:
        report["thumbnail_present"] = True
        report["thumbnail_size_bytes"] = len(thumbnail)
        report["risk_reasons"].append(
            "Embedded EXIF thumbnail present (residual preview may leak content)"
        )
        report["sensitive_findings"].append(
            {
                "label": "Embedded EXIF Thumbnail",
                "value": f"{round(len(thumbnail) / 1024, 1)} KB preview image",
                "ifd_name": "thumbnail",
                "description": "This is a smaller preview image embedded inside the original file metadata.",
                "attacker_use": "An attacker can recover a preview of the image even if they do not inspect the full-resolution pixels first.",
                "danger_to_user": "Sensitive content may still leak through the embedded preview, even when users think only metadata is at risk.",
                "danger_level": "HIGH",
            }
        )

    for ifd_name in ("0th", "Exif"):
        ifd = exif_data.get(ifd_name, {})
        for tag_id, label in SAFE_TAGS.items():
            value = ifd.get(tag_id)
            if value is None:
                continue
            report["safe_metadata"][label] = _decode_text(value)

    gps_ifd = exif_data.get("GPS", {})
    if gps_ifd:
        lat_ref = gps_ifd.get(0x0001, b"N").decode("ascii", errors="ignore").strip()
        lon_ref = gps_ifd.get(0x0003, b"E").decode("ascii", errors="ignore").strip()
        lat_dms = gps_ifd.get(0x0002)
        lon_dms = gps_ifd.get(0x0004)
        altitude_raw = gps_ifd.get(0x0006)

        lat = dms_to_decimal(lat_dms, lat_ref) if lat_dms else None
        lon = dms_to_decimal(lon_dms, lon_ref) if lon_dms else None
        altitude = None
        if altitude_raw:
            altitude_value = _safe_rational_to_float(altitude_raw)
            if altitude_value is not None:
                altitude = round(altitude_value, 1)

        has_valid_coords = (
            _is_valid_gps_ref(lat_ref, "lat")
            and _is_valid_gps_ref(lon_ref, "lon")
            and lat is not None
            and lon is not None
            and not (lat == 0.0 and lon == 0.0)
        )

        if has_valid_coords:
            report["gps"] = {
                "latitude": lat,
                "longitude": lon,
                "altitude_m": altitude,
                "maps_url": f"https://maps.google.com/?q={lat},{lon}",
            }
            report["risk_reasons"].append("GPS coordinates embedded (exact location exposed)")
        elif any(tag in gps_ifd for tag in (0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006)):
            report["gps_warning"] = (
                "GPS metadata block is present, but the stored coordinates are empty or invalid."
            )

    ifd0 = exif_data.get("0th", {})
    exif_ifd = exif_data.get("Exif", {})

    make = _decode_text(ifd0.get(0x010F))
    model = _decode_text(ifd0.get(0x0110))
    software = _decode_text(ifd0.get(0x0131))
    serial = _decode_text(exif_ifd.get(0xA431))

    if make:
        report["device"]["make"] = make
    if model:
        report["device"]["model"] = model
    if software:
        report["device"]["software"] = software
    if serial:
        report["device"]["serial"] = serial
        report["risk_reasons"].append("Device serial number exposed (device fingerprinting possible)")
    if make or model:
        report["risk_reasons"].append("Camera make/model exposed (device fingerprinting)")

    date_taken = _decode_text(exif_ifd.get(0x9003))
    date_digitized = _decode_text(exif_ifd.get(0x9004))
    offset_time = _decode_text(exif_ifd.get(0x9010))

    if date_taken:
        report["timestamps"]["date_taken"] = date_taken
        report["risk_reasons"].append("Precise timestamp exposes when the photo was taken")
    if date_digitized:
        report["timestamps"]["date_digitized"] = date_digitized
    if offset_time:
        report["timestamps"]["offset_time"] = offset_time

    artist = _decode_text(ifd0.get(0x013B))
    copyright_ = _decode_text(ifd0.get(0x8298))
    host_computer = _decode_text(ifd0.get(0x013C))
    owner = _decode_text(exif_ifd.get(0xA430))
    user_comment = _decode_user_comment(exif_ifd.get(0x9286))

    if artist:
        report["other_pii"]["artist"] = artist
        report["risk_reasons"].append("Artist/author name embedded")
    if copyright_:
        report["other_pii"]["copyright"] = copyright_
    if host_computer:
        report["other_pii"]["host_computer"] = host_computer
        report["risk_reasons"].append("Host computer name embedded")
    if owner:
        report["other_pii"]["camera_owner"] = owner
        report["risk_reasons"].append("Camera owner name embedded")
    if user_comment:
        report["other_pii"]["user_comment"] = user_comment
        report["risk_reasons"].append("User comment embedded")

    sensitive_count = sum(1 for _, tag_id, _ in all_tags if tag_id in SENSITIVE_TAGS)
    report["sensitive_tag_count"] = sensitive_count
    report["sensitive_findings"].sort(
        key=lambda item: (
            SEVERITY_RANK.get(item["danger_level"], 3),
            item["label"],
        )
    )

    if report["gps"] or report["device"].get("serial"):
        report["risk_level"] = "CRITICAL"
    elif sensitive_count >= 5:
        report["risk_level"] = "HIGH"
    elif sensitive_count >= 2:
        report["risk_level"] = "MEDIUM"

    return report


def strip_metadata(input_path: str, output_path: str) -> dict:
    """
    Strip all metadata from an image and save a clean JPEG copy.
    Returns a summary of what was removed.
    """
    before = extract_metadata_report(input_path)

    with Image.open(input_path) as img:
        clean_image = img.copy() if img.mode in ("RGB", "L") else img.convert("RGB")
        try:
            clean_image.save(output_path, format="JPEG", quality=95)
        finally:
            clean_image.close()

    after = extract_metadata_report(output_path)

    return {
        "input_file": input_path,
        "output_file": output_path,
        "before": before,
        "after": after,
        "tags_removed": before["raw_tag_count"] - after["raw_tag_count"],
        "size_before_kb": before["file_size_kb"],
        "size_after_kb": after["file_size_kb"],
        "stripped_at": datetime.now().isoformat(),
        "success": after["sensitive_tag_count"] == 0,
    }
