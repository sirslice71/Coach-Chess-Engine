# CCRL Submission: Coach 1.0.0

Use this text after uploading the release zip or executable to a public GitHub
release. Replace only the download placeholder before posting.

```text
Engine: Coach 1.0.0
Estimated strength: provisional 1500-1600 Elo. This is not a CCRL-calibrated
estimate; a July 2026 Lucas Chess R position-test report was 1587 Elo, and
later changes have not been independently rated by CCRL.
Author: Sir Slice, USA
Open source: yes, MIT License
Source and homepage: https://github.com/sirslice71/Coach-Current
Implementation: JavaScript chess engine, bundled as a self-contained Windows
x64 UCI executable with Node SEA.
Credits: built and maintained by Sir Slice with AI-assisted development.
Download: [GitHub release link]

The submitted executable is Coach-1.0.0.exe. It is a single-threaded UCI
engine with a default 256 MB hash. It does not require Node.js to be installed.
```

## Release Checklist

- [x] UCI identity reports `Coach 1.0.0`.
- [x] Default UCI hash is 256 MB.
- [x] Engine remains single-threaded; Coach does not advertise a non-functional
  `Threads` option.
- [x] MIT license added.
- [x] `npm run build:ccrl` creates
  `dist\\Coach-1.0.0-windows-x64\\Coach-1.0.0.exe`.
- [x] Release folder includes a SHA-256 checksum for the executable.
- [x] The packaged executable completed a UCI handshake and depth-1 search
  with Node removed from `PATH`.
- [ ] Make the GitHub repository public.
- [ ] Create a GitHub release, upload `Coach-1.0.0.exe` (or a zip of its
  release folder), and replace the download placeholder above.
- [ ] Submit the completed text above to CCRL.

## Rebuild

```powershell
Set-Location "<path-to-Coach>"
npm install
npm run build:ccrl
```

The output folder is ignored by Git so a release build never pollutes source
changes.
