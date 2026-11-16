# Twilight Imperium fan collection

An offline browser collection, including the custom Nestphar and Arc Prime globe viewers. This is the website and its assets, not the separate PlanetDiffusion research program.

## Download and unpack

Download `unpack.py`, `Unpack-Windows.bat`, `SHA256SUMS.txt`, and every `twilight-collection.tar.part-*` file from the GitHub release into the same folder. On Windows run `Unpack-Windows.bat`; on macOS run `python3 unpack.py`. This creates a `team-distribution` folder containing the complete collection. The archive is split into parts because of GitHub's release-file size limits. Keep all parts until extraction succeeds. The checksums file lists each part and its SHA-256 digest for optional integrity verification.

## Start

Install Python 3 if necessary. On Windows double-click `Start-Windows.bat`; on macOS double-click `Start-Mac.command` (or run `python3 start.py` in a terminal). A local server opens the collection in your browser. Keep its window open until finished. The server binds only to your own computer and chooses an available port. An internet connection is not needed for the included assets; external citations do need one.

Select **The Arborec** and inspect **Nestphar**, or **The Barony of Letnev** and inspect **Arc Prime** in the flagship viewer. A modern WebGL-capable browser and hardware acceleration are recommended. Large textures can take time and memory to load.

The current Nestphar satellite-style globe was generated in eight regional images and assembled into 32 tiles. It approximates earlier geography. `source/viewer` contains the editable viewer sources; the distributed browser build is `collection/assets/flagships-nestphar-satellite-global-v1.js`. The assets also retain earlier versions and trials. `source/nestphar-generation` preserves the generated inputs and experimental build script; the build script has machine-specific paths and is not a portable build pipeline.

To rebuild the viewer, install Node.js, then run `npm install` and `npm run build` in `source`. The output is written to `build/`; copy it into the unpacked collection's `assets` folder to use it.

The `collection` directory is approximately 17 GB, including 3D models, multiple asset versions, and offline wrappers. Preserve its paths when copying or unpacking. A basic GitHub ZIP download does not automatically include separate release assets or Git LFS objects.

Twilight Imperium and the original game images are the property of Fantasy Flight Games and other respective rights holders. This is an unofficial fan collection. See `collection/README.md` and source documents for attribution and third-party licenses. This notice does not grant redistribution rights.
