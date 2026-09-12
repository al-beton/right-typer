"""Export numeric regression fixtures from a reviewed private snapshot (no images/video)."""
import argparse
import copy
import json
from pathlib import Path

import library as lib


def export_reference(root, snapshot, output):
    lib.slug(snapshot)
    lib.verify(root)
    frozen = root / 'snapshots' / snapshot
    manifest = lib.read(frozen / 'manifest.json')
    lib.require(not output.exists(), 'Choose a new fixture directory; existing fixtures are never overwritten')
    records, cases, frames, known, sources = [], [], [], {}, []
    source_map = {}
    for index, record in enumerate(manifest['recordings'], 1):
        alias = 'recording-' + str(index)
        directory = root / record['path']
        labels_file = frozen / (record['sessionId'] + '.labels.jsonl')
        labels = {(l['attemptId'], l['pressId']): l for l in lib.lines(labels_file)}
        calibration = copy.deepcopy(lib.read(directory / 'calibration.json'))
        calibration['deviceId'] = 'recorded-fixture'
        calibration['savedAt'] = 0
        if calibration.get('profile'):
            calibration['profile']['id'] = alias + '-keyboard'
            calibration['profile']['name'] = 'Recorded keyboard'
        events = lib.lines(directory / 'events.jsonl')
        requests = {(e['event']['press']['attemptId'], e['event']['press']['id']): e['event']['press']
                    for e in events if e['type'] == 'evidence' and e['event']['type'] == 'request'}
        origin = min(p['at'] for p in requests.values())
        available, selected = {}, {}
        public_ids = {}
        for event in events:
            if event['type'] == 'evidence':
                if event['event']['type'] == 'reset':
                    available = {}
                elif event['event']['type'] == 'frame-result':
                    frame = event['event']['frame']
                    available[frame['id']] = frame
                continue
            if event['type'] != 'observation':
                continue
            key = (event['attemptId'], event['pressId'])
            label, press = labels[key], requests[key]
            if label['status'] != 'confirmed':
                continue
            case_id = alias + '/press-' + str(event['pressId']) + '-attempt-' + str(event['attemptId'])
            nearby = [f for f in available.values() if abs(f['at'] - press['at']) <= 500]
            frame_ids = []
            for frame in nearby:
                original_id = frame['id']
                if original_id not in public_ids:
                    public_ids[original_id] = len(public_ids) + 1
                public_id = public_ids[original_id]
                selected[public_id] = {
                    'id': public_id, 'at': frame['at'] - origin,
                    'receivedAt': frame['receivedAt'] - origin, 'clock': frame['clock'],
                    'hands': [{'side': h['side'], 'score': h['score'],
                               'points': [{'x': p['x'], 'y': p['y']} for p in h['points']]} for h in frame['hands']],
                }
                frame_ids.append(public_id)
            actual = event['observation'].get('finger')
            cases.append({'id': case_id, 'recording': alias,
                          'press': {'key': press['key'], **({'code': press['code']} if 'code' in press else {}), 'at': press['at'] - origin},
                          'frameIds': frame_ids, 'finger': label['finger'], 'allowedFingers': press.get('allowedFingers')})
            if actual != label['finger']:
                known[case_id] = {'recordedPrediction': actual, 'humanFinger': label['finger']}
            source_map[case_id] = {'sessionId': record['sessionId'], 'attemptId': key[0], 'pressId': key[1],
                                   'atMs': press['at'], 'frameIds': [f['id'] for f in nearby]}
        records.append({'id': alias, 'calibration': calibration})
        frames.extend({'recording': alias, 'frame': frame} for frame in selected.values())
        sources.append({'id': alias, 'archiveSha256': record['sha256'], 'labelsSha256': lib.digest(labels_file)})
    lib.require(len(cases) == manifest['confirmed'], 'Some confirmed presses have no settled observation')
    output.mkdir(parents=True)
    for name, value in [('recordings.json', records), ('cases.json', cases), ('known-disagreements.json', known)]:
        lib.write(output / name, value)
    (output / 'frames.jsonl').write_text(''.join(json.dumps(f, separators=(',', ':')) + '\n' for f in frames))
    lib.write(output / 'manifest.json', {'version': 1, 'snapshot': snapshot, 'cases': len(cases), 'sources': sources,
                                       'provenance': 'Recorded numeric hand landmarks and human-labelled presses; not synthetic.',
                                       'limits': 'One participant, development data only. Cached 2D landmarks; no vision-model rerun, pixels or video.',
                                       'sourceSnapshotSha256': lib.digest(frozen / 'manifest.json')})
    # Keep the reverse lookup private, not alongside the public fixtures.
    lib.write(root / 'derived' / (snapshot + '-fixture-source-map.json'), source_map)
    return {'cases': len(cases), 'frames': len(frames), 'recordings': len(records), 'knownDisagreements': len(known)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=lib.private_root)
    parser.add_argument('snapshot')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(export_reference(args.root, args.snapshot, args.output)))
