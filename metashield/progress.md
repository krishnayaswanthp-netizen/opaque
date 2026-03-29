# Meta-Shield Progress And Decision Log

This file explains how Meta-Shield evolved, why major changes were made, and what each change enabled. It is intended to help a new engineer or AI understand the project trajectory without reconstructing decisions from commit history.

## 1. Current State Summary

Meta-Shield started as a metadata-stripping demo centered on image EXIF. It is now a broader zero-trust DLP workflow with:

- Flask backend routing and artifact management
- Next.js dashboard in sibling `../metaUI`
- image, document, and media metadata analysis
- detailed risk explanations
- single-file strip and email send
- multi-file clean ZIP generation
- one-email batch delivery

The design principle throughout the project has been:

Reuse one pipeline shape across file types instead of building separate one-off products for images, documents, and media.

## 2. Why This Log Exists

The codebase changed in layers:

- reliability fixes
- correctness fixes
- explainability improvements
- new file-type support
- DLP workflow expansion
- UI/backend integration
- frontend refactor
- operational hardening

Without this file, a new AI might understand what the project can do but miss why modules were added or why certain defaults were chosen.

## 3. Decision Timeline

### Phase 1: Stabilize The Original Demo

#### 3.1 Project analysis and run-path cleanup

What changed:

- mapped the original backend flow
- identified `app.py`, `exif_stripper.py`, `dlp_interceptor.py`, and `test_cli.py` as the core execution path
- rewrote setup guidance so the system could be run predictably

Why this happened:

- safe extension work needs a reliable baseline
- undocumented startup paths make every later change riskier

What it enabled:

- consistent backend startup with `python app.py`
- cleaner onboarding for future contributors

#### 3.2 Hardened EXIF parsing against malformed GPS data

What changed:

- fixed divide-by-zero and malformed-rational issues in EXIF GPS parsing

Why this happened:

- real user files contain partial, malformed, or hostile metadata blocks
- a security tool should never crash on suspicious input

What it enabled:

- robust `/scan` behavior on real phone photos
- graceful handling of invalid GPS fields

#### 3.3 Distinguished invalid GPS placeholders from real location leaks

What changed:

- added logic to identify GPS containers with empty or unusable coordinates
- surfaced a dedicated warning instead of treating every GPS block as a true leak

Why this happened:

- precision matters in a security product
- overstating exposure undermines trust

What it enabled:

- accurate user messaging for “GPS block present but location unrecoverable” cases

### Phase 2: Remove Demo Artifacts And Improve Explainability

#### 3.4 Removed fake/static test input from active flows

What changed:

- removed built-in fake input generation from the main user path
- shifted the system to operate only on user-provided files

Why this happened:

- seeded demo files confused real testing
- hidden defaults are the opposite of zero-trust behavior

What it enabled:

- deterministic testing using only actual uploads
- fewer surprises in demos

#### 3.5 Added detailed exposure reporting

What changed:

- extended reporting beyond risk pills
- added per-tag explanations with:
  - what the field is
  - how an attacker could use it
  - why it is dangerous to the user

Why this happened:

- metadata tools need explainability, not just “red/yellow/green”
- the project is used as both a DLP demo and an educational aid

What it enabled:

- detailed findings view in the dashboard
- more defensible risk explanations

#### 3.6 Made thumbnail leakage visible

What changed:

- verified that embedded image thumbnails were being stripped
- surfaced thumbnail leakage in the scan and strip reports

Why this happened:

- thumbnails are a common hidden-data leak
- users need to see that cleanup covers more than obvious EXIF tags

What it enabled:

- before/after proof that embedded preview thumbnails are removed

### Phase 3: Make The Modern UI Real

#### 3.7 Integrated the Next.js dashboard with the real Flask backend

What changed:

- connected `../metaUI` to live Flask endpoints
- preserved the legacy Flask UI instead of replacing it

Why this happened:

- the new UI existed visually but needed real backend behavior
- keeping the legacy UI reduced migration risk

What it enabled:

- live upload, scan, strip, and download from the modern dashboard

#### 3.8 Added SMTP-backed send-from-dashboard flow

What changed:

- moved email composition inputs into the UI
- loaded SMTP transport settings from backend environment variables

Why this happened:

