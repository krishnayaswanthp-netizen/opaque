"""
Meta-Shield: CLI Test Runner
Run this to test the full pipeline from the terminal.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dlp_interceptor import DLPInterceptor
from exif_stripper import extract_metadata_report, strip_metadata


def print_section(title):
    print(f"\n{'=' * 55}")
    print(f"  {title}")
    print(f"{'=' * 55}")


def print_report(report):
    risk = report["risk_level"]
    colors = {
        "CRITICAL": "\033[91m",
        "HIGH": "\033[93m",
        "MEDIUM": "\033[94m",
        "LOW": "\033[92m",
    }
    reset = "\033[0m"
    color = colors.get(risk, "")

    print(f"\n  Risk Level : {color}{risk}{reset}")
    print(f"  File Size  : {report['file_size_kb']} KB")
    print(
        f"  EXIF Tags  : {report['raw_tag_count']} total, "
        f"{report['sensitive_tag_count']} sensitive"
    )
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

    if report.get("risk_reasons"):
        print("\n  Reasons:")
        for reason in report["risk_reasons"]:
            print(f"    - {reason}")


def main():
    parser = argparse.ArgumentParser(
        description="Scan a user-provided image, strip metadata, and run the DLP flow.",
    )
    parser.add_argument("image_path", help="Path to the image file you want to process")
    args = parser.parse_args()

    source_path = Path(args.image_path).expanduser()
    if not source_path.exists():
        raise FileNotFoundError(f"Input file not found: {source_path}")

    outputs_dir = Path("outputs")
    outputs_dir.mkdir(exist_ok=True)
    clean_img = outputs_dir / f"clean_{source_path.stem}.jpg"

    print("\n\033[92mMETA-SHIELD - CLI Demo\033[0m")
    print("Zero-Trust Email Interceptor\n")

    print_section("1 / 4 - Scanning metadata before stripping")
    before = extract_metadata_report(str(source_path))
    print_report(before)

    print_section("2 / 4 - Stripping all metadata")
    result = strip_metadata(str(source_path), str(clean_img))
    print(f"\n  Tags removed : {result['tags_removed']}")
    print(f"  Size before  : {result['size_before_kb']} KB")
    print(f"  Size after   : {result['size_after_kb']} KB")

    print_section("3 / 4 - Verifying after stripping")
    after = extract_metadata_report(str(clean_img))
    print_report(after)

    passed = after["sensitive_tag_count"] == 0 and after["gps"] is None
    if passed:
        print("\n  \033[92mVERIFICATION PASSED - zero sensitive tags remain\033[0m")
    else:
        print("\n  \033[91mVERIFICATION FAILED - sensitive tags remain\033[0m")

    print_section("4 / 4 - Mock DLP email interceptor")
    dlp = DLPInterceptor()
    audit = dlp.intercept(
        sender="arjun@corp.com",
        recipients=["client@external.com"],
        subject=f"Image upload: {source_path.name}",
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
    print(f"  Tags removed    : {audit['total_tags_removed']}")
    print(
        f"  Clean image     : "
        f"{first_attachment.get('artifact_output_file', 'N/A') if first_attachment else 'N/A'}"
    )
    print(f"  Clean .eml      : {audit.get('clean_email_output', 'N/A')}")
    print(f"  Audit JSON      : {audit.get('audit_report_output', 'N/A')}")
    print(f"  Duration        : {audit['duration_ms']} ms")
    print("\n  \033[92mEmail intercepted, sanitized, and ready to forward\033[0m")

    print(f"\n{'=' * 55}\n")


if __name__ == "__main__":
    main()
