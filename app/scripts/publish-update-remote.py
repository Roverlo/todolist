"""Remote half of publish-update.py; uses the existing static service only."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
from datetime import datetime, timezone


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(root, backups, stage, entry):
    version = entry['version']
    if not re.fullmatch(r'\d{8}_\d{4}', version):
        raise ValueError('Invalid version')
    name = f'ProjectTodo_{version}.exe'
    uploaded = stage / name
    if uploaded.is_symlink() or uploaded.read_bytes()[:2] != b'MZ':
        raise ValueError('Invalid executable')
    if digest(uploaded) != entry['sha256'] or uploaded.stat().st_size != entry['size']:
        raise ValueError('Uploaded executable hash or size mismatch')
    catalog_path = root / 'versions.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    versions = catalog['versions']
    if not isinstance(versions, list) or len({v['version'] for v in versions}) != len(versions):
        raise ValueError('Invalid existing catalog')
    for old in versions:
        if not re.fullmatch(r'\d{8}_\d{4}', old['version']):
            raise ValueError('Invalid existing version')
        if old['version'] == version and old.get('sha256', '').lower() != entry['sha256']:
            raise ValueError('Refusing to overwrite an existing release')
    folder = root / 'releases' / version
    if folder.is_symlink():
        raise ValueError('Release directory cannot be a symlink')
    folder.mkdir(parents=True, exist_ok=True)
    artifact = folder / name
    if artifact.is_symlink() or (artifact.exists() and digest(artifact) != entry['sha256']):
        raise ValueError('Refusing to overwrite an existing executable')
    if not artifact.exists():
        temporary = folder / (name + '.part')
        # Exclusive creation: an interrupted upload must be reviewed before retry.
        with temporary.open('xb') as out, uploaded.open('rb') as source:
            shutil.copyfileobj(source, out)
            out.flush()
            os.fsync(out.fileno())
        if digest(temporary) != entry['sha256']:
            raise ValueError('Staged executable hash mismatch')
        temporary.chmod(0o644)
        temporary.replace(artifact)
    versions = [v for v in versions if v['version'] != version] + [entry]
    versions.sort(key=lambda v: v['version'], reverse=True)
    catalog = {'latest': versions[0]['version'], 'versions': versions}
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = backups / ('projecttodo-release-' + stamp)
    backup.mkdir(parents=True, mode=0o700)
    original = {}
    for filename in ['versions.json', 'version.json']:
        source = root / filename
        json.loads(source.read_text(encoding='utf-8'))
        shutil.copy2(source, backup / filename)
        original[filename] = digest(source)
        if digest(backup / filename) != original[filename]:
            raise ValueError('Backup verification failed')
    for filename in original:
        content = catalog if filename == 'versions.json' else versions[0]
        (stage / filename).write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    state = {'original': original, 'backup': str(backup), 'latest': catalog['latest']}
    (stage / 'state.json').write_text(json.dumps(state), encoding='utf-8')
    return state


def promote(root, stage):
    state = json.loads((stage / 'state.json').read_text(encoding='utf-8'))
    for filename, original in state['original'].items():
        if digest(root / filename) != original:
            raise ValueError('Catalog changed since preparation; refusing to overwrite concurrent publication')
        json.loads((stage / filename).read_text(encoding='utf-8'))
    # The canonical catalog is replaced last, after the public executable passes verification.
    for filename in ['version.json', 'versions.json']:
        temporary = root / (filename + '.' + stage.name + '.tmp')
        with temporary.open('xb') as out:
            out.write((stage / filename).read_bytes())
            out.flush()
            os.fsync(out.fileno())
        temporary.chmod(0o644)
        temporary.replace(root / filename)
    return state


if __name__ == '__main__':
    import fcntl
    action, stage_path = sys.argv[1:3]
    stage = Path(stage_path)
    if stage.parent != Path('/tmp') or not re.fullmatch(r'projecttodo-release-[a-f0-9]{32}', stage.name) or stage.is_symlink():
        raise ValueError('Invalid staging directory')
    root = Path('/srv/projecttodo')
    with Path('/var/lock/projecttodo-release.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == 'prepare':
            entry = json.loads(base64.b64decode(sys.argv[3]))
            result = prepare(root, Path('/var/backups'), stage, entry)
        elif action == 'promote':
            result = promote(root, stage)
        else:
            raise ValueError('Invalid operation')
    print(json.dumps(result))
