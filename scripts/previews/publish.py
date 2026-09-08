"""Trusted default-branch publisher. Stdlib only; never checks out/executes PR files."""
import base64
import hashlib
import io
import json
import os
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

SOURCE = 'al-beton/right-typer'
MARKER = '<!-- right-typer-preview -->'
MAX_BYTES = 100 * 1024 * 1024
MAX_FILES = 2000
SHA = re.compile(r'^[0-9a-f]{40}$')
PR_DIR = re.compile(r'^pr-([1-9][0-9]*)$')


def unpack(data):
    """Validate the entire ZIP before using bytes. No filesystem extraction."""
    if len(data) > MAX_BYTES:
        raise ValueError('Compressed artifact exceeds limit')
    files = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if len(archive.infolist()) > MAX_FILES:
            raise ValueError('Too many artifact entries')
        for entry in archive.infolist():
            name = entry.filename
            parts = name.rstrip('/').split('/')
            mode = entry.external_attr >> 16
            if (not name or '\\' in name or any(p in ('', '.', '..') or p.startswith('.') for p in parts)
                    or any(ord(c) < 32 or ord(c) > 126 for c in name)
                    or not re.fullmatch(r'[A-Za-z0-9_./@+ -]+', name)
                    or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))):
                raise ValueError('Unsafe artifact entry')
            if entry.is_dir():
                continue
            if name in files or name in ('CNAME', 'preview.json', 'preview-banner.js'):
                raise ValueError('Duplicate or reserved artifact path')
            total += entry.file_size
            if total > MAX_BYTES or entry.file_size > 50 * 1024 * 1024:
                raise ValueError('Expanded artifact exceeds limit')
            files[name] = archive.read(entry)
    if 'index.html' not in files:
        raise ValueError('Missing index.html')
    for name in files:
        if any('/'.join(name.split('/')[:i]) in files for i in range(1, len(name.split('/')))):
            raise ValueError('File/directory collision')
    return files


