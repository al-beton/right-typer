"""In-memory GitHub/Pages lifecycle simulation, explicitly not live deployment evidence."""

import copy
import hashlib
import json
import re
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

from publish import Publisher
from test_publish import PR, RUN, SHA, archive


class Source:
    def __init__(self):
        self.prs, self.runs, self.artifacts, self.zips, self.comments = (
            {},
            {},
            {},
            {},
            {},
        )

    def build(self, number, sha, run_id, content="first", malicious=False):
        pr = copy.deepcopy(PR)
        pr.update(number=number)
        pr["head"]["sha"] = sha
        self.prs[number] = pr
        run = copy.deepcopy(RUN)
        run.update(
            id=run_id,
            head_sha=sha,
            run_number=run_id,
            pull_requests=[{"number": number, "head": {"sha": sha}}],
        )
        self.runs[run_id] = run
        self.artifacts[run_id] = {
            "id": run_id,
            "name": f"preview-{number}-{sha}-1",
            "expired": False,
            "size_in_bytes": 100,
            "workflow_run": {"id": run_id, "head_sha": sha},
        }
        self.zips[run_id] = archive(
            [
                ("index.html", "<head></head><body>" + content + "</body>"),
                ("../escape" if malicious else "assets/model.wasm", b"\0asm"),
            ]
        )

    def pages(self, path, key=None):
        if "pulls?state=open" in path:
            return [p for p in self.prs.values() if p["state"] == "open"]
        if "/issues/" in path:
            number = int(path.split("/")[-2])
            return [c for c in self.comments.values() if c["number"] == number]
        if "/artifacts" in path:
            return [self.artifacts[int(path.split("/")[-2])]]
        if "head_sha=" in path:
            sha = path.split("head_sha=")[1]
            return [r for r in self.runs.values() if r["head_sha"] == sha]
        raise AssertionError(path)

    def call(self, path, method="GET", body=None, raw=False):
        if path.endswith("/preview-build.yml"):
            return {"id": 7}
        if "/pulls/" in path:
            return self.prs[int(path.split("/")[-1])]
        if raw:
            return self.zips[int(path.split("/")[-2])]
        if "/issues/comments/" in path and method == "PATCH":
            self.comments[int(path.split("/")[-1])]["body"] = body["body"]
            return None
        if "/issues/" in path and method == "POST":
            number = int(path.split("/")[-2])
            comment_id = len(self.comments) + 1
            self.comments[comment_id] = {
                "id": comment_id,
                "number": number,
                "user": {"login": "github-actions[bot]"},
                "body": body["body"],
            }
            return None
        raise AssertionError((path, method))

    def comment(self, number):
        return next(c["body"] for c in self.comments.values() if c["number"] == number)


class Target:
    def __init__(self):
        self.objects = {}
        blob = self.put(b"root readme")
        tree = self.put(
            [{"path": "README.md", "mode": "100644", "type": "blob", "sha": blob}]
        )
        self.head = self.put({"tree": {"sha": tree}})
        self.writes = []

    def put(self, value):
        data = value if isinstance(value, bytes) else json.dumps(value).encode()
        sha = hashlib.sha256(data).hexdigest()[:40]
        self.objects[sha] = value
        return sha

    def call(self, path, method="GET", body=None, raw=False):
        if method == "GET":
            if "/git/ref/" in path:
                return {"object": {"sha": self.head}}
            value = self.objects[path.split("/")[-1]]
            if "/git/blobs/" in path:
                import base64

                return {"content": base64.b64encode(value).decode()}
            return {"tree": value} if "/git/trees/" in path else value
        self.writes.append((path, body))
        if path.endswith("/git/blobs"):
            import base64

            return {"sha": self.put(base64.b64decode(body["content"]))}
        if path.endswith("/git/trees"):
            return {"sha": self.put(body["tree"])}
        if path.endswith("/git/commits"):
            return {
                "sha": self.put(
                    {"tree": {"sha": body["tree"]}, "parents": body["parents"]}
                )
            }
        if "/git/refs/" in path:
            assert body["force"] is False
            assert self.objects[body["sha"]]["parents"] == [self.head]
            self.head = body["sha"]
            return None
        raise AssertionError(path)

    def root(self):
        return self.objects[self.objects[self.head]["tree"]["sha"]]

    def fetch(self, url):
        match = re.fullmatch(r"/previews/(pr-\d+)/(.*)", urlsplit(url).path)
        if not match:
            raise AssertionError(url)
        tree = next((e for e in self.root() if e["path"] == match[1]), None)
        entry = (
            next((e for e in self.objects[tree["sha"]] if e["path"] == match[2]), None)
            if tree
            else None
        )
        if not entry:
            raise HTTPError(url, 404, "missing", {}, None)
        return self.objects[entry["sha"]]


class IntegrationTests(unittest.TestCase):
    def test_two_prs_update_old_run_rerun_and_close(self):
        source, target = Source(), Target()
        source.build(23, SHA, 99)
        source.build(24, "b" * 40, 100)
        publisher = Publisher(
            source, target, "example/previews", "https://example.github.io/previews/"
        )
        with patch("publish.public_bytes", side_effect=target.fetch):
            publisher.reconcile()
            self.assertIn("Ready:", source.comment(23))
            self.assertIn("Ready:", source.comment(24))
            untouched = next(e for e in target.root() if e["path"] == "pr-24")
            source.build(23, "c" * 40, 101, "updated")
            # Late old successful run must not win over the current head.
            source.runs[99]["run_number"] = 10000
            publisher.reconcile()
            self.assertIn("c" * 40, source.comment(23))
            self.assertIn(untouched, target.root())
            source.artifacts[101]["expired"] = True
            before = target.head
            publisher.reconcile()
            self.assertEqual(
                target.head, before, "unchanged rerun should not add commits"
            )
            source.prs[23]["state"] = "closed"
            publisher.reconcile()
            self.assertNotIn("pr-23", [e["path"] for e in target.root()])
            self.assertIn(untouched, target.root())
            self.assertIn("Retired:", source.comment(23))
            self.assertEqual(
                len(source.comments), 2, "sticky comments must not duplicate"
            )
            self.assertIn("README.md", [e["path"] for e in target.root()])

    def test_publisher_upgrade_refreshes_same_head_preview(self):
        source, target = Source(), Target()
        source.build(23, SHA, 99)
        publisher = Publisher(
            source, target, "example/previews", "https://example.github.io/previews/"
        )
        with patch("publish.public_bytes", side_effect=target.fetch):
            with patch("publish.PUBLISHER_VERSION", 1):
                publisher.reconcile()
            before = target.head
            publisher.reconcile()
            self.assertNotEqual(target.head, before)
            self.assertEqual(publisher.published_manifest(23)["publisher_version"], 2)
            self.assertIn("Ready:", source.comment(23))
            before = target.head
            publisher.reconcile()
            self.assertEqual(target.head, before)

    def test_bad_artifact_does_not_block_other_preview(self):
        source, target = Source(), Target()
        source.build(23, SHA, 99, malicious=True)
        source.build(24, "b" * 40, 100)
        publisher = Publisher(
            source, target, "example/previews", "https://example.github.io/previews/"
        )
        with (
            patch("publish.public_bytes", side_effect=target.fetch),
            self.assertRaises(RuntimeError),
        ):
            publisher.reconcile()
        self.assertIn("failed validation", source.comment(23))
        self.assertIn("Ready:", source.comment(24))
        self.assertNotIn("pr-23", [e["path"] for e in target.root()])
        self.assertFalse(any("escape" in str(body) for _, body in target.writes))
