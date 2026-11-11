#!/usr/bin/env python3
"""Fast, single-pass verification for MultiACE Full Recovery v3 archives.

Reads the compressed tar ONCE, verifies every regular file against the
embedded SHA-256 manifest, and checks critical recovery components.
Usage: python3 verify_multiace_archive_fast.py /path/to/archive.tar.gz
"""
import hashlib
import posixpath
import sys
import tarfile
from pathlib import Path


def verify(filename):
    filename = Path(filename)
    if not filename.is_file():
        raise RuntimeError('Arsiv bulunamadi: ' + str(filename))

    hashes = {}
    paths = set()
    manifest = None
    manifest_path = None
    duplicate = []
    links = {}
    root = None
    with tarfile.open(str(filename), 'r|gz') as tf:
        for member in tf:
            paths.add(member.name)
            if member.issym() or member.islnk():
                links[member.name] = (member.linkname, member.issym())
                continue
            if not member.isfile():
                continue
            if member.name in hashes:
                duplicate.append(member.name)
            part = tf.extractfile(member)
            if part is None:
                raise RuntimeError('Arsiv uyyesi okunamiyor: ' + member.name)
            if member.name.endswith('/system_info/ARCHIVE_MANIFEST_SHA256.txt'):
                if manifest is not None:
                    raise RuntimeError('Birden fazla manifest var')
                manifest = part.read().decode('utf-8')
                manifest_path = member.name
                root = member.name.rsplit('/system_info/', 1)[0]
                continue
            h = hashlib.sha256()
            while True:
                chunk = part.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
            hashes[member.name] = h.hexdigest()

    if duplicate:
        raise RuntimeError('Tekrarlanan dosyalar: ' + str(len(duplicate)))
    if manifest is None or root is None:
        raise RuntimeError('SHA256 manifest bulunamadi')
    required = {}
    for number, line in enumerate(manifest.splitlines(), 1):
        if not line.strip():
            continue
        digest, sep, relative = line.partition('  ')
        if not sep or len(digest) != 64:
            raise RuntimeError('Manifest satiri gecersiz: ' + str(number))
        member = root + '/' + relative
        if member in required:
            raise RuntimeError('Manifest tekrari: ' + member)
        required[member] = digest
    missing = required.keys() - hashes.keys() - links.keys()
    extra = hashes.keys() - required.keys()
    bad = [path for path, expected in required.items()
           if path in hashes and hashes[path] != expected]
    unresolved_links = []
    for member, expected in required.items():
        if member not in links:
            continue
        linkname, is_symlink = links[member]
        target = (posixpath.normpath(posixpath.join(posixpath.dirname(member), linkname))
                  if is_symlink else posixpath.normpath(linkname))
        # For links to other file entries inside the tar, also validate bytes.
        for _ in range(12):
            if target not in links:
                break
            dest, symbolic = links[target]
            target = (posixpath.normpath(posixpath.join(posixpath.dirname(target), dest))
                      if symbolic else posixpath.normpath(dest))
        if target in hashes:
            if hashes[target] != expected:
                bad.append(member)
        else:
            # Tar stores the link but not its external referent. Cannot verify
            # external referent bytes; explicitly report the limitation.
            unresolved_links.append(member)
    if missing or extra or bad:
        raise RuntimeError('DOGRULAMA BASARISIZ: eksik=%d fazladan=%d hash_hatasi=%d' %
                           (len(missing), len(extra), len(bad)))
    critical = [
        'klipper/extras/ace.py',
        'klipper/extras/filament_feed.py',
        'klipper/klippy_full/extras/ace_rc522.py',
        'multiace/multiace_web/backend/main.py',
        'persistence/multiace_persist/apply.sh',
        'printer_data/config/printer.cfg',
        'services/S60klipper',
        'services/S98multiace-web',
    ]
    for path in critical:
        if root + '/' + path not in hashes:
            raise RuntimeError('KRITIK DOSYA EKSIK: ' + path)
    if not any(s.startswith(root + '/spoolman/data/') and
               s.endswith('.consistent_backup') for s in hashes):
        raise RuntimeError('Spoolman tutarli SQLite kopyasi eksik')
    print('FULL SHA256 MANIFEST: PASS (%d regular files; %d symlink entries)' %
          (len(hashes), len(required.keys() & links.keys())))
    if unresolved_links:
        print('NOT: %d harici/hedefi arsivde olmayan symlink kaynagi dosya hash ile dogrulanamadi' %
              len(unresolved_links))
    print('RECOVERY CRITICAL CONTENT: PASS')
    print('STRICT ARCHIVE VERIFICATION: PASS')
    print('PACKAGE:', root)
    print('SIZE:', filename.stat().st_size, 'bytes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Kullanim: python3 verify_multiace_archive_fast.py /yol/arsiv.tar.gz')
    try:
        verify(sys.argv[1])
    except (OSError, tarfile.TarError, RuntimeError, UnicodeError) as e:
        print('STRICT ARCHIVE VERIFICATION: FAIL:', e, file=sys.stderr)
        raise SystemExit(1)
