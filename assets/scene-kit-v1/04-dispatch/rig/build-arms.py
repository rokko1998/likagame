#!/usr/bin/env python3
"""Reproduce the six arm PNGs, rig metadata and pose QA from untouched source PNGs.

Only local masking/cropping is used. Complementary alpha preserves the exact
neutral pose under source-over composition while providing overlap at joints.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
SOURCE = OUT.parent
CONFIGS = [
    {"side": "near", "shoulder": [1235, 290], "elbow": [1030, 450],
     "wrist": [600, 720], "overlap": 112},
    {"side": "far", "shoulder": [1190, 270], "elbow": [1048, 420],
     "wrist": [470, 780], "overlap": 112},
]


def ramp_for_joint(shape, pivot, direction, overlap):
    yy, xx = np.mgrid[:shape[0], :shape[1]]
    v = np.array(direction, dtype=np.float64)
    v /= np.linalg.norm(v)
    d = (xx - pivot[0]) * v[0] + (yy - pivot[1]) * v[1]
    t = np.clip((d + overlap / 2) / overlap, 0, 1)
    return t * t * (3 - 2 * t)


def residual_alpha(total, front):
    """Return a back alpha whose source-over with front rounds to total."""
    den = 255.0 - front
    return np.rint(np.divide((total - front) * 255, den,
                           out=np.zeros_like(total), where=den > 0))


def rotation(pivot, degrees):
    # Positive angles rotate clockwise in the source image coordinate system.
    t = math.radians(degrees)
    c, s = math.cos(t), math.sin(t)
    x, y = pivot
    return np.array([[c, -s, x - c*x + s*y],
                     [s, c, y - s*x - c*y], [0, 0, 1]], dtype=float)


def render_pose(parts, config, angles, size=(1850, 1400), offset=(110, 170)):
    mats = []
    current = np.eye(3)
    for p, angle in zip(parts, angles):
        current = current @ rotation(p["pivotSource"], angle)
        mats.append(current.copy())
    base = Image.new("RGBA", size)
    shift = np.array([[1, 0, offset[0]], [0, 1, offset[1]], [0, 0, 1]], dtype=float)
    for part, matrix in zip(parts, mats):
        crop = part["sourceCrop"]
        from_local = np.array([[1, 0, crop[0]], [0, 1, crop[1]], [0, 0, 1]], dtype=float)
        inverse = np.linalg.inv(shift @ matrix @ from_local)
        sprite = Image.open(OUT / part["file"])
        transformed = sprite.transform(size, Image.Transform.AFFINE,
                                       tuple(inverse[:2].reshape(-1)),
                                       resample=Image.Resampling.BICUBIC)
        base = Image.alpha_composite(base, transformed)
    return base


def add_checker(im, light=False):
    color = (237, 241, 244, 255) if light else (9, 18, 32, 255)
    back = Image.new("RGBA", im.size, color)
    return Image.alpha_composite(back, im).convert("RGB")


all_parts, reports, groups, pose_panels = [], [], [], []
for cfg in CONFIGS:
    side = cfg["side"]
    source_name = f"pik-arm-{side}.png"
    src = Image.open(SOURCE / source_name).convert("RGBA")
    raw = np.asarray(src).copy()
    alpha = raw[:, :, 3].astype(np.float64)
    elbow_dir = np.array(cfg["elbow"]) - np.array(cfg["shoulder"])
    wrist_dir = np.array(cfg["wrist"]) - np.array(cfg["elbow"])
    w_hand = ramp_for_joint(alpha.shape, cfg["wrist"], wrist_dir, cfg["overlap"])
    w_fore = ramp_for_joint(alpha.shape, cfg["elbow"], elbow_dir, cfg["overlap"])
    a_hand = np.rint(alpha * w_hand)
    remain = residual_alpha(alpha, a_hand)
    a_fore = np.rint(remain * w_fore)
    a_shoulder = residual_alpha(remain, a_fore)
    spec = [("shoulder", cfg["shoulder"], a_shoulder, [-30, 30]),
            ("forearm", cfg["elbow"], a_fore, [-20, 20]),
            ("hand", cfg["wrist"], a_hand, [-20, 20])]
    parts = []
    neutral = Image.new("RGBA", src.size)
    for z, (name, pivot, part_alpha, limits) in enumerate(spec):
        pixels = raw.copy()
        pixels[:, :, 3] = part_alpha.astype(np.uint8)
        pixels[pixels[:, :, 3] == 0, :3] = 0
        piece = Image.fromarray(pixels)
        bx = piece.getbbox()
        # Keep a transparent safety margin, including pivots where outside the art.
        x0 = max(0, min(bx[0], pivot[0]) - 8)
        y0 = max(0, min(bx[1], pivot[1]) - 8)
        x1 = min(src.width, max(bx[2], pivot[0]+1) + 8)
        y1 = min(src.height, max(bx[3], pivot[1]+1) + 8)
        filename = f"pik-arm-{side}-{name}.png"
        piece.crop((x0, y0, x1, y1)).save(OUT / filename)
        parent = f"pik-arm-{side}-{spec[z-1][0]}" if z else "pik-body"
        record = {"id": f"pik-arm-{side}-{name}", "file": filename,
                  "parent": parent, "pivotSource": pivot,
                  "pivotLocal": [pivot[0]-x0, pivot[1]-y0],
                  "sourceCrop": [x0, y0, x1-x0, y1-y0],
                  "sourceCanvas": list(src.size), "source": "../"+source_name,
                  "rotationLimits": limits, "rotationUnit": "degreesClockwise",
                  "z": z, "overlapPixels": cfg["overlap"],
                  "initialRotation": 0}
        parts.append(record)
        neutral = Image.alpha_composite(neutral, piece)
    orig, result = np.asarray(src), np.asarray(neutral)
    delta = np.abs(orig.astype(np.int16)-result.astype(np.int16))
    visible = orig[:, :, 3] > 0
    report = {"side": side, "sourceCanvas": list(src.size),
              "neutralAlphaMaxError": int(delta[:, :, 3].max()),
              "neutralVisibleRgbMaxError": int(delta[:, :, :3][visible].max()),
              "neutralVisiblePixelsChanged": int(np.count_nonzero(np.any(delta[visible] != 0, axis=1))),
              "transparentPixelRgbIgnored": True,
              "transparentPixelsByPart": {p["id"]: int(np.count_nonzero(
                  np.asarray(Image.open(OUT/p["file"]))[:, :, 3] == 0)) for p in parts}}
    reports.append(report)
    neutral.save(OUT / f"qa-{side}-neutral-transparent.png")
    # Two bent poses: opposite signed elbow and wrist angles, plus neutral.
    panels = []
    for label, angles in [("Neutral 0 / 0 / 0", (0,0,0)),
                          ("Elbow +20 / Wrist -20", (0,20,-20)),
                          ("Elbow -20 / Wrist +20", (0,-20,20))]:
        pose = render_pose(parts, cfg, angles)
        for light in [False, True]:
            panel = add_checker(pose, light).resize((740,560), Image.Resampling.LANCZOS)
            d = ImageDraw.Draw(panel)
            d.text((18,18), f"{side.upper()} | {label}", fill=(20,30,40) if light else (224,234,245))
            panels.append(panel)
    # Dark row then light row; independently reveal alpha halo and joint openings.
    sheet = Image.new("RGB", (2220,1120))
    for i, panel in enumerate(panels):
        column, row = i//2, i%2
        sheet.paste(panel, (column*740, row*560))
    sheet.save(OUT / f"qa-{side}-poses.png")
    pose_panels.append(sheet)
    groups.append({"id": f"pik-arm-{side}", "source": "../"+source_name,
                   "sourceCanvas": list(src.size), "parts": [p["id"] for p in parts],
                   "rootPivotSource": cfg["shoulder"],
                   "neutralAssembly": "Place each crop at sourceCrop.xy; source-over in ascending z.",
                   "poseComposition": "parentMatrix @ rotateAround(pivotSource, angle); do not rotate each part independently in world space."})
    all_parts.extend(parts)

document = {"version": 1, "coordinateSystem": "source pixels; +x right, +y down",
            "sourceCanvas": [1536,1024], "parts": all_parts, "arms": groups,
            "alphaMethod": "Complementary source-over masks with 112 px smooth overlap. Original RGB remains unchanged; alpha split is reversible in the neutral pose.",
            "limits": "Cutout 2D rig from the supplied pose; moderate motion within the listed limits. Hidden rear surfaces are not fabricated.",
            "verification": "qa-report.json and qa-near-poses.png / qa-far-poses.png"}
(OUT / "rig-arms.json").write_text(json.dumps(document, ensure_ascii=False, indent=2)+"\n")
(OUT / "qa-report.json").write_text(json.dumps({"arms": reports}, indent=2)+"\n")
print(json.dumps(reports, indent=2))
