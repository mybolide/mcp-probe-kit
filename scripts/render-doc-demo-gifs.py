from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "docs" / "demos"
OUTPUT_DIR = ROOT / "docs" / "assets" / "demos"

SCENARIOS = {
    "feature-workbench": {
        "frames": [0, 1, 2, 3, 4, 3, 2, 1],
        "duration": [1100, 1100, 1100, 1100, 1800, 700, 700, 700],
        "height": 720,
    },
    "memory-center": {
        "frames": [0, 1, 2, 1],
        "duration": [1400, 1500, 1800, 900],
        "height": 720,
    },
    "convergence-gate": {
        "frames": [0, 1, 2, 2, 1],
        "duration": [1500, 1400, 2200, 700, 700],
        "height": 560,
    },
}


def find_browser() -> str:
    explicit = os.environ.get("CHROME_BIN")
    if explicit and Path(explicit).exists():
        return explicit

    candidates: list[str] = []
    system = platform.system()
    if system == "Windows":
        candidates.extend(
            [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            ]
        )
    elif system == "Darwin":
        candidates.extend(
            [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]
        )
    else:
        for command in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"):
            resolved = shutil.which(command)
            if resolved:
                candidates.append(resolved)

    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("Chrome/Edge not found. Set CHROME_BIN to record documentation GIFs.")


def file_url(path: Path, frame: int) -> str:
    normalized = path.resolve().as_posix()
    if os.name == "nt" and not normalized.startswith("/"):
        normalized = "/" + normalized
    return f"file://{quote(normalized, safe='/:')}?frame={frame}"


def screenshot(browser: str, page: Path, frame: int, output: Path, height: int) -> None:
    command = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=1",
        f"--window-size=1180,{height}",
        f"--screenshot={output}",
        file_url(page, frame),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def save_gif(frame_paths: list[Path], durations: list[int], output: Path) -> None:
    images = [Image.open(path).convert("RGB") for path in frame_paths]
    quantized = [image.quantize(colors=160, method=Image.Quantize.MEDIANCUT) for image in images]
    output.parent.mkdir(parents=True, exist_ok=True)
    quantized[0].save(
        output,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    for image in images:
        image.close()
    for image in quantized:
        image.close()


def main() -> int:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("npm is required to build the documentation demos")
    subprocess.run([npm, "run", "docs:build-demos"], cwd=ROOT, check=True)

    browser = find_browser()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mcp-probe-doc-demos-") as temp_name:
        temp_dir = Path(temp_name)
        for name, config in SCENARIOS.items():
            page = DEMOS_DIR / f"{name}.html"
            frame_paths: list[Path] = []
            for position, frame in enumerate(config["frames"]):
                output = temp_dir / f"{name}-{position:02d}.png"
                screenshot(browser, page, frame, output, int(config["height"]))
                frame_paths.append(output)
            gif_path = OUTPUT_DIR / f"{name}.gif"
            save_gif(frame_paths, list(config["duration"]), gif_path)
            print(f"[render-doc-demo-gifs] {gif_path.relative_to(ROOT)} ({gif_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[render-doc-demo-gifs] failed: {exc}", file=sys.stderr)
        raise
