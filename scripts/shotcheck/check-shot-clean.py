#!/usr/bin/env python3
"""
Refuses a store screenshot that has an ad banner in it.

A Debug build serves Google's test creative, which renders a literal "Test
mode" badge over a third party's advert. Both are disqualifying in an App Store
screenshot: the guidelines require the screenshot to show the app, and a debug
marker is about as clear a tell as exists.

Detection is by brightness, not by reading the text: these apps are dark-themed
and the test banner is a white 320x50 strip pinned to the bottom. A bottom band
that is far brighter than the rest of the frame is a banner. That also catches a
REAL ad, which matters -- a live creative in a screenshot is someone else's
artwork in our listing.
"""
import sys, zlib, struct

def rows(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', "not a png"
    pos, idat, w, h, bd, ct = 8, b'', 0, 0, 0, 0
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        body = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', body[:10])
        elif typ == b'IDAT':
            idat += body
        pos += 12 + ln
    chans = {0:1, 2:3, 4:2, 6:4}[ct]
    raw = zlib.decompress(idat)
    stride = w * chans
    out, prev = [], bytearray(stride)
    p = 0
    for _ in range(h):
        f = raw[p]; line = bytearray(raw[p+1:p+1+stride]); p += 1 + stride
        for i in range(stride):
            a = line[i-chans] if i >= chans else 0
            b = prev[i]
            c = prev[i-chans] if i >= chans else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a+b)//2) & 255
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out.append(bytes(line)); prev = line
    return out, w, h, chans

def mean_luma(rows_, w, chans, y0, y1):
    tot = n = 0
    for y in range(y0, y1):
        r = rows_[y]
        for x in range(0, w, 8):
            i = x * chans
            tot += (r[i] + r[i+1] + r[i+2]) / 3
            n += 1
    return tot / max(n, 1)


def mean_sat(rows_, w, chans, y0, y1):
    """Mean HSV saturation, 0-255.

    Luma alone is not enough and it let a red advert through: red contributes
    only 0.299 to luma, so a vivid creative scores dark, and a colourful game
    board raises the body it is compared against until the ratio collapses.

    These apps are near-greyscale by design -- one accent on a dark ground --
    while an advert is a photograph or a brand colour spanning the full width.
    Saturation separates those by an order of magnitude where luma separates
    them by a fifth.
    """
    tot = n = 0
    for y in range(y0, y1):
        r = rows_[y]
        for x in range(0, w, 8):
            i = x * chans
            hi = max(r[i], r[i+1], r[i+2])
            lo = min(r[i], r[i+1], r[i+2])
            # Saturation is meaningless in near-black: (hi-lo)*255/hi explodes
            # when hi is tiny, so a black band with one stray channel reads as
            # a vivid advert. It scored 147 on a torch app whose bottom half is
            # literally black, and discarded every frame of a clean capture.
            if hi < 40:
                continue
            tot += (hi - lo) * 255 // hi
            n += 1
    # No bright pixels at all means nothing is there to be an advert.
    return tot / n if n else 0.0

def main():
    bad = []
    for path in sys.argv[1:]:
        rs, w, h, ch = rows(path)
        band = mean_luma(rs, w, ch, int(h*0.93), h-2)
        body = mean_luma(rs, w, ch, int(h*0.25), int(h*0.80))
        bsat = mean_sat(rs, w, ch, int(h*0.93), h-2)
        # Compare the band's saturation to the BODY's, not to a constant.
        #
        # The docstring above says "these apps are near-greyscale by design",
        # and the check never verified it. knotter's palette is pink: its level
        # grid scored bsat=105 with band=33.5 against body=31.3 -- no bright
        # band at all, just the app's own accent colour at the bottom of the
        # screen -- and a clean frame was discarded as an advert.
        #
        # A saturated band on a greyscale app is an advert. A saturated band on
        # a saturated app is the app.
        body_sat = mean_sat(rs, w, ch, int(h*0.25), int(h*0.80))
        bright = band > body + 60
        colour = bsat > 30 and bsat > body_sat + 25
        flag = bright or colour
        why = 'bright' if bright else ('colour' if colour else '')
        print(f"{'BANNER' if flag else 'clean '}  band={band:6.1f} body={body:6.1f} "
              f"sat={bsat:5.1f}/{body_sat:5.1f} {why:6} {path.split('/')[-1]}")
        if flag: bad.append(path)
    if bad:
        print(f"\n{len(bad)} contaminated")
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