- users should not have to enter message details in the terminal
- email sending is part of the DLP demo outcome, not a separate admin-only concern

What it enabled:

- in-app sending of sanitized files
- clearer separation between transport secrets and user message content

### Phase 4: Expand Beyond Images

#### 3.9 Added PDF and DOCX metadata analysis

What changed:

- introduced `document_scanner.py`
- introduced `document_cleaner.py`
- extended the routing layer to detect document types

Why this happened:

- real DLP problems involve documents as often as images
- PDF and DOCX carry author, reviewer, comment, revision, and producer metadata

What it enabled:

- scan and sanitize support for `.pdf` and `.docx`

#### 3.10 Extended the DLP path to sanitize documents too

What changed:

- reused the existing DLP interception pattern for document files

Why this happened:

- document support needed to plug into the existing email and audit path
- separate document-only forwarding logic would have duplicated behavior

What it enabled:

- documents moving through the same sanitize-and-forward pipeline as images

### Phase 5: Add Batch Processing

#### 3.11 Added backend batch processing and batch email delivery

What changed:

- created `services/batch_processor.py`
- created `services/email_service.py`
- created `routes/batch_mail.py`
- added one-email batch delivery

Why this happened:

- users often need to sanitize many attachments at once
- the requirement was one outbound email, not one email per cleaned file

What it enabled:

- one-email batch processing with per-file success/failure reporting

#### 3.12 Added multi-file selection in the dashboard

What changed:

- enabled multi-file upload in the Next.js UI
- preserved the deeper single-file path for detailed inspection

Why this happened:

- batch backend features needed a matching UI affordance
- single-file and multi-file workflows solve different problems

What it enabled:

- drag-and-drop or multi-select batch workflows from the dashboard

#### 3.13 Added clean ZIP preparation and download for batch flows

What changed:

- exposed a batch strip route that prepares one clean ZIP
- added batch clean download endpoints and UI controls

Why this happened:

- batch workflows should remain useful even if SMTP is not configured
- download-first verification is important for demos and audits

What it enabled:

- multi-file sanitize + local download without email dependency

### Phase 6: Improve Operational Clarity

#### 3.14 Rewrote documentation to match the real system

What changed:

- expanded `README.md`
- added and maintained `progress.md`

Why this happened:

- the repo outgrew its original EXIF-demo documentation
- future work was becoming harder because the system shape was no longer obvious

What it enabled:

- faster onboarding
- lower context cost for future contributors and AIs

### Phase 7: Add Media Support

#### 3.15 Added video and audio metadata support

What changed:

- introduced `services/media_processor.py`
- added `ffprobe` extraction and `ffmpeg` strip logic
- integrated media into scan, strip, batch, CLI, and email flows

Why this happened:

- videos and audio files also leak location, timestamps, encoder/toolchain details, identities, and hidden streams
- media support needed to reuse the existing pipeline shape rather than become a separate subsystem

What it enabled:

- support for:
  - `.mp4`
  - `.mov`
  - `.mkv`
  - `.mp3`
  - `.wav`
  - `.aac`

#### 3.16 Added clear handling when FFmpeg tooling is missing

What changed:

- media routes return explicit errors if `ffmpeg` or `ffprobe` are not installed

Why this happened:

- missing native tooling is a deployment issue, not a reason to crash the app

What it enabled:

- graceful degradation for media features
- easier setup debugging

#### 3.17 Fixed FFmpeg self-stamping residual metadata

What changed:

- updated the media strip path to prevent FFmpeg from adding a fresh `encoder=Lavf...` tag to cleaned outputs

Why this happened:

- a cleaned media file was still showing `Lavf...` as sensitive metadata
- that was not user-originated metadata; it was newly introduced by the sanitizer itself

What it enabled:

- cleaned media can be rescanned without showing false-positive encoder leakage from the cleaning process

### Phase 8: Make Large Media Work Reliably

#### 3.18 Added size guards for media processing

What changed:

- enforced per-media-file size limits in `services/media_processor.py`

Why this happened:

- large media files can overwhelm local dev environments and temp storage
- the project needed predictable behavior under batch and upload pressure

What it enabled:

- deliberate rejection of oversized media with clear messaging instead of unstable behavior

#### 3.19 Raised default size limits for real-world testing

What changed:

