"""Mağaza görsellerini headless Chrome ile üretir: python store/render.py

Çıktılar dist/magaza-gorselleri/ altına, mağazanın istediği gibi alfa kanalsız 24 bit PNG olarak yazılır.
"""
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "store"
OUT = ROOT / "dist" / "magaza-gorselleri"
CHROME = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe"

SCENES = [
    ("shot-1.html", "ekran-1-siradaki-ezan.png", 1280, 800),
    ("shot-2.html", "ekran-2-yumusak-gecis.png", 1280, 800),
    ("shot-3.html", "ekran-3-ayarlar.png", 1280, 800),
    ("promo-small.html", "kucuk-tanitim-440x280.png", 440, 280),
    ("promo-marquee.html", "kayan-tanitim-1400x560.png", 1400, 560),
]


def render(src, dest, width, height):
    with tempfile.TemporaryDirectory() as profile:
        raw = Path(profile) / "raw.png"
        subprocess.run(
            [
                str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--allow-file-access-from-files", f"--user-data-dir={profile}",
                "--force-device-scale-factor=1", f"--window-size={width},{height}",
                "--virtual-time-budget=3000", f"--screenshot={raw}", (STORE / src).as_uri(),
            ],
            check=True, capture_output=True, timeout=60,
        )
        img = Image.open(raw)
        if img.size != (width, height):
            raise SystemExit(f"{src}: beklenen {width}x{height}, gelen {img.size}")
        img.convert("RGB").save(OUT / dest)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for src, dest, w, h in SCENES:
        render(src, dest, w, h)
        print(f"{dest}: {w}x{h}")
