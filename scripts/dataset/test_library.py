import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import library as lib


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'private'
        lib.init(self.root)

    def fixture(self):
        directory = self.root / 'recordings' / 'session1'
        directory.mkdir()
        (directory / 'manifest.json').write_text(json.dumps({'camera': {'width': 960, 'height': 720, 'rotation': 180}}))
        (directory / 'calibration.json').write_text(json.dumps({'points': {'KeyC': {'x': .2, 'y': .3}}}))
        presses = [{'type': 'evidence', 'event': {'type': 'request', 'press': {'id': 1, 'attemptId': attempt, 'at': at, 'key': 'c', 'code': 'KeyC'}}} for attempt, at in [(1, 100), (2, 1000)]]
        (directory / 'events.jsonl').write_text('\n'.join(json.dumps(p) for p in presses))
        (directory / 'frames.jsonl').write_text(json.dumps({'id': 3, 'at': 80, 'file': 'inputs/3.png'}))
        lib.write(self.root / 'library.json', {'schemaVersion': 1, 'recordings': [{'sessionId': 'session1', 'path': 'recordings/session1', 'participantId': 'person1', 'setupId': 'laptop', 'split': 'development', 'sha256': 'a' * 64}]})
        return lib.cases(self.root)

    def archive(self, entries):
        path = Path(self.temporary.name) / 'sample.tar'
        with tarfile.open(path, 'w') as tar:
            for name, content, kind in entries:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
        return path

    def test_safe_extraction_rejects_traversal_links_and_duplicates(self):
        for entries in [[('../escape', b'x', tarfile.REGTYPE)], [('link', b'', tarfile.SYMTYPE)], [('a', b'x', tarfile.REGTYPE)] * 2]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as destination:
                with self.assertRaises(ValueError):
                    lib.extract(self.archive(entries), Path(destination))
        self.assertFalse((self.root.parent / 'escape').exists())

    def test_corrupt_archive_file_is_rejected(self):
        manifest = json.dumps({'files': {'data': {'bytes': 1, 'sha256': '0' * 64}}}).encode()
        archive = self.archive([('manifest.json', manifest, tarfile.REGTYPE), ('data', b'x', tarfile.REGTYPE)])
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, 'checksum'):
            lib.extract(archive, Path(directory))

    def test_press_identity_includes_attempt_and_missing_frames_remain(self):
        cases = self.fixture()
        self.assertEqual([c['id'] for c in cases], ['session1/1/1', 'session1/2/1'])
        self.assertEqual(cases[1]['frames'], [])

    def test_legacy_presses_without_physical_codes_and_unsorted_frames(self):
        self.fixture()
        directory = self.root / 'recordings/session1'
        events = lib.lines(directory / 'events.jsonl')
        for event in events:
            del event['event']['press']['code']
        (directory / 'events.jsonl').write_text('\n'.join(json.dumps(e) for e in events))
        lib.write(directory / 'calibration.json', {'points': {'c': {'x': .2, 'y': .3}}})
        (directory / 'frames.jsonl').write_text('\n'.join(json.dumps(f) for f in [
            {'id': 4, 'at': 150, 'file': 'inputs/4.png'},
            {'id': 3, 'at': 80, 'file': 'inputs/3.png'}]))
        case = lib.cases(self.root)[0]
        self.assertEqual(case['keyPoint'], {'x': .2, 'y': .3})
        self.assertEqual([f['id'] for f in case['frames']], [3, 4])

    def test_vote_history_and_snapshot_exclusions(self):
        first, second = self.fixture()
        lib.append_vote(self.root, 'al', first, 'left-index', 'human visual review')
        lib.append_vote(self.root, 'al', first, 'left-middle', 'human visual verification')
        lib.append_vote(self.root, 'al', second, None, 'human visual review')
        self.assertEqual(len(lib.votes(self.root, 'al')), 3)
        self.assertEqual(lib.latest(self.root, 'al')[first['id']]['finger'], 'left-middle')
        frozen = lib.freeze(self.root, 'v1', 'al')
        self.assertEqual(frozen['confirmed'], 1)
        records = lib.lines(self.root / 'snapshots/v1/session1.labels.jsonl')
        self.assertEqual(records[1]['status'], 'unlabelable')
        lib.append_vote(self.root, 'al', first, 'left-ring', 'human visual review')
        self.assertEqual(lib.lines(self.root / 'snapshots/v1/session1.labels.jsonl')[0]['finger'], 'left-middle')
        self.assertEqual(lib.freeze(self.root, 'v2', 'al', [first['id']])['confirmed'], 0)
        with self.assertRaises(ValueError):
            lib.freeze(self.root, 'v1', 'al')

    def test_invalid_vote_cannot_enter_journal(self):
        case = self.fixture()[0]
        with self.assertRaises(ValueError):
            lib.append_vote(self.root, 'al', case, 'expected-finger', 'prediction')
        self.assertEqual(lib.votes(self.root, 'al'), [])

    def test_migration_is_idempotent_and_preserves_original(self):
        case = self.fixture()[0]
        old = {k: case[k] for k in ('sessionId', 'attemptId', 'pressId', 'atMs')}
        old.update(finger='left-middle', notes='original note', reviewedAt='2026-09-12')
        source = self.root / 'old.json'
        lib.write(source, {'legacy-id': old})
        lib.import_labels(self.root, source, 'al')
        lib.import_labels(self.root, source, 'al')
        self.assertEqual(len(lib.votes(self.root, 'al')), 1)
        self.assertEqual(lib.votes(self.root, 'al')[0]['original'], old)
        old['finger'] = 'left-index'
        lib.write(source, {'legacy-id': old})
        with self.assertRaisesRegex(ValueError, 'replace an existing answer'):
            lib.import_labels(self.root, source, 'al')

    def test_migration_rejects_wrong_timestamp_before_any_writes(self):
        case = self.fixture()[0]
        old = {k: case[k] for k in ('sessionId', 'attemptId', 'pressId', 'atMs')}
        old.update(finger='left-middle', atMs=99999)
        source = self.root / 'old.json'
        lib.write(source, {'bad': old})
        with self.assertRaises(ValueError):
            lib.import_labels(self.root, source, 'al')
        self.assertEqual(lib.votes(self.root, 'al'), [])

    def test_split_leakage_and_duplicate_metadata_rejected_before_import(self):
        self.fixture()
        archive = self.root / 'source.tar'
        archive.write_bytes(b'placeholder')
        with self.assertRaisesRegex(ValueError, 'more than one split'):
            lib.import_recording(self.root, archive, 'person1', 'laptop', 'test')
        with patch.object(lib, 'digest', return_value='a' * 64):
            self.assertEqual(lib.import_recording(self.root, archive, 'person1', 'laptop', 'development')['sessionId'], 'session1')
            with self.assertRaisesRegex(ValueError, 'different metadata'):
                lib.import_recording(self.root, archive, 'different-person', 'laptop', 'development')

    def test_verify_detects_changed_snapshot(self):
        case = self.fixture()[0]
        directory = self.root / 'recordings/session1'
        manifest = lib.read(directory / 'manifest.json')
        manifest['files'] = {p.name: {'bytes': p.stat().st_size, 'sha256': lib.digest(p)} for p in directory.iterdir() if p.name != 'manifest.json'}
        lib.write(directory / 'manifest.json', manifest)
        archive = self.root / 'archives/original.tar'
        with tarfile.open(archive, 'w') as tar:
            for path in directory.iterdir():
                tar.add(path, arcname=path.name)
        catalog = lib.catalog(self.root)
        catalog['recordings'][0].update(archive='archives/original.tar', sha256=lib.digest(archive))
        lib.write(self.root / 'library.json', catalog)
        lib.append_vote(self.root, 'al', case, 'left-index', 'human visual review')
        lib.freeze(self.root, 'v1', 'al')
        self.assertTrue(lib.verify(self.root)['verified'])
        index = self.root / 'snapshots/v1/index.jsonl'
        index.write_text(index.read_text() + 'changed')
        with self.assertRaisesRegex(ValueError, 'Snapshot changed'):
            lib.verify(self.root)

    def test_refuses_data_inside_worktree(self):
        checkout = self.root / 'checkout'
        checkout.mkdir()
        (checkout / '.git').write_text('gitdir: example')
        with self.assertRaises(ValueError):
            lib.private_root(checkout / 'private-data')


if __name__ == '__main__':
    unittest.main()
