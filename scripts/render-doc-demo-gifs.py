from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "docs" / "demos"
OUTPUT_DIR = ROOT / "docs" / "assets" / "demos"

SCENARIOS = {
    "feature-workbench": {
        "frames": [0, 1, 2, 3, 4, 3, 2, 1],
        "duration": [1100, 1100, 1100, 1100, 1800, 700, 700, 700],
        "desktop_height": 720,
        "mobile_height": 700,
    },
    "memory-center": {
        "frames": [0, 1, 2, 1],
        "duration": [1400, 1500, 1800, 900],
        "desktop_height": 720,
        "mobile_height": 760,
    },
    "convergence-gate": {
        "frames": [0, 1, 2, 2, 1],
        "duration": [1500, 1400, 2200, 700, 700],
        "desktop_height": 560,
        "mobile_height": 650,
    },
}

VIEWPORTS = {
    "desktop": {"width": 1180, "suffix": "", "height_key": "desktop_height"},
    "mobile": {"width": 390, "suffix": "-mobile", "height_key": "mobile_height"},
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


def screenshot(browser: str, page: Path, frame: int, output: Path, width: int, height: int) -> None:
    command = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=1",
        f"--window-size={width},{height}",
        f"--screenshot={output}",
        file_url(page, frame),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def content_bbox(image: Image.Image, tolerance: int = 8) -> tuple[int, int, int, int] | None:
    """Return the non-background bounds using the top-left pixel as page background."""
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    difference = ImageChops.difference(rgb, background).convert("L")
    mask = difference.point(lambda value: 255 if value > tolerance else 0)
    return mask.getbbox()


def crop_to_content(images: list[Image.Image]) -> tuple[list[Image.Image], tuple[int, int, int, int]]:
    boxes = [box for image in images if (box := content_bbox(image)) is not None]
    if not boxes:
        full = (0, 0, images[0].width, images[0].height)
        return [image.copy() for image in images], full

    left = min(box[0] for box in boxes)
    top = min(box[1] for box in boxes)
    right = max(box[2] for box in boxes)
    bottom = max(box[3] for box in boxes)

    # Keep a deliberate breathing space around the UI, but remove recording-canvas waste.
    horizontal_padding = 20
    top_padding = 10
    bottom_padding = 18
    crop_box = (
        max(0, left - horizontal_padding),
        max(0, top - top_padding),
        min(images[0].width, right + horizontal_padding),
        min(images[0].height, bottom + bottom_padding),
    )
    return [image.crop(crop_box) for image in images], crop_box


def save_gif(frame_paths: list[Path], durations: list[int], output: Path) -> tuple[int, int, tuple[int, int, int, int]]:
    images = [Image.open(path).convert("RGB") for path in frame_paths]
    cropped, crop_box = crop_to_content(images)
    quantized = [image.quantize(colors=160, method=Image.Quantize.MEDIANCUT) for image in cropped]
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
    width, height = cropped[0].size
    for image in images:
        image.close()
    for image in cropped:
        image.close()
    for image in quantized:
        image.close()
    return width, height, crop_box


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
            for viewport_name, viewport in VIEWPORTS.items():
                frame_paths: list[Path] = []
                viewport_width = int(viewport["width"])
                viewport_height = int(config[str(viewport["height_key"])])
                for position, frame in enumerate(config["frames"]):
                    output = temp_dir / f"{name}-{viewport_name}-{position:02d}.png"
                    screenshot(browser, page, frame, output, viewport_width, viewport_height)
                    frame_paths.append(output)
                gif_path = OUTPUT_DIR / f"{name}{viewport['suffix']}.gif"
                width, height, crop_box = save_gif(frame_paths, list(config["duration"]), gif_path)
                print(
                    f"[render-doc-demo-gifs] {gif_path.relative_to(ROOT)} "
                    f"({gif_path.stat().st_size} bytes, {width}x{height}, crop={crop_box})"
                )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[render-doc-demo-gifs] failed: {exc}", file=sys.stderr)
        raise
