#!/usr/bin/env python3
"""Generate the demo's immutable voice clips with ElevenLabs.

Dry-run is the default. Paid API calls happen only with --generate. The API key is
read from the process environment or from the existing tts-play-rehearsal .env;
it is never written to this project or printed.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BUNDLE_PATH = ROOT / "packages/content/fixtures/content-bundle.json"
SOURCE_DIR = ROOT / "assets/game/voice"
PUBLIC_DIR = ROOT / "apps/web/public/assets/voice"
MANIFEST_PATH = ROOT / "assets/_sources/elevenlabs-generation.json"
DEFAULT_ENV_FILE = Path(
    os.environ.get(
        "ELEVENLABS_ENV_FILE",
        str(Path.home() / "Documents/tts-play-rehearsal/.env"),
    )
)

MODEL_ID = "eleven_v3"
OUTPUT_FORMAT = "mp3_44100_128"
LANGUAGE_CODE = "ru"
PIPELINE_VERSION = 1
VOICE_IDS = {
    "pik": "rSfuQoQ3FY8SVKeraMAp",
    "system": "Vl27Cllkuw8BhyPqus2n",
    # Backward-compatible fallback for old content bundles.
    "nima": "Vl27Cllkuw8BhyPqus2n",
}
VOICE_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.75,
    "style": 0.15,
    "use_speaker_boost": True,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--generate",
        action="store_true",
        help="perform paid ElevenLabs API calls (otherwise validate and print a dry-run)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="regenerate clips even when their recorded fingerprint still matches",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of concurrent requests (default: 1; some custom voices reject parallel synthesis)",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help="fallback .env containing ELEVENLABS_API_KEY",
    )
    parser.add_argument(
        "--line-id",
        action="append",
        dest="line_ids",
        help="generate only this dialogue line (repeatable; useful for review or diagnostics)",
    )
    return parser.parse_args()


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def api_text(text: str) -> str:
    """Keep UI copy canonical while making spoken abbreviations unambiguous."""
    return text.replace("Маяк-7", "Маяк семь").replace("Маяка-7", "Маяка семь")


def load_lines() -> list[dict[str, Any]]:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    lines = bundle.get("dialogue_catalog")
    if not isinstance(lines, list) or not lines:
        raise RuntimeError("content bundle has no dialogue_catalog")

    seen_ids: set[str] = set()
    seen_files: set[str] = set()
    prepared: list[dict[str, Any]] = []
    for line in lines:
        line_id = line.get("id")
        speaker = line.get("speaker")
        text = line.get("text")
        audio_file = line.get("audio_file")
        if not all(isinstance(value, str) and value for value in (line_id, speaker, text, audio_file)):
            raise RuntimeError(f"invalid dialogue entry: {line!r}")
        if speaker not in VOICE_IDS:
            raise RuntimeError(f"no ElevenLabs voice mapping for speaker {speaker!r} ({line_id})")
        prefix = "/assets/voice/"
        if not audio_file.startswith(prefix) or Path(audio_file).name != audio_file[len(prefix) :]:
            raise RuntimeError(f"unsafe or unsupported audio_file for {line_id}: {audio_file}")
        if not audio_file.endswith(".mp3"):
            raise RuntimeError(f"voice target must be MP3 for {line_id}: {audio_file}")
        if line_id in seen_ids or audio_file in seen_files:
            raise RuntimeError(f"duplicate dialogue id or output path: {line_id}")
        seen_ids.add(line_id)
        seen_files.add(audio_file)

        spoken_text = api_text(text)
        voice_id = VOICE_IDS[speaker]
        fingerprint_input = {
            "pipeline_version": PIPELINE_VERSION,
            "line_id": line_id,
            "speaker": speaker,
            "voice_id": voice_id,
            "text": text,
            "api_text": spoken_text,
            "model_id": MODEL_ID,
            "output_format": OUTPUT_FORMAT,
            "language_code": LANGUAGE_CODE,
            "voice_settings": VOICE_SETTINGS,
        }
        canonical = json.dumps(
            fingerprint_input, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        fingerprint = hashlib.sha256(canonical).hexdigest()
        seed = int(fingerprint[:8], 16)
        prepared.append(
            {
                **fingerprint_input,
                "audio_file": audio_file,
                "filename": Path(audio_file).name,
                "fingerprint": f"sha256:{fingerprint}",
                "seed": seed,
            }
        )
    return prepared


def load_previous_manifest() -> dict[str, dict[str, Any]]:
    if not MANIFEST_PATH.is_file():
        return {}
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for item in manifest.get("clips", []):
        if not isinstance(item, dict) or not isinstance(item.get("line_id"), str):
            continue
        sanitized = dict(item)
        sanitized.pop("request_id", None)
        result[item["line_id"]] = sanitized
    return result


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def reusable(line: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    if not previous or previous.get("fingerprint") != line["fingerprint"]:
        return False
    source = SOURCE_DIR / line["filename"]
    public = PUBLIC_DIR / line["filename"]
    if not source.is_file() or not public.is_file():
        return False
    expected_sha = previous.get("audio_sha256")
    return bool(expected_sha and file_sha256(source) == expected_sha == file_sha256(public))


def ssl_context(env_values: dict[str, str]) -> ssl.SSLContext:
    cafile = os.environ.get("ELEVENLABS_CA_FILE") or env_values.get("ELEVENLABS_CA_FILE")
    return ssl.create_default_context(cafile=cafile or None)


def synthesize(
    line: dict[str, Any], api_key: str, base_url: str, context: ssl.SSLContext
) -> bytes:
    endpoint = (
        f"{base_url.rstrip('/')}/text-to-speech/{quote(line['voice_id'], safe='')}"
        f"?output_format={OUTPUT_FORMAT}"
    )
    body = json.dumps(
        {
            "text": line["api_text"],
            "model_id": MODEL_ID,
            "language_code": LANGUAGE_CODE,
            "voice_settings": VOICE_SETTINGS,
            "seed": line["seed"],
            "apply_text_normalization": "on",
        },
        ensure_ascii=False,
    ).encode("utf-8")

    for attempt in range(1, 6):
        request = Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key,
                "User-Agent": "LikaGame-voice-generator/1",
            },
        )
        try:
            with urlopen(request, timeout=180, context=context) as response:
                audio = response.read()
                if len(audio) < 1_000:
                    raise RuntimeError(f"ElevenLabs returned an unexpectedly small audio file for {line['line_id']}")
                return audio
        except HTTPError as error:
            detail = ""
            try:
                error_payload = json.loads(error.read().decode("utf-8"))
                error_detail = error_payload.get("detail", error_payload)
                if isinstance(error_detail, dict):
                    code = error_detail.get("code") or error_detail.get("status") or error_detail.get("type")
                    message = error_detail.get("message")
                    detail = ": ".join(str(value) for value in (code, message) if value)
                elif isinstance(error_detail, str):
                    detail = error_detail
            except (UnicodeDecodeError, json.JSONDecodeError, OSError):
                detail = ""
            if api_key and detail:
                detail = detail.replace(api_key, "[redacted]")[:500]
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt == 5:
                raise RuntimeError(
                    f"ElevenLabs HTTP {error.code} for {line['line_id']}"
                    + (f": {detail}" if detail else "")
                ) from error
        except (URLError, TimeoutError) as error:
            if attempt == 5:
                raise RuntimeError(f"ElevenLabs connection failed for {line['line_id']}") from error
        time.sleep(min(2**attempt, 20))
    raise AssertionError("unreachable")


def probe_audio(audio: bytes, filename: str) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        if not (audio.startswith(b"ID3") or (audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)):
            raise RuntimeError(f"{filename} is not recognizable as MP3")
        return {"duration_seconds": None, "sample_rate_hz": 44_100, "channels": None}

    with tempfile.NamedTemporaryFile(suffix=".mp3") as temp:
        temp.write(audio)
        temp.flush()
        probe = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,channels:format=duration",
                "-of",
                "json",
                temp.name,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    parsed = json.loads(probe.stdout)
    stream = parsed["streams"][0]
    duration = round(float(parsed["format"]["duration"]), 3)
    sample_rate = int(stream["sample_rate"])
    if duration <= 0 or sample_rate != 44_100:
        raise RuntimeError(f"unexpected audio metadata for {filename}")
    return {
        "duration_seconds": duration,
        "sample_rate_hz": sample_rate,
        "channels": int(stream["channels"]),
    }


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as temp:
        temp.write(data)
        temp_path = Path(temp.name)
    try:
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def generated_manifest_entry(
    line: dict[str, Any], audio: bytes, metadata: dict[str, Any]
) -> dict[str, Any]:
    return {
        "line_id": line["line_id"],
        "speaker": line["speaker"],
        "voice_id": line["voice_id"],
        "text": line["text"],
        "api_text": line["api_text"],
        "audio_file": line["audio_file"],
        "fingerprint": line["fingerprint"],
        "seed": line["seed"],
        "audio_sha256": f"sha256:{hashlib.sha256(audio).hexdigest()}",
        **metadata,
    }


def main() -> int:
    args = parse_args()
    if not 1 <= args.workers <= 6:
        raise SystemExit("--workers must be between 1 and 6")

    lines = load_lines()
    if args.line_ids:
        requested = set(args.line_ids)
        available = {line["line_id"] for line in lines}
        missing = sorted(requested - available)
        if missing:
            raise SystemExit(f"unknown --line-id: {', '.join(missing)}")
        lines = [line for line in lines if line["line_id"] in requested]
    total_characters = sum(len(line["api_text"]) for line in lines)
    previous = load_previous_manifest()
    cached = [line for line in lines if not args.force and reusable(line, previous.get(line["line_id"]))]
    pending = [line for line in lines if line not in cached]

    mode = "GENERATE" if args.generate else "DRY RUN"
    print(
        f"{mode}: {len(lines)} clips, {total_characters} spoken characters; "
        f"{len(cached)} reusable, {len(pending)} pending"
    )
    print(f"Pik voice: {VOICE_IDS['pik']} | dispatcher voice: {VOICE_IDS['system']}")
    print(f"Model: {MODEL_ID} | format: {OUTPUT_FORMAT} | language: {LANGUAGE_CODE}")
    if not args.generate:
        print("No API calls made. Pass --generate to synthesize pending clips.")
        return 0

    env_values = read_dotenv(args.env_file)
    api_key = os.environ.get("ELEVENLABS_API_KEY") or env_values.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit(
            "ELEVENLABS_API_KEY is missing from the environment and fallback .env file"
        )
    base_url = (
        os.environ.get("ELEVENLABS_BASE_URL")
        or env_values.get("ELEVENLABS_BASE_URL")
        or "https://api.elevenlabs.io/v1"
    )
    context = ssl_context(env_values)

    manifest_entries: dict[str, dict[str, Any]] = {
        line["line_id"]: previous[line["line_id"]]
        for line in cached
    }

    def generate_one(line: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        audio = synthesize(line, api_key, base_url, context)
        metadata = probe_audio(audio, line["filename"])
        atomic_write(SOURCE_DIR / line["filename"], audio)
        atomic_write(PUBLIC_DIR / line["filename"], audio)
        entry = generated_manifest_entry(line, audio, metadata)
        return line["line_id"], entry

    if pending:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            future_map = {pool.submit(generate_one, line): line for line in pending}
            completed = 0
            for future in concurrent.futures.as_completed(future_map):
                line = future_map[future]
                completed += 1
                try:
                    line_id, entry = future.result()
                except Exception:
                    print(f"FAILED [{completed}/{len(pending)}] {line['line_id']}")
                    raise
                manifest_entries[line_id] = entry
                print(f"generated [{completed}/{len(pending)}] {line['filename']}")

    ordered_entries = [manifest_entries[line["line_id"]] for line in lines]
    manifest = {
        "schema_version": 1,
        "pipeline_version": PIPELINE_VERSION,
        "provider": "ElevenLabs",
        "endpoint": "/v1/text-to-speech/{voice_id}",
        "model_id": MODEL_ID,
        "output_format": OUTPUT_FORMAT,
        "language_code": LANGUAGE_CODE,
        "voice_settings": VOICE_SETTINGS,
        "source_bundle": str(BUNDLE_PATH.relative_to(ROOT)),
        "clips": ordered_entries,
    }
    atomic_write(
        MANIFEST_PATH,
        (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    print(f"Done: {len(ordered_entries)} verified clips written to both voice directories.")
    print(f"Sanitized manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
