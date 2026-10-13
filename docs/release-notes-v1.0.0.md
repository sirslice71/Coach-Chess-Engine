# Coach 1.0.0

Coach 1.0.0 is the first public, self-contained UCI release of Coach.

## Highlights

- Windows x64 UCI executable with no separate Node.js installation required.
- Default 256 MB hash setting for tournament testers.
- Single-threaded operation with transparent UCI options.
- Open-source release under the MIT License.

## Acknowledgment

Coach's development was tested extensively against
[ShallowBlue v2.0.0](https://github.com/GunshipPenguin/shallow-blue). Early
Coach versions rarely beat it, and reaching a confident score above 50% in
matches became a personal development goal for Coach author Sir Slice. Thank
you to the ShallowBlue project for providing a valuable, consistent opponent.

## Verification

- Full project regression suite passed.
- UCI suite passed 45/45 tests.
- Packaged executable completed `uci`, `isready`, and a depth-1 search with
  Node removed from `PATH`.

## Included Files

- `Coach-1.0.0.exe`
- `README.txt`
- `SHA256SUMS.txt`

## Known Limitations

- Search is synchronous, so `stop` cannot interrupt an active search.
- Coach is intentionally single-threaded and does not expose a `Threads`
  option.
- The executable is not code-signed; Windows may show its standard warning for
  an application without an established signing reputation.