- set the built-in media default to `200 MB`
- set the built-in backend request cap to `512 MB`
- set the frontend proxy body-size default to `512mb`

Why this happened:

- the initial conservative defaults blocked common demo files
- the project needed practical out-of-the-box behavior without requiring env-var tuning for ordinary usage

What it enabled:

- smoother upload handling for realistic video and audio samples

### Phase 9: Reduce Dev-Time Instability

#### 3.20 Disabled Flask auto-reloader by default

What changed:

- kept debug mode on by default
- turned `use_reloader` off by default unless explicitly enabled

Why this happened:

- writing clean files and audit artifacts during requests could trigger a Flask dev restart
- the Next.js proxy then surfaced this as `ECONNRESET` or `socket hang up`, even when backend work had actually completed

What it enabled:

- more stable `/send_email` and artifact-writing behavior during development

### Phase 10: Refactor The Dashboard Into Reusable Components

#### 3.21 Replaced monolithic page logic with composed frontend modules

What changed:

- reduced `../metaUI/app/page.tsx` to orchestration
- moved presentation and workflow sections into:
  - `components/opaque/header.tsx`
  - `components/opaque/upload-box.tsx`
  - `components/opaque/scan-logs.tsx`
  - `components/opaque/results-panel.tsx`
  - `components/opaque/action-panel.tsx`
  - `components/opaque/batch-panel.tsx`
  - `components/opaque/dashboard-primitives.tsx`
- centralized contracts in `../metaUI/lib/metashield-types.ts`
- centralized backend calls in `../metaUI/lib/metashield-client.ts`

Why this happened:

- the dashboard had become too large to maintain safely as one file
- multiple workflows were sharing presentation patterns but not code
- a reusable component model lowers the risk of future UI changes

What it enabled:

- clearer frontend boundaries
- simpler future edits
- a more maintainable dashboard architecture

#### 3.22 Added visual balance and motion improvements

What changed:

- improved dashboard composition and reusable primitives
- added subtle animation in `../metaUI/app/globals.css`

Why this happened:

- the product needed to feel intentional rather than stitched together
- small motion cues help guide users through upload, scan, and action states

What it enabled:

- a more polished dashboard without changing backend behavior

## 4. Architectural Throughline

The major consistent decisions across all phases were:

### Keep one pipeline shape

Instead of creating a separate mini-app for each file class, the project standardized on:

- upload
- scan
- explain
- sanitize
- download or send

That decision is why image, document, and media support can all coexist without fragmenting the app.

### Normalize outputs

Each scanner returns a report that fits the same broad structure:

- what file it is
- what metadata was found
- what is sensitive
- why it matters
- how risky it is
- whether hidden data exists

That consistency keeps the UI and batch layers reusable.

### Preserve backward compatibility

Existing flows were extended instead of replaced:

- legacy Flask UI was kept
- single-file endpoints were kept
- new features were added as new modules or new routes

This reduces breakage and keeps demos operational while new capability is added.

### Favor explicit safety over silent magic

Examples:

- oversized media is rejected with a clear message
- missing `ffmpeg` / `ffprobe` produces a clear error
- invalid GPS blocks are described accurately instead of exaggerated
- SMTP configuration stays on the backend

## 5. What To Read Next

If you are continuing work:

1. Read `README.md` for the current architecture
2. Read `app.py` to see route entry points
3. Read the file-type module relevant to your task:
   - images: `exif_stripper.py`
   - documents: `document_scanner.py`, `document_cleaner.py`
   - media: `services/media_processor.py`
4. Read the DLP flow layer:
   - `dlp_interceptor.py`
   - `services/email_service.py`
   - `services/batch_processor.py`
   - `routes/batch_mail.py`
5. If the task is frontend-facing, move to the sibling `../metaUI` project and inspect:
   - `app/page.tsx`
   - `lib/metashield-client.ts`
   - `lib/metashield-types.ts`
   - `components/opaque/*`

## 6. Bottom Line

Meta-Shield is no longer just an EXIF demo. It is now a modular metadata-aware DLP workflow that:

- analyzes images, documents, and media
- explains exposure clearly
- sanitizes files
- supports single-file and batch workflows
- packages or sends sanitized outputs
- keeps the backend logic centralized and extensible

That is the lens future work should preserve.