class API:
    def __init__(self, token):
        if not token:
            raise ValueError('Missing required token')
        self.token = token

    def call(self, path, method='GET', body=None, raw=False):
        # API URLs are constructed only from trusted config and validated numeric IDs.
        request = urllib.request.Request('https://api.github.com/' + path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'right-typer-preview'})
        if raw:
            # Artifact endpoint redirects to signed storage. Do not forward the token.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    return None
            try:
                response = urllib.request.build_opener(NoRedirect).open(request, timeout=60)
            except urllib.error.HTTPError as error:
                if error.code != 302:
                    raise RuntimeError(f'Artifact download HTTP {error.code}') from None
                location = error.headers['Location']
                if urllib.parse.urlsplit(location).scheme != 'https':
                    raise ValueError('Non-HTTPS artifact redirect')
                response = urllib.request.urlopen(location, timeout=60)
            with response:
                return response.read(MAX_BYTES + 1)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            # Never print headers, signed URLs, request bodies or tokens.
            raise RuntimeError(f'GitHub API {method} HTTP {error.code}') from None

    def pages(self, path, key=None):
        result = []
        for page in range(1, 101):
            data = self.call(path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
            entries = data[key] if key else data
            result.extend(entries)
            if len(entries) < 100:
                return result
        raise ValueError('Pagination limit exceeded')


def approved(pr, api):
    if pr['head']['repo'] and pr['head']['repo']['full_name'] == SOURCE:
        return True
    # Only the latest decisive review per reviewer counts; COMMENTED does not revoke.
    latest = {}
    for review in api.pages(f'repos/{SOURCE}/pulls/{pr["number"]}/reviews'):
        if review['state'] in ('APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'):
            latest[review['user']['login']] = review
    for login, review in latest.items():
        if review['state'] == 'APPROVED' and review['commit_id'] == pr['head']['sha']:
            permission = api.call(f'repos/{SOURCE}/collaborators/{urllib.parse.quote(login, safe="")}/permission')
            if permission['permission'] in ('admin', 'maintain', 'write'):
                return True
    return False


def eligible_run(run, pr, workflow_id):
    return (run['workflow_id'] == workflow_id and run['event'] == 'pull_request'
            and run['conclusion'] == 'success' and run['head_sha'] == pr['head']['sha']
            and run['repository']['full_name'] == SOURCE
            and run['head_repository'] and pr['head']['repo']
            and run['head_repository']['id'] == pr['head']['repo']['id']
            and any(p['number'] == pr['number'] and p['head']['sha'] == pr['head']['sha']
                    for p in run['pull_requests']))


def decorate(files, number, sha, run_id):
    manifest = {'pr': number, 'sha': sha, 'run_id': run_id,
                'source': SOURCE, 'files': {}}
    # This is a label, not a sandbox; reviewed JavaScript can modify/remove it.
    banner = f'''// Convenience namespacing, not a security boundary.
const prefix='right-typer-preview-{number}:';
const proto=Storage.prototype;
const get=proto.getItem,set=proto.setItem,remove=proto.removeItem,key=proto.key;
proto.getItem=function(k){{return get.call(this,this===localStorage?prefix+k:k)}};
proto.setItem=function(k,v){{return set.call(this,this===localStorage?prefix+k:k,v)}};
proto.removeItem=function(k){{return remove.call(this,this===localStorage?prefix+k:k)}};
const clear=proto.clear;
proto.clear=function(){{if(this!==localStorage)return clear.call(this);
const keys=[];for(let i=0;i<this.length;i++){{const k=key.call(this,i);if(k?.startsWith(prefix))keys.push(k)}}
for(const k of keys)remove.call(this,k)}};
addEventListener('DOMContentLoaded',()=>{{const b=document.createElement('aside');
b.setAttribute('aria-label','PR preview');
b.style.cssText='padding:12px;background:#fff3cd;color:#211b00;text-align:center';
const a=document.createElement('a');a.href='https://github.com/{SOURCE}/pull/{number}';
a.textContent='Review PR #{number} · {sha[:12]}';b.append(a);
b.append(' · Untrusted preview code. Only allow camera access if you trust this PR. All previews share one origin.');
document.body.prepend(b);}});'''
    files = dict(files)
    files['preview-banner.js'] = banner.encode()
    html = files['index.html'].decode('utf-8')
    # Relative script remains valid under /repository/pr-N/.
    if not re.search(r'<head(?:\s[^>]*)?>', html, re.I):
        raise ValueError('Missing HTML head')
    files['index.html'] = re.sub(r'(<head(?:\s[^>]*)?>)', r'\1<script src="./preview-banner.js"></script>', html, count=1, flags=re.I).encode()
    manifest['files'] = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    files['preview.json'] = json.dumps(manifest, sort_keys=True).encode()
    return files, manifest


def public_bytes(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read(MAX_BYTES + 1)


def served(url, manifest):
    try:
        nonce = str(time.time_ns())
        actual = json.loads(public_bytes(url + 'preview.json?verify=' + nonce))
        if actual != manifest:
            return False
        # A manifest alone is insufficient: verify every deployed file's bytes.
        return all(hashlib.sha256(public_bytes(url + urllib.parse.quote(name) + '?verify=' + nonce)).hexdigest() == digest
                   for name, digest in manifest['files'].items())
    except (urllib.error.URLError, ValueError, TimeoutError):
        return False


class Publisher:
    def __init__(self, source, target, repository, url):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository) or repository.lower() == SOURCE.lower():
            raise ValueError('Invalid preview repository')
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname == 'al-beton.github.io' or parsed.query or parsed.fragment or parsed.username:
            raise ValueError('Preview must use a separate HTTPS origin')
        self.source, self.target, self.repo, self.url = source, target, repository, url.rstrip('/') + '/'
        self.root = f'repos/{repository}'

    def comment(self, number, body):
        path = f'repos/{SOURCE}/issues/{number}/comments'
        existing = next((c for c in self.source.pages(path)
                         if c['user']['login'] == 'github-actions[bot]' and c['body'].startswith(MARKER)), None)
        body = MARKER + '\n' + body
        if existing and existing['body'] == body:
            return
        if existing:
            self.source.call(f'repos/{SOURCE}/issues/comments/{existing["id"]}', 'PATCH', {'body': body})
        else:
            self.source.call(path, 'POST', {'body': body})

    def current(self, number, sha):
        pr = self.source.call(f'repos/{SOURCE}/pulls/{number}')
        return pr['state'] == 'open' and pr['head']['sha'] == sha and approved(pr, self.source)

    def tree(self):
        ref = self.target.call(self.root + '/git/ref/heads/gh-pages')
        commit = self.target.call(self.root + '/git/commits/' + ref['object']['sha'])
        tree = self.target.call(self.root + '/git/trees/' + commit['tree']['sha'])
        if tree.get('truncated'):
            raise ValueError('Truncated root tree')
        return ref['object']['sha'], tree['tree']

    def commit(self, parent, entries, message):
        tree = self.target.call(self.root + '/git/trees', 'POST', {'tree': entries})
        commit = self.target.call(self.root + '/git/commits', 'POST',
            {'message': message, 'tree': tree['sha'], 'parents': [parent]})
        # Non-force update is an additional compare-and-swap against competing writers.
        self.target.call(self.root + '/git/refs/heads/gh-pages', 'PATCH', {'sha': commit['sha'], 'force': False})

    def remove(self, number):
        parent, entries = self.tree()
        kept = [e for e in entries if e['path'] != f'pr-{number}']
        if len(kept) != len(entries):
            self.commit(parent, kept, f'Retire PR #{number}')
        self.comment(number, 'Retired: preview removed (closed PR, changed head, or missing current-head approval).')

    def publish(self, pr, run, workflow_id):
        number, sha = pr['number'], pr['head']['sha']
        if not eligible_run(run, pr, workflow_id) or not SHA.fullmatch(sha):
            return
        artifacts = self.source.pages(f'repos/{SOURCE}/actions/runs/{run["id"]}/artifacts', 'artifacts')
        found = [a for a in artifacts if a['name'] == f'preview-{number}-{sha}' and not a['expired']]
        if len(found) != 1:
            return
        artifact = found[0]
        identity = artifact.get('workflow_run', {})
        if identity.get('id') != run['id'] or identity.get('head_sha') != sha or artifact['size_in_bytes'] > MAX_BYTES:
            raise ValueError('Artifact identity/size mismatch')
        files, manifest = decorate(unpack(self.source.call(
            f'repos/{SOURCE}/actions/artifacts/{int(artifact["id"])}/zip', raw=True)), number, sha, run['id'])
        url = self.url + f'pr-{number}/'
        if served(url, manifest) and self.current(number, sha):
            self.comment(number, f'Ready: [Open preview]({url})\n\nDeployed commit: `{sha}` · [build](https://github.com/{SOURCE}/actions/runs/{run["id"]})\n\nOnly grant camera access to code you trust. PRs share this review origin.')
            return
        self.comment(number, f'Publishing commit `{sha}`. The preview is not ready yet.')
        blobs = []
        for name, content in files.items():
            blob = self.target.call(self.root + '/git/blobs', 'POST',
                {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
            blobs.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        subtree = self.target.call(self.root + '/git/trees', 'POST', {'tree': blobs})
        parent, entries = self.tree()
        if not self.current(number, sha):
            return
        entries = [e for e in entries if e['path'] != f'pr-{number}']
        entries.append({'path': f'pr-{number}', 'mode': '040000', 'type': 'tree', 'sha': subtree['sha']})
        self.commit(parent, entries, f'Preview PR #{number} at {sha}')
        for _ in range(40):
            if not self.current(number, sha):
                self.remove(number)
                return
            if served(url, manifest):
                if self.current(number, sha):
                    self.comment(number, f'Ready: [Open preview]({url})\n\nDeployed commit: `{sha}` · [build](https://github.com/{SOURCE}/actions/runs/{run["id"]})\n\nOnly grant camera access to code you trust. PRs share this review origin.')
                return
            time.sleep(15)
        self.comment(number, f'Deployment verification pending for `{sha}`. No ready link until every file matches. Rerun Publish previews to recover.')

    def reconcile(self):
        workflow = self.source.call(f'repos/{SOURCE}/actions/workflows/preview-build.yml')['id']
        prs = self.source.pages(f'repos/{SOURCE}/pulls?state=open')
        allowed = {p['number']: p for p in prs if approved(p, self.source)}
        _, entries = self.tree()
        for entry in entries:
            match = PR_DIR.fullmatch(entry['path'])
            if match:
                number = int(match[1])
                if number not in allowed:
                    self.remove(number)
        for pr in prs:
            number = pr['number']
            if number not in allowed:
                self.comment(number, 'Awaiting maintainer APPROVED review of the current head before fork publication. Re-run Publish previews after approval.')
                continue
            runs = self.source.pages(f'repos/{SOURCE}/actions/workflows/{workflow}/runs?event=pull_request&head_sha={pr["head"]["sha"]}', 'workflow_runs')
            candidates = [r for r in runs if eligible_run(r, pr, workflow)]
            if candidates:
                self.publish(pr, max(candidates, key=lambda r: (r['run_number'], r['run_attempt'])), workflow)
            else:
                self.comment(number, f'Waiting for a successful Preview build of current commit `{pr["head"]["sha"]}`.')


if __name__ == '__main__':
    try:
        Publisher(API(os.environ['SOURCE_TOKEN']), API(os.environ['PREVIEW_DEPLOY_TOKEN']),
                  os.environ['PREVIEW_REPOSITORY'], os.environ['PREVIEW_BASE_URL']).reconcile()
    except Exception as error:
        print(f'Preview reconciliation failed ({type(error).__name__}); inspect configuration and rerun.', file=sys.stderr)
        sys.exit(1)
