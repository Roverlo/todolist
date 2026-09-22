"""Publish a tested portable EXE to the existing VPS03 service. Python stdlib only."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
from datetime import datetime
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def verify_download(url, size, sha256):
    with urlopen(url, timeout=60) as response:
        if response.status != 200:
            raise ValueError('Public download did not return HTTP 200')
        digest = hashlib.sha256()
        count = 0
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            count += len(chunk)
    if count != size or digest.hexdigest() != sha256:
        raise ValueError('Public download hash or size mismatch; catalog was not promoted')
    with urlopen(Request(url, headers={'Range': 'bytes=0-1'}), timeout=30) as response:
        if response.status != 206 or response.read() != b'MZ':
            raise ValueError('Public Range download check failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path)
    parser.add_argument('--notes-file', required=True, type=Path)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--ssh-target', required=True, help='Configured SSH alias or user@host')
    parser.add_argument('--identity-file', type=Path)
    parser.add_argument('--port', type=int, default=22)
    parser.add_argument('--direct', action='store_true', help='Ignore SSH ProxyCommand and ProxyJump for this invocation')
    parser.add_argument('--server-url', default='https://projecttodo.188-255-156-112.sslip.io')
    args = parser.parse_args()
    exe = args.exe.resolve(strict=True)
    match = re.fullmatch(r'ProjectTodo_(\d{8}_\d{4})\.exe', exe.name)
    if not match or exe.read_bytes()[:2] != b'MZ':
        parser.error('Expected a tested ProjectTodo_YYYYMMDD_HHmm.exe')
    version = match[1]
    date = datetime.strptime(version, '%Y%m%d_%H%M').date().isoformat()
    if not re.fullmatch(r'[a-f0-9]{40}', args.source_commit):
        parser.error('source-commit must be the full tested source commit')
    run(['git', 'cat-file', '-e', args.source_commit + '^{commit}'], cwd=Path(__file__).resolve().parents[2])
    address = args.server_url.rstrip('/')
    url = urlsplit(address)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error('Public server URL must use HTTPS without credentials, query or fragment')
    if not re.fullmatch(r'[A-Za-z0-9_.@-]+', args.ssh_target) or args.ssh_target.startswith('-') or not 1 <= args.port <= 65535:
        parser.error('Invalid SSH target or port')
    notes = args.notes_file.read_text(encoding='utf-8-sig').strip()
    if not notes:
        parser.error('Release notes cannot be empty')
    entry = {'version': version, 'releaseDate': date, 'downloadUrl': f'{address}/releases/{version}/{exe.name}',
             'releaseNotes': notes, 'mandatory': False, 'size': exe.stat().st_size,
             'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'sourceCommit': args.source_commit}
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
    if args.direct:
        options += ['-o', 'ProxyCommand=none', '-o', 'ProxyJump=none']
    if args.identity_file:
        options += ['-i', str(args.identity_file.resolve(strict=True))]
    ssh = ['ssh', *options, '-p', str(args.port), args.ssh_target]
    stage = '/tmp/projecttodo-release-' + uuid.uuid4().hex
    run([*ssh, 'umask 077 && mkdir ' + shlex.quote(stage)])
    run(['scp', *options, '-P', str(args.port), str(exe), f'{args.ssh_target}:{stage}/{exe.name}'])
    remote = Path(__file__).with_name('publish-update-remote.py').read_bytes()

    def action(name, *values):
        command = shlex.join(['python3', '-', name, stage, *values])
        result = run([*ssh, command], input=remote, capture_output=True)
        return json.loads(result.stdout)

    encoded = base64.b64encode(json.dumps(entry).encode()).decode()
    prepared = action('prepare', encoded)
    print('Backup: ' + prepared['backup'], flush=True)
    verify_download(entry['downloadUrl'], entry['size'], entry['sha256'])
    action('promote')
    with urlopen(address + '/versions.json', timeout=30) as response:
        catalog = json.load(response)
        if response.status != 200 or 'no-store' not in response.headers.get('Cache-Control', '') or response.headers.get_content_type() != 'application/json':
            raise ValueError('Public catalog response headers failed validation')
    if catalog['latest'] != prepared['latest'] or entry not in catalog['versions']:
        raise ValueError('Public catalog verification failed; inspect the saved backup')
    # Remove only the exact staging files from this invocation; leave released versions and backups intact.
    names = [exe.name, 'versions.json', 'version.json', 'state.json']
    run([*ssh, 'rm -- ' + shlex.join([stage + '/' + name for name in names]) + ' && rmdir -- ' + shlex.quote(stage)])
    print(json.dumps({'status': 'published', 'release': entry, 'backup': prepared['backup']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        if error.stderr:
            sys.stderr.write(error.stderr.decode(errors='replace'))
        raise SystemExit('Publication command failed; existing catalogs are preserved until promotion.') from error
