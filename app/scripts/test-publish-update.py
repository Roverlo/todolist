"""Filesystem checks for release publication; never contacts a server."""
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-update-remote.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'web'
        self.root.mkdir()
        self.stage = self.base / 'stage'
        self.stage.mkdir()
        self.old = self.entry('20260922_1000')
        (self.root / 'versions.json').write_text(json.dumps({'latest': self.old['version'], 'versions': [self.old]}))
        (self.root / 'version.json').write_text(json.dumps(self.old))
        self.original = (self.root / 'versions.json').read_bytes()

    def entry(self, version):
        data = b'MZ' + version.encode()
        return {'version': version, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data),
                'downloadUrl': 'https://example.invalid/' + version, 'releaseNotes': 'fixture',
                'mandatory': False, 'releaseDate': '2026-09-22', 'sourceCommit': '0' * 40}

    def prepare(self, version='20260922_1100', corrupt=False):
        entry = self.entry(version)
        (self.stage / f'ProjectTodo_{version}.exe').write_bytes(b'MZ' + (b'corrupt' if corrupt else version.encode()))
        return publisher.prepare(self.root, self.base / 'backups', self.stage, entry)

    def test_prepare_keeps_catalog_and_backup_then_promotes(self):
        state = self.prepare()
        self.assertEqual((self.root / 'versions.json').read_bytes(), self.original)
        self.assertEqual((Path(state['backup']) / 'versions.json').read_bytes(), self.original)
        publisher.promote(self.root, self.stage)
        self.assertEqual(json.loads((self.root / 'versions.json').read_text())['latest'], '20260922_1100')
        self.assertEqual(json.loads((self.root / 'version.json').read_text())['version'], '20260922_1100')

    def test_corrupt_upload_cannot_change_catalog(self):
        with self.assertRaises(ValueError):
            self.prepare(corrupt=True)
        self.assertEqual((self.root / 'versions.json').read_bytes(), self.original)

    def test_existing_exe_cannot_be_overwritten(self):
        folder = self.root / 'releases' / '20260922_1100'
        folder.mkdir(parents=True)
        artifact = folder / 'ProjectTodo_20260922_1100.exe'
        artifact.write_bytes(b'MZexisting')
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertEqual(artifact.read_bytes(), b'MZexisting')

    def test_concurrent_catalog_cannot_be_overwritten(self):
        self.prepare()
        (self.root / 'versions.json').write_bytes(self.original + b'\n')
        with self.assertRaises(ValueError):
            publisher.promote(self.root, self.stage)
        self.assertEqual((self.root / 'versions.json').read_bytes(), self.original + b'\n')

    def test_older_release_does_not_become_latest(self):
        self.prepare('20260921_1100')
        publisher.promote(self.root, self.stage)
        self.assertEqual(json.loads((self.root / 'versions.json').read_text())['latest'], self.old['version'])


if __name__ == '__main__':
    unittest.main()
