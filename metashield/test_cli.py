"""
Meta-Shield: CLI Test Runner
Run this to test the full pipeline from the terminal.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from document_cleaner import strip_document_metadata
from document_scanner import extract_document_report, is_document_file
from dlp_interceptor import DLPInterceptor
from exif_stripper import extract_metadata_report, strip_metadata
from services.media_processor import extract_media_metadata, is_media_file, strip_media_metadata


def print_section(title):
    print(f"\n{'=' * 55}")
    print(f"  {title}")
    print(f"{'=' * 55}")


def print_report(report):
    risk = report["risk_level"]
    file_type = report.get("file_type", "image")
    colors = {
        "CRITICAL": "\033[91m",
        "HIGH": "\033[93m",
        "MEDIUM": "\033[94m",
        "LOW": "\033[92m",
    }
    reset = "\033[0m"
    color = colors.get(risk, "")

    print(f"\n  Risk Level : {color}{risk}{reset}")
    print(f"  File Type  : {file_type}")
    print(f"  File Size  : {report['file_size_kb']} KB")
    print(
        f"  Meta Tags  : {report['raw_tag_count']} total, "
        f"{report['sensitive_tag_count']} sensitive"
    )
    if "score" in report:
        print(f"  Risk Score : {report.get('score', 0)}")
    if report.get("thumbnail_present"):
        print(
            f"  Thumbnail  : PRESENT ({round(report['thumbnail_size_bytes'] / 1024, 1)} KB)"
        )

    if report.get("gps"):
        gps = report["gps"]
        print("\n  \033[91mGPS EXPOSED\033[0m")
        print(f"     Latitude  : {gps['latitude']}")
        print(f"     Longitude : {gps['longitude']}")
        print(f"     Altitude  : {gps.get('altitude_m')} m")
        print(f"     Maps URL  : {gps['maps_url']}")

    if report.get("device"):
        print("\n  \033[91mDEVICE INFO\033[0m")
        for key, value in report["device"].items():
            print(f"     {key.capitalize():12}: {value}")

    if report.get("timestamps"):
        print("\n  \033[91mTIMESTAMPS\033[0m")
        for key, value in report["timestamps"].items():
            print(f"     {key:20}: {value}")

    if report.get("other_pii"):
        print("\n  \033[91mOTHER PII\033[0m")
        for key, value in report["other_pii"].items():
            print(f"     {key:20}: {value}")

    if report.get("contains_hidden_data"):
        print("\n  \033[91mHIDDEN DATA\033[0m")
        print("     Hidden comments, revisions, or embedded objects were detected.")

    if report.get("risk_reasons"):
        print("\n  Reasons:")
        for reason in report["risk_reasons"]:
            print(f"    - {reason}")

    if report.get("recommendations"):
        print("\n  Recommendations:")
        for recommendation in report["recommendations"]:
            print(f"    - {recommendation}")


def main():
    parser = argparse.ArgumentParser(
        description="Scan a user-provided file, strip metadata, and run the DLP flow.",
    )
    parser.add_argument("file_path", help="Path to the file you want to process")
    args = parser.parse_args()

    source_path = Path(args.file_path).expanduser()
    if not source_path.exists():
        raise FileNotFoundError(f"Input file not found: {source_path}")

    outputs_dir = Path("outputs")
    outputs_dir.mkdir(exist_ok=True)
    clean_file = outputs_dir / f"clean_{source_path.stem}{source_path.suffix.lower()}"

    if is_document_file(source_path.name):
        scan_file = extract_document_report
        clean_metadata = strip_document_metadata
    elif is_media_file(source_path.name):
        scan_file = extract_media_metadata
        clean_metadata = strip_media_metadata
    else:
        scan_file = extract_metadata_report
        clean_metadata = strip_metadata
        clean_file = outputs_dir / f"clean_{source_path.stem}.jpg"

    print("\n\033[92mMETA-SHIELD - CLI Demo\033[0m")
    print("Zero-Trust Email Interceptor\n")

    print_section("1 / 4 - Scanning metadata before stripping")
    before = scan_file(str(source_path))
    print_report(before)

    print_section("2 / 4 - Stripping all metadata")
    result = clean_metadata(str(source_path), str(clean_file))
    print(f"\n  Tags removed : {result['tags_removed']}")
    print(f"  Size before  : {result['size_before_kb']} KB")
    print(f"  Size after   : {result['size_after_kb']} KB")

    print_section("3 / 4 - Verifying after stripping")
    after = scan_file(str(clean_file))
    print_report(after)

    passed = (
        after["sensitive_tag_count"] == 0
        and after.get("gps") is None
        and not after.get("contains_hidden_data", False)
    )
    if passed:
        print("\n  \033[92mVERIFICATION PASSED - zero sensitive tags remain\033[0m")
    else:
        print("\n  \033[91mVERIFICATION FAILED - sensitive tags remain\033[0m")

    print_section("4 / 4 - Mock DLP email interceptor")
    dlp = DLPInterceptor()
    audit = dlp.intercept(
        sender="arjun@corp.com",
        recipients=["client@external.com"],
        subject=f"File upload: {source_path.name}",
        body="Attachment supplied by the user and processed by Meta-Shield.",
        attachments=[str(source_path)],
        send_email=False,
    )

    first_attachment = next(
        (item for item in audit["attachment_reports"] if item.get("artifact_output_file")),
        None,
    )

    print(f"\n  Intercepted at  : {audit['intercepted_at']}")
    print(f"  Sender          : {audit['sender']}")
    print(f"  Recipients      : {', '.join(audit['recipients'])}")
    print(f"  Images processed: {audit['images_processed']}")
    print(f"  Docs processed  : {audit.get('documents_processed', 0)}")
    print(f"  Media processed : {audit.get('media_processed', 0)}")
    print(f"  Tags removed    : {audit['total_tags_removed']}")
    print(
        f"  Clean file      : "
        f"{first_attachment.get('artifact_output_file', 'N/A') if first_attachment else 'N/A'}"
    )
    print(f"  Clean .eml      : {audit.get('clean_email_output', 'N/A')}")
    print(f"  Audit JSON      : {audit.get('audit_report_output', 'N/A')}")
    print(f"  Duration        : {audit['duration_ms']} ms")
    print("\n  \033[92mEmail intercepted, sanitized, and ready to forward\033[0m")

    print(f"\n{'=' * 55}\n")


if __name__ == "__main__":
    main()
