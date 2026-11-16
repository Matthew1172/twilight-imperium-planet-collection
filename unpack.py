#!/usr/bin/env python3
"""Unpack the ordered release parts without assembling a second giant archive."""
import io
import tarfile
from pathlib import Path

parts = sorted(Path('.').glob('twilight-collection.tar.part-*'))
if not parts or parts[0].name != 'twilight-collection.tar.part-aa':
    raise SystemExit('Place every release part beside this script and try again.')
checksums = Path('SHA256SUMS.txt')
if checksums.exists():
    expected = [line.split(maxsplit=1)[1].lstrip('*') for line in checksums.read_text().splitlines() if line.strip()]
    if [part.name for part in parts] != expected:
        raise SystemExit('The archive parts do not match SHA256SUMS.txt; download every part.')
for index, part in enumerate(parts):
    suffix = chr(ord('a') + index // 26) + chr(ord('a') + index % 26)
    if part.name != 'twilight-collection.tar.part-' + suffix:
        raise SystemExit(f'Missing release part before {part.name}.')

class Parts(io.RawIOBase):
    def __init__(self, paths):
        self.paths = iter(paths)
        self.current = None
    def readable(self):
        return True
    def readinto(self, target):
        while True:
            if self.current is None:
                try:
                    self.current = next(self.paths).open('rb')
                except StopIteration:
                    return 0
            n = self.current.readinto(target)
            if n:
                return n
            self.current.close()
            self.current = None

destination = Path('.').resolve()
with io.BufferedReader(Parts(parts), 1024 * 1024) as stream:
    with tarfile.open(fileobj=stream, mode='r|') as archive:
        for member in archive:
            path = (destination / member.name).resolve()
            if destination not in path.parents or member.issym() or member.islnk():
                raise ValueError(f'Unsafe archive entry: {member.name}')
            archive.extract(member, path=destination)
print('Finished. Open team-distribution/Start-Windows.bat or Start-Mac.command.')
