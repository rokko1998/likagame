#!/usr/bin/env python3
"""Remove a baked LIGHT checker/white backdrop without deleting white object parts.

Requires Pillow and numpy. No model, network, or paid API. Never overwrites input.
The outer-connected neutral backdrop is removed; enclosed bright details stay.
Use --seed X,Y for an enclosed background hole, --keep X,Y,W,H for a protected part.
This is a controlled matte for light neutral backdrops, not universal segmentation.
"""
import argparse
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def matte(im, floor=210, chroma=32, seeds=(), keeps=(), feather=0.5, min_area=64):
    rgb = np.asarray(im.convert('RGB')).copy()
    lo, hi = rgb.min(2), rgb.max(2)
    candidate = (lo >= floor) & ((hi.astype(int) - lo.astype(int)) <= chroma)
    for x,y,w,h in keeps:
        candidate[max(0,y):y+h, max(0,x):x+w] = False
    # Padding connects every outer edge, including disconnected corners.
    padded = np.pad(candidate.astype(np.uint8)*255, 1, constant_values=255)
    flood = Image.fromarray(padded).copy()  # floodfill needs a writable pixel buffer
    ImageDraw.floodfill(flood, (0,0), 128)
    for x,y in seeds:
        if 0 <= x < im.width and 0 <= y < im.height and candidate[y,x]:
            ImageDraw.floodfill(flood, (x+1,y+1), 128)
    exterior = np.asarray(flood)[1:-1,1:-1] == 128
    fraction = float(exterior.mean())
    if fraction < 0.01 or fraction > 0.995:
        raise ValueError(f'Implausible background area {fraction:.1%}; inspect and adjust floor/chroma/keep regions.')
    silhouette = Image.fromarray((~exterior).astype(np.uint8)*255)
    # Ignore isolated generation dust. Meaningful disconnected components remain.
    work = silhouette.copy()
    removed_dust = 0
    while min_area > 0 and work.getbbox():
        pixels = np.asarray(work)
        ys,xs = np.nonzero(pixels)
        before = pixels.copy()
        ImageDraw.floodfill(work,(int(xs[0]),int(ys[0])),0)
        component = (before > 0) & (np.asarray(work) == 0)
        area = int(component.sum())
        if area < min_area:
            current = np.asarray(silhouette).copy()
            current[component] = 0
            silhouette = Image.fromarray(current)
            removed_dust += area
    alpha = np.asarray(silhouette.filter(ImageFilter.GaussianBlur(feather))).copy()
    # A neutral background's mixed edge pixels cause white fringes. Extend the
    # nearest stable interior colors into the subpixel matte instead of keeping
    # the checked backdrop's RGB in partially visible pixels.
    core = np.asarray(silhouette.filter(ImageFilter.MinFilter(3))) > 250
    colors = rgb.astype(np.float32)
    known = core.copy()
    band = (alpha > 0) & ~known
    for _ in range(5):
        if not band.any():
            break
        weighted = np.zeros_like(colors)
        counts = np.zeros(known.shape, np.float32)
        for dy,dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            k = np.roll(known,(dy,dx),(0,1))
            if dy == -1: k[-1,:] = False
            if dy == 1: k[0,:] = False
            if dx == -1: k[:,-1] = False
            if dx == 1: k[:,0] = False
            weighted += np.roll(colors,(dy,dx),(0,1))*k[...,None]
            counts += k
        fill = band & (counts > 0)
        colors[fill] = weighted[fill] / counts[fill,None]
        known |= fill
        band &= ~fill
    colors = np.clip(colors,0,255).astype(np.uint8)
    colors[alpha == 0] = 0
    result = Image.fromarray(np.dstack((colors,alpha)), 'RGBA')
    return result, {'method':'outer-connected neutral backdrop + seeded holes + edge color extension',
                    'floor':floor,'chroma':chroma,'feather':feather,'seeds':seeds,'protectedRects':keeps,
                    'minComponentArea':min_area,'removedDustPixels':removed_dust,
                    'removedPercent':round(fraction*100,2),'visibleBBox':result.getchannel('A').getbbox()}


def preview(im, path):
    target = im.copy()
    target.thumbnail((650,650))
    w,h = target.size
    sheet = Image.new('RGB',(w*2,h),(245,245,242))
    sheet.paste((13,22,39),(w,0,w*2,h))
    sheet.paste(target,(0,0),target)
    sheet.paste(target,(w,0),target)
    sheet.save(path)


def nums(s):
    return tuple(map(int,s.split(',')))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path)
    p.add_argument('output',type=Path)
    p.add_argument('--floor',type=int,default=210,help='minimum background channel; lower removes darker grey')
    p.add_argument('--chroma',type=int,default=32,help='maximum RGB channel spread for neutral background')
    p.add_argument('--feather',type=float,default=.5)
    p.add_argument('--min-area',type=int,default=64,help='remove isolated foreground specks smaller than this; 0 disables')
    p.add_argument('--seed',action='append',type=nums,default=[],help='X,Y enclosed background hole')
    p.add_argument('--keep',action='append',type=nums,default=[],help='X,Y,W,H protected white object detail')
    p.add_argument('--preview',type=Path,help='save light/dark QA image')
    p.add_argument('--rematte',action='store_true',help='explicitly process an existing alpha image')
    p.add_argument('--force',action='store_true',help='overwrite output, never source')
    args=p.parse_args()
    if args.source.resolve() == args.output.resolve():
        p.error('Source and output must be different files.')
    if args.output.suffix.lower() != '.png':
        p.error('Output must be .png')
    if args.output.exists() and not args.force:
        p.error('Output exists; use --force to replace that output.')
    im=Image.open(args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    if 'A' in im.getbands() and im.getchannel('A').getextrema()[0] == 0 and not args.rematte:
        shutil.copy2(args.source,args.output)
        result=im.convert('RGBA')
        info={'method':'preserved native PNG alpha; bytes copied unchanged'}
    else:
        result,info=matte(im,args.floor,args.chroma,args.seed,args.keep,args.feather,args.min_area)
        result.save(args.output,optimize=True)
    info.update(source=str(args.source),output=str(args.output),size=list(result.size),
                alphaRange=list(result.getchannel('A').getextrema()))
    args.output.with_suffix('.matte.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
    if args.preview:
        args.preview.parent.mkdir(parents=True,exist_ok=True)
        preview(result,args.preview)
    print(json.dumps(info,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
