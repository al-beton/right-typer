"""Private, versioned recording library. Python 3.9+, standard library only."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
FINGERS = {h + '-' + f for h in ('left', 'right') for f in ('thumb', 'index', 'middle', 'ring', 'little')}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def slug(value):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value), 'Unsafe identifier')
    return value


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(path.read_text())


def lines(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []


def write(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def private_root(path):
    root = Path(path).expanduser().resolve()
    require(not any((p / '.git').exists() for p in [root, *root.parents]), 'Keep private data outside Git checkouts')
    return root


@contextmanager
def locked(root):
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def init(root):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    with locked(root):
        require(not (root / 'library.json').exists(), 'Library already exists')
        for name in ('archives', 'recordings', 'annotations', 'snapshots', 'imports', 'derived'):
            (root / name).mkdir(exist_ok=True)
        write(root / 'library.json', {'schemaVersion': 1, 'recordings': []})


def catalog(root):
    value = read(root / 'library.json')
    require(value['schemaVersion'] == 1, 'Unsupported library version')
    return value


def extract(archive, destination):
    """Never follow tar links or allow unlisted/duplicate paths."""
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        seen = set()
        require(len(members) <= 200000, 'Too many archive entries')
        require(sum(m.size for m in members) <= 8 * 1024**3, 'Archive too large')
        for member in members:
            parts = PurePosixPath(member.name).parts
            require(member.isfile() and parts and not member.name.startswith('/') and
                    '..' not in parts and '\\' not in member.name and member.name not in seen,
                    'Unsafe or duplicate archive entry')
            seen.add(member.name)
            target = destination / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output)
    manifest = read(destination / 'manifest.json')
    require(seen == {'manifest.json', *manifest['files']}, 'Unlisted or missing archive file')
    for name, entry in manifest['files'].items():
        target = destination / name
        require(target.stat().st_size == entry['bytes'] and digest(target) == entry['sha256'], 'Recording checksum mismatch: ' + name)
    return manifest


def import_recording(root, archive, participant, setup, split):
    slug(participant)
    slug(setup)
    require(split in ('development', 'validation', 'test'), 'Invalid split')
    archive = Path(archive).resolve()
    with locked(root):
        data = catalog(root)
        sha = digest(archive)
        for row in data['recordings']:
            require(row['participantId'] != participant or row['split'] == split,
                    'Participant cannot occur in more than one split')
            if row['sha256'] == sha:
                require((row['participantId'], row['setupId'], row['split']) == (participant, setup, split), 'Duplicate archive has different metadata')
                return row
        with tempfile.TemporaryDirectory(dir=root) as temporary:
            stage = Path(temporary)
            copied = stage / 'source.tar'
            shutil.copyfile(archive, copied)
            require(digest(copied) == sha, 'Source changed while copying')
            extracted = stage / 'recording'
            extracted.mkdir()
            manifest = extract(copied, extracted)
            sid = slug(manifest['sessionId'])
            require(not any(r['sessionId'] == sid for r in data['recordings']), 'Session ID already has a different archive')
            # Existing application validator checks events, frames, timestamps and calibration.
            result = subprocess.run(['node', str(HERE.parent.parent / '.sample-cli/sample.mjs'), str(copied)], capture_output=True, text=True)
            require(result.returncode in (0, 1) and result.stdout.startswith('{'), 'Sample validation failed: ' + result.stderr[-1000:])
            report = json.loads(result.stdout)
            require(report['sessionId'] == sid and 'groundTruth' in report, 'Invalid sample validation report')
            row = {'sessionId': sid, 'participantId': participant, 'setupId': setup, 'split': split,
                   'sourceParticipantId': manifest['participantId'], 'sourceSetupId': manifest['setupId'],
                   'sha256': sha, 'archive': 'archives/' + sha + '.tar', 'path': 'recordings/' + sid,
                   'use': 'evaluation-only'}
            # Uncatalogued files after a crash can be safely replaced by the same validated archive.
            destination = root / row['path']
            if destination.exists():
                shutil.rmtree(destination)
            extracted.replace(destination)
            copied.replace(root / row['archive'])
            data['recordings'].append(row)
            write(root / 'library.json', data)
            return row


def cases(root):
    result = []
    for record in catalog(root)['recordings']:
        directory = root / record['path']
        manifest = read(directory / 'manifest.json')
        calibration = read(directory / 'calibration.json')
        frames = sorted(lines(directory / 'frames.jsonl'), key=lambda frame: frame['at'])
        for event in lines(directory / 'events.jsonl'):
            if event['type'] != 'evidence' or event['event']['type'] != 'request':
                continue
            press = event['event']['press']
            code = press.get('code', press['key'])
            points = calibration['points']
            point = points.get(code)
            if press['key'] == ' ' and 'space-left' in points and 'space-right' in points:
                point = {axis: (points['space-left'][axis] + points['space-right'][axis]) / 2 for axis in ('x', 'y')}
            selected = [{'id': f['id'], 'at': f['at'], 'url': '/media/' + record['sessionId'] + '/' + f['file'], 'file': f['file']} for f in frames if abs(f['at'] - press['at']) <= 650]
            result.append({'id': record['sessionId'] + '/' + str(press['attemptId']) + '/' + str(press['id']),
                           'sessionId': record['sessionId'], 'attemptId': press['attemptId'], 'pressId': press['id'],
                           'atMs': press['at'], 'key': press['key'], 'code': code, 'frames': selected,
                           'keyPoint': point, 'camera': manifest['camera']})
    require(len({c['id'] for c in result}) == len(result), 'Duplicate press identity')
    return result


def votes(root, reviewer):
    return lines(root / 'annotations' / (slug(reviewer) + '.jsonl'))


def latest(root, reviewer):
    return {v['id']: v for v in votes(root, reviewer)}


def append_vote(root, reviewer, case, finger, source, original=None):
    require(finger is None or finger in FINGERS, 'Invalid finger')
    row = {key: case[key] for key in ('id', 'sessionId', 'attemptId', 'pressId', 'atMs')}
    row.update(schemaVersion=1, finger=finger, status='unlabelable' if finger is None else 'human-labelled',
               reviewer=slug(reviewer), source=source, savedAt=datetime.now(timezone.utc).isoformat())
    if original is not None:
        row['original'] = original
    with (root / 'annotations' / (reviewer + '.jsonl')).open('a') as stream:
        stream.write(json.dumps(row) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    return row


def import_labels(root, path, reviewer):
    """Explicit migration of human answers; raw input retained, never import predictions."""
    slug(reviewer)
    with locked(root):
        sha = digest(Path(path))
        imported = root / 'imports' / (reviewer + '-' + sha + '.json')
        if imported.exists():
            return
        current = latest(root, reviewer)
        lookup = {(c['sessionId'], c['attemptId'], c['pressId']): c for c in cases(root)}
        source = read(Path(path))
        pending = []
        for old in source.values():
            case = lookup.get((old['sessionId'], old['attemptId'], old['pressId']))
            require(case is not None and abs(case['atMs'] - old['atMs']) < .01, 'Label does not match source press')
            require(old['finger'] is None or old['finger'] in FINGERS, 'Invalid finger')
            if case['id'] in current:
                require(current[case['id']]['finger'] == old['finger'], 'Migration would replace an existing answer; use review to edit')
            else:
                pending.append((case, old))
        for case, old in pending:
            append_vote(root, reviewer, case, old['finger'], 'human-label migration:' + sha, old)
        shutil.copyfile(path, imported)


def freeze(root, name, reviewer, exclude=None):
    """Explicit curator promotion; uncertain/pending cases stay out of confirmed truth."""
    slug(name)
    slug(reviewer)
    with locked(root):
        destination = root / 'snapshots' / name
        require(not destination.exists(), 'Snapshot already exists; choose a new version')
        source = latest(root, reviewer)
        excluded = set(exclude or [])
        all_cases = cases(root)
        require(excluded <= {c['id'] for c in all_cases}, 'Unknown excluded case')
        with tempfile.TemporaryDirectory(dir=root / 'snapshots') as temporary:
            stage = Path(temporary)
            index = []
            for record in catalog(root)['recordings']:
                labels = []
                for case in [c for c in all_cases if c['sessionId'] == record['sessionId']]:
                    vote = source.get(case['id'])
                    status = 'unreviewed' if not vote or case['id'] in excluded else 'unlabelable' if vote['finger'] is None else 'confirmed'
                    label = {'attemptId': case['attemptId'], 'pressId': case['pressId'], 'status': status,
                             'finger': vote['finger'] if status == 'confirmed' else None,
                             'source': 'human:' + reviewer + '; snapshot:' + name if status != 'unreviewed' else None}
                    labels.append(label)
                    index.append({**case, 'frames': [{k: f[k] for k in ('id', 'at', 'file')} for f in case['frames']],
                                  'archiveSha256': record['sha256'], 'participantId': record['participantId'],
                                  'setupId': record['setupId'], 'split': record['split'], 'label': label, 'annotation': vote})
                (stage / (record['sessionId'] + '.labels.jsonl')).write_text(''.join(json.dumps(l) + '\n' for l in labels))
            (stage / 'index.jsonl').write_text(''.join(json.dumps(c) + '\n' for c in index))
            write(stage / 'manifest.json', {'schemaVersion': 1, 'name': name, 'reviewer': reviewer,
                  'createdAt': datetime.now(timezone.utc).isoformat(), 'recordings': catalog(root)['recordings'],
                  'excluded': sorted(excluded), 'files': {p.name: digest(p) for p in stage.iterdir()},
                  'confirmed': sum(c['label']['status'] == 'confirmed' for c in index)})
            stage.rename(destination)
        return read(destination / 'manifest.json')


def verify(root):
    records = catalog(root)['recordings']
    require(len({r['sha256'] for r in records}) == len(records), 'Duplicate archive in catalog')
    require(len({r['sessionId'] for r in records}) == len(records), 'Duplicate session in catalog')
    for record in records:
        require(digest(root / record['archive']) == record['sha256'], 'Archive changed')
        directory = root / record['path']
        with tarfile.open(root / record['archive']) as tar:
            original = json.load(tar.extractfile('manifest.json'))
        require(read(directory / 'manifest.json') == original, 'Extracted manifest changed')
        for name, entry in original['files'].items():
            require(digest(directory / name) == entry['sha256'], 'Extracted file changed: ' + name)
    for participant in {r['participantId'] for r in records}:
        require(len({r['split'] for r in records if r['participantId'] == participant}) == 1, 'Participant split leakage')
    all_cases = {c['id']: c for c in cases(root)}
    for journal in (root / 'annotations').glob('*.jsonl'):
        for vote in lines(journal):
            case = all_cases.get(vote['id'])
            require(case is not None and all(vote[k] == case[k] for k in ('sessionId', 'attemptId', 'pressId', 'atMs')), 'Annotation/source mismatch')
            require(vote['finger'] is None or vote['finger'] in FINGERS, 'Invalid annotation')
    for snapshot in (root / 'snapshots').iterdir():
        manifest = read(snapshot / 'manifest.json')
        for name, sha in manifest['files'].items():
            require(digest(snapshot / name) == sha, 'Snapshot changed: ' + name)
    return {'recordings': len(records), 'presses': len(all_cases), 'verified': True}


def serve(root, reviewer, port, queue=None):
    slug(reviewer)
    all_cases = cases(root)
    by_id = {c['id']: c for c in all_cases}
    if queue is not None:
        require(len(queue) == len(set(queue)) and set(queue) <= by_id.keys(), 'Invalid review queue')
        all_cases = [by_id[key] for key in queue]
    media = {f['url']: root / 'recordings' / c['sessionId'] / f['file'] for c in all_cases for f in c['frames']}

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, value, content_type='application/json'):
            content = json.dumps(value).encode() if content_type == 'application/json' else value
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(content)

        def allowed(self):
            host = self.headers.get('Host')
            return host in ('127.0.0.1:' + str(port), 'localhost:' + str(port)) and self.headers.get('Origin') in (None, 'http://' + host)

        def do_GET(self):
            if not self.allowed():
                return self.reply(403, {'error': 'Local access only'})
            path = unquote(urlsplit(self.path).path)
            if path == '/api/cases':
                with locked(root):
                    saved = latest(root, reviewer)
                return self.reply(200, {'cases': all_cases, 'saved': saved, 'verification': queue is not None})
            if path in media:
                return self.reply(200, media[path].read_bytes(), 'image/png')
            if path in ('/', '/review.js', '/review.css'):
                name = 'review.html' if path == '/' else path[1:]
                kind = {'review.html': 'text/html', 'review.js': 'text/javascript', 'review.css': 'text/css'}[name]
                return self.reply(200, (HERE / name).read_bytes(), kind)
            self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.allowed():
                return self.reply(403, {'error': 'Local access only'})
            try:
                require(self.path == '/api/review' and self.headers.get('Content-Type') == 'application/json', 'Invalid request')
                size = int(self.headers.get('Content-Length', '0'))
                require(0 < size <= 16384, 'Invalid request size')
                value = json.loads(self.rfile.read(size))
                require(value['id'] in {c['id'] for c in all_cases}, 'Unknown case')
                with locked(root):
                    row = append_vote(root, reviewer, by_id[value['id']], value['finger'], 'human visual verification' if queue is not None else 'human visual review')
                self.reply(200, row)
            except (ValueError, KeyError, TypeError) as error:
                self.reply(400, {'error': str(error)})

        def log_message(self, *_args):
            pass

    print('Review: http://127.0.0.1:' + str(port), flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init', 'import', 'import-labels', 'review', 'freeze', 'verify'])
    parser.add_argument('root', type=private_root)
    parser.add_argument('input', nargs='?')
    parser.add_argument('--participant')
    parser.add_argument('--setup')
    parser.add_argument('--split', choices=['development', 'validation', 'test'], default='development')
    parser.add_argument('--reviewer', default='curator')
    parser.add_argument('--port', type=int, default=8768)
    parser.add_argument('--queue', type=Path, help='JSON array of session/attempt/press IDs for verification')
    parser.add_argument('--exclude', type=Path, help='JSON array of unresolved case IDs to exclude from ground truth')
    args = parser.parse_args([arg for arg in sys.argv[1:] if arg != "--"])
    if args.command == 'init':
        init(args.root)
    elif args.command == 'import':
        print(json.dumps(import_recording(args.root, args.input, args.participant, args.setup, args.split)))
    elif args.command == 'import-labels':
        import_labels(args.root, args.input, args.reviewer)
    elif args.command == 'review':
        serve(args.root, args.reviewer, args.port, read(args.queue) if args.queue else None)
    elif args.command == 'freeze':
        print(json.dumps(freeze(args.root, args.input, args.reviewer, read(args.exclude) if args.exclude else None)))
    elif args.command == 'verify':
        print(json.dumps(verify(args.root)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(str(error))
