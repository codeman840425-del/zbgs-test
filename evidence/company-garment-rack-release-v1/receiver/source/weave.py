# Original woven chevron print. Running this file recreates the PNG beside it.
import binascii
import struct
import zlib
from pathlib import Path

w,h=64,96
rows=bytearray()
for y in range(h):
    rows.append(0)
    for x in range(w):
        ridge=(y+abs(x%32-16))%24
        color=(226,174,105) if ridge<3 else (234,218,184) if ridge<8 else (61,104,111) if ridge<11 else (34,63,74)
        weave=3 if (x+y)%2==0 else -3
        rows.extend(v+weave for v in color)
def chunk(tag,data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',binascii.crc32(tag+data)&0xffffffff)
payload=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')
Path(__file__).with_name('chevron-weave.png').write_bytes(payload)
