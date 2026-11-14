"""Read one member out of a huge remote ZIP using HTTP range requests.

Zenodo serves the ESA WorldCereal archives as single ZIP files of 15 to 20 GB,
one GeoTIFF per agro-ecological zone. Khyber Pakhtunkhwa needs four of them, so
downloading a whole archive would waste nearly 20 GB. This module reads the ZIP
central directory with a few small range requests, then streams just the bytes
of the members we want and inflates them on the fly.

Zenodo does not advertise Accept-Ranges but does honour Range with 206.
"""
import io
import os
import struct
import zipfile
import zlib

import requests

CHUNK = 1 << 20


class HttpFile(io.RawIOBase):
    """A seekable read-only file over HTTP range requests."""

    def __init__(self, url, session=None):
        self.session = session or requests.Session()
        head = self.session.head(url, allow_redirects=True, timeout=60)
        head.raise_for_status()
        self.url = head.url
        self.size = int(head.headers["Content-Length"])
        self.pos = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        else:
            self.pos = self.size + offset
        return self.pos

    def readinto(self, buf):
        # io.BufferedReader talks to RawIOBase through readinto, not read
        data = self.read(len(buf))
        buf[:len(data)] = data
        return len(data)

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n <= 0 or self.pos >= self.size:
            return b""
        end = min(self.size, self.pos + n) - 1
        r = self.session.get(self.url, headers={"Range": f"bytes={self.pos}-{end}"}, timeout=180)
        r.raise_for_status()
        data = r.content
        self.pos += len(data)
        return data


def open_index(url, session=None):
    """Return (ZipFile, HttpFile). Reading the index costs a few KB."""
    fh = HttpFile(url, session)
    return zipfile.ZipFile(io.BufferedReader(fh, buffer_size=1 << 20)), fh


def _data_offset(fh, info):
    """Byte offset of a member's compressed data (past its local header)."""
    fh.seek(info.header_offset)
    head = fh.read(30)
    sig, _, _, _, _, _, _, _, _, name_len, extra_len = struct.unpack("<IHHHHHIIIHH", head)
    if sig != 0x04034B50:
        raise ValueError("not a local file header")
    return info.header_offset + 30 + name_len + extra_len


def extract_member(url, info, out_path, fh=None, session=None, progress=None):
    """Stream one member to out_path, inflating as it goes. One HTTP request."""
    fh = fh or HttpFile(url, session)
    start = _data_offset(fh, info)
    end = start + info.compress_size - 1
    sess = fh.session
    if info.compress_type == zipfile.ZIP_DEFLATED:
        dec = zlib.decompressobj(-zlib.MAX_WBITS)
    elif info.compress_type == zipfile.ZIP_STORED:
        dec = None
    else:
        raise ValueError(f"unsupported compression {info.compress_type}")

    tmp = out_path + ".part"
    done = 0
    with sess.get(fh.url, headers={"Range": f"bytes={start}-{end}"}, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(tmp, "wb") as out:
            for chunk in r.iter_content(CHUNK):
                if not chunk:
                    continue
                done += len(chunk)
                out.write(dec.decompress(chunk) if dec else chunk)
                if progress:
                    progress(done, info.compress_size)
            if dec:
                out.write(dec.flush())
    os.replace(tmp, out_path)
    return out_path
