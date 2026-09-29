"""Build every icon the app needs from the two source paintings.

    python icons/make_icons.py

Sources, both drawn for the purpose:
    source.webp        rounded corners, transparent outside them - the icon as it should
                       look wherever it is shown as-is
    source-full.webp   the same painting full-bleed, square to the edges - for anywhere that
                       cuts the icon into its own shape

Outputs, beside them:
    icon-192.png, icon-512.png          purpose "any"      <- source.webp
    favicon-48.png                      the browser tab    <- source.webp
    maskable-192.png, maskable-512.png  purpose "maskable" <- source-full.webp
    apple-touch-icon.png                180px              <- source-full.webp

Why two sources. An Android launcher cuts a maskable icon into ITS shape - a squircle on
Samsung, a circle on Pixel - so that icon has to fill the whole square; iOS does the same and
fills any transparency with black. Growing the rounded painting's corners out by code was
tried and looked wrong (a ghost of the old corners, streaks in the sky), so the full-bleed
painting was drawn instead, and every size here is a plain downscale of a painted original.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def shrink(src, n, out):
    src.resize((n, n), Image.LANCZOS).save(os.path.join(HERE, out), optimize=True)


def main():
    rounded = Image.open(os.path.join(HERE, "source.webp")).convert("RGBA")
    full = Image.open(os.path.join(HERE, "source-full.webp")).convert("RGB")
    for n in (512, 192):
        shrink(rounded, n, "icon-%d.png" % n)
        shrink(full, n, "maskable-%d.png" % n)
    shrink(rounded, 48, "favicon-48.png")
    shrink(full, 180, "apple-touch-icon.png")
    print("icons written to", HERE)


if __name__ == "__main__":
    main()
