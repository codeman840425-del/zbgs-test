"""Read the exact socks source and its optional additive publication."""
import hashlib
import importlib.util


def producer(root):
    path = root/'scripts/m2-socks-layer-v1/publish.py'
    spec = importlib.util.spec_from_file_location('socks_publisher', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_socks(v, ident, require, GLB):
    v.pin(ident['manifest'], ident['manifestSha256'])
    module = producer(v.root)
    plan, before, summary = module.create_plan(v.root, v)
    published = (v.root/module.OUTPUT).exists()
    if published:
        for path, data in plan.items():
            v.pin(path, hashlib.sha256(data).hexdigest(), len(data))
    summary.update({'publishedBytesMatchSource': published, 'scope': 'Exact stored source/skin QA and optional additive publication. No runtime or visual acceptance.'})
    return summary
