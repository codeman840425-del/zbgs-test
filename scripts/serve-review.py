"""Local evidence server with byte ranges so recorded videos can seek."""
import argparse,re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def send_head(self):
        self.remaining=None
        path=Path(self.translate_path(self.path))
        if not path.is_file(): return super().send_head()
        stream=path.open('rb');size=path.stat().st_size;start=0;end=size-1
        header=self.headers.get('Range');status=200
        if header:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',header.strip())
            if not match or not any(match.groups()):
                stream.close();self.send_error(416);return None
            left,right=match.groups()
            if left:
                start=int(left);end=min(int(right),size-1) if right else size-1
            else: start=max(0,size-int(right))
            if start>end or start>=size:
                stream.close();self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return None
            status=206
        self.send_response(status)
        self.send_header('Content-Type',self.guess_type(str(path)))
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(end-start+1))
        self.send_header('Last-Modified',self.date_time_string(path.stat().st_mtime))
        if status==206: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers();stream.seek(start);self.remaining=end-start+1;return stream
    def copyfile(self,source,outputfile):
        if self.remaining is None: return super().copyfile(source,outputfile)
        try:
            while self.remaining:
                chunk=source.read(min(65536,self.remaining))
                if not chunk: break
                outputfile.write(chunk);self.remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError): pass

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4174);args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    factory=lambda *a,**kw:Handler(*a,directory=str(root),**kw)
    print(f'Review: http://127.0.0.1:{args.port}/output/review/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),factory).serve_forever()
