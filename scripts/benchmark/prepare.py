"""Verify/download published recordings and prepare inputs for the camera benchmark."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'dataset'))
import library as lib


def prepare(manifest_path, output, library=None):
    manifest = lib.read(manifest_path)
    lib.require(manifest['version'] == 1, 'Unsupported benchmark manifest')
    output.mkdir(parents=True, exist_ok=True)
    local = lib.catalog(library)['recordings'] if library else []
    if library:
        lib.verify(library)
    records = []
    for entry in manifest['recordings']:
        alias = lib.slug(entry['id'])
        label_file = (manifest_path.parent / entry['labels']).resolve()
        lib.require(lib.digest(label_file) == entry['labelsSha256'], 'Label checksum mismatch')
        if library:
            record = next((r for r in local if r['sha256'] == entry['archiveSha256']), None)
            lib.require(record is not None, 'Recording missing from local library')
            directory = library / record['path']
        else:
            archive = output / (alias + '.tar')
            if not archive.exists():
                print('Downloading ' + alias, flush=True)
                temporary = archive.with_suffix('.partial')
                try:
                    with urlopen(entry['archiveUrl'], timeout=120) as response, temporary.open('wb') as target:
                        shutil.copyfileobj(response, target)
                    lib.require(lib.digest(temporary) == entry['archiveSha256'], 'Archive checksum mismatch')
                    temporary.replace(archive)
                finally:
                    temporary.unlink(missing_ok=True)
            lib.require(lib.digest(archive) == entry['archiveSha256'], 'Archive checksum mismatch')
            directory = output / alias
            if directory.exists():
                shutil.rmtree(directory)
            with tempfile.TemporaryDirectory(dir=output) as temp:
                staging = Path(temp) / 'recording'
                staging.mkdir()
                lib.extract(archive, staging)
                staging.rename(directory)
        records.append({'id': alias, 'directory': str(directory.resolve()), 'labels': str(label_file),
                        'archiveSha256': entry['archiveSha256'], 'labelsSha256': entry['labelsSha256']})
    result = {'name': manifest['name'], 'labelledPresses': manifest['labelledPresses'],
              'participantCount': manifest['participantCount'], 'split': manifest['split'], 'recordings': records}
    lib.write(output / 'input.json', result)
    print('Prepared ' + str(output / 'input.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path('datasets/pilot-human-v2.json'))
    parser.add_argument('--output', type=lib.private_root, required=True)
    parser.add_argument('--library', type=lib.private_root)
    args = parser.parse_args()
    prepare(args.manifest.resolve(), args.output, args.library)
