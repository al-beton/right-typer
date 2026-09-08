import copy
import io
import stat
import unittest
import zipfile
from unittest.mock import Mock, patch

from publish import (
    SOURCE,
    Publisher,
    approved,
    decorate,
    eligible_run,
    served,
    unpack,
)

SHA = "a" * 40
PR = {
    "number": 23,
    "state": "open",
    "head": {"sha": SHA, "ref": "topic", "repo": {"id": 1, "full_name": SOURCE}},
}
RUN = {
    "id": 99,
    "run_attempt": 1,
    "head_branch": "topic",
    "workflow_id": 7,
    "event": "pull_request",
    "conclusion": "success",
    "head_sha": SHA,
    "repository": {"full_name": SOURCE},
    "head_repository": {"id": 1},
    "pull_requests": [{"number": 23, "head": {"sha": SHA}}],
}


def archive(entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as z:
        for name, value in entries:
            z.writestr(name, value)
    return data.getvalue()


class SecurityTests(unittest.TestCase):
    def test_valid_nested_assets(self):
        files = unpack(
            archive([("index.html", "<head></head>"), ("assets/model.wasm", b"\0asm")])
        )
        self.assertEqual(files["assets/model.wasm"], b"\0asm")

    def test_reject_paths_links_duplicates_and_reserved_files(self):
        for path in (
            "../escape",
            "/absolute",
            "a/../../b",
            "a\\b",
            ".git/config",
            ".github/workflows/x.yml",
            "CNAME",
            "preview.json",
            "preview-banner.js",
            "a\nb",
        ):
            with self.subTest(path=path), self.assertRaises(ValueError):
                unpack(archive([("index.html", ""), (path, "")]))
        link = zipfile.ZipInfo("link")
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaises(ValueError):
            unpack(archive([("index.html", ""), (link, "/tmp/escape")]))
        with self.assertRaises(ValueError):
            unpack(archive([("index.html", ""), ("index.html", "")]))
        with self.assertRaises(ValueError):
            unpack(archive([("index.html", ""), ("a", ""), ("a/b", "")]))

    def test_expansion_limits(self):
        with patch("publish.MAX_BYTES", 1000), self.assertRaises(ValueError):
            unpack(archive([("index.html", "x" * 1001)]))
        with patch("publish.MAX_FILES", 1), self.assertRaises(ValueError):
            unpack(archive([("index.html", ""), ("b", "")]))

    def test_run_identity(self):
        self.assertTrue(eligible_run(RUN, PR, 7))
        for field, value in [
            ("workflow_id", 8),
            ("event", "push"),
            ("conclusion", "failure"),
            ("head_sha", "b" * 40),
            ("repository", {"full_name": "attacker/repo"}),
            ("head_repository", {"id": 2}),
            ("pull_requests", [{"number": 24, "head": {"sha": SHA}}]),
        ]:
            with self.subTest(field=field):
                self.assertFalse(eligible_run(dict(RUN, **{field: value}), PR, 7))

    def test_fork_run_without_pull_requests_uses_live_head_identity(self):
        self.assertTrue(eligible_run(dict(RUN, pull_requests=[]), PR, 7))
        self.assertFalse(
            eligible_run(dict(RUN, pull_requests=[], head_branch="other"), PR, 7)
        )

    def test_fork_requires_current_head_current_maintainer_approval(self):
        fork = copy.deepcopy(PR)
        fork["head"]["repo"] = {"id": 2, "full_name": "someone/fork"}
        api = Mock()
        api.pages.return_value = []
        self.assertFalse(approved(fork, api))
        review = {"state": "APPROVED", "commit_id": SHA, "user": {"login": "owner"}}
        api.pages.return_value = [review]
        api.call.return_value = {"permission": "write"}
        self.assertTrue(approved(fork, api))
        api.call.return_value = {"permission": "read"}
        self.assertFalse(approved(fork, api))
        api.call.return_value = {"permission": "admin"}
        api.pages.return_value = [dict(review, commit_id="b" * 40)]
        self.assertFalse(approved(fork, api))
        api.pages.return_value = [review, dict(review, state="DISMISSED")]
        self.assertFalse(approved(fork, api))

    def test_manifest_is_not_enough_for_ready(self):
        import json

        files, manifest = decorate(
            {"index.html": b"<head></head><body></body>"}, 23, SHA, 99
        )

        def fetch(url):
            name = url.split("/")[-1].split("?")[0]
            return files[name]

        with patch("publish.public_bytes", side_effect=fetch):
            self.assertTrue(served("https://review.example/pr-23/", manifest))
        with patch(
            "publish.public_bytes",
            side_effect=[json.dumps(manifest).encode(), b"wrong"],
        ):
            self.assertFalse(served("https://review.example/pr-23/", manifest))
        self.assertIn(b"right-typer-preview-23:", files["preview-banner.js"])
        self.assertLess(
            files["index.html"].index(b"preview-banner.js"),
            files["index.html"].index(b"</head>"),
        )

    def test_separate_origin_required(self):
        for url in (
            "https://al-beton.github.io/another-repo/",
            "http://review.example/",
        ):
            with self.assertRaises(ValueError):
                Publisher(Mock(), Mock(), "example/previews", url)


class LifecycleTests(unittest.TestCase):
    def publisher(self):
        p = Publisher(
            Mock(), Mock(), "example/previews", "https://example.github.io/previews/"
        )
        p.comment = Mock()
        return p

    def test_close_preserves_other_preview_and_root_files(self):
        p = self.publisher()
        keep = [{"path": "pr-24"}, {"path": "README.md"}]
        p.tree = Mock(return_value=("parent", [{"path": "pr-23"}] + keep))
        p.commit = Mock()
        p.remove(23)
        self.assertEqual(p.commit.call_args.args[1], keep)

    def test_changed_or_closed_head_fails_current(self):
        p = self.publisher()
        for pr in [
            dict(PR, state="closed"),
            dict(PR, head=dict(PR["head"], sha="b" * 40)),
        ]:
            p.source.call.return_value = pr
            self.assertFalse(p.current(23, SHA))

    def test_stale_run_never_downloads_or_writes(self):
        p = self.publisher()
        p.publish(PR, dict(RUN, head_sha="b" * 40), 7)
        p.source.call.assert_not_called()
        p.target.call.assert_not_called()

    def test_head_changes_during_upload_no_commit(self):
        p = self.publisher()
        artifact = {
            "name": f"preview-23-{SHA}-1",
            "expired": False,
            "id": 4,
            "size_in_bytes": 100,
            "workflow_run": {"id": 99, "head_sha": SHA},
        }
        p.source.pages.return_value = [artifact]
        p.source.call.return_value = archive([("index.html", "<head></head>")])
        p.target.call.return_value = {"sha": "blob"}
        p.tree = Mock(return_value=("parent", [{"path": "pr-24"}]))
        p.current = Mock(side_effect=[True, False])
        p.commit = Mock()
        with patch("publish.served", return_value=False):
            p.publish(PR, RUN, 7)
        p.commit.assert_not_called()

    def test_update_preserves_other_preview_and_rechecks_after_publish(self):
        p = self.publisher()
        p.source.pages.return_value = [
            {
                "name": f"preview-23-{SHA}-1",
                "expired": False,
                "id": 4,
                "size_in_bytes": 100,
                "workflow_run": {"id": 99, "head_sha": SHA},
            }
        ]
        p.source.call.return_value = archive([("index.html", "<head></head>")])
        p.target.call.return_value = {"sha": "new-tree"}
        p.tree = Mock(
            return_value=(
                "parent",
                [{"path": "pr-24", "sha": "untouched"}, {"path": "pr-23"}],
            )
        )
        p.current = Mock(side_effect=[True, True, False])
        p.commit, p.remove = Mock(), Mock()
        with patch("publish.served", return_value=False):
            p.publish(PR, RUN, 7)
        entries = p.commit.call_args.args[1]
        self.assertIn({"path": "pr-24", "sha": "untouched"}, entries)
        self.assertEqual(sum(e["path"] == "pr-23" for e in entries), 1)
        p.remove.assert_called_once_with(23)
        self.assertNotIn("Ready:", str(p.comment.call_args_list))


if __name__ == "__main__":
    unittest.main()
