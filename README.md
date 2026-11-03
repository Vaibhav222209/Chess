# Thakur Chess Club

An aesthetic chess game designed and built by **Vaibhav Thakur**. A quiet, club-inspired interface meets a serious, on-device chess engine.

## Play and study

- **Stockfish 17.1**: a local WebAssembly opponent with 21 skill settings. Master uses the engine's highest skill setting; actual playing strength depends on device speed and search time.
- **Local two-player**: play a friend on the same device.
- **Complete legal moves**: check, castling, en passant, all four promotion choices, checkmate, stalemate, repetition, fifty-move draws, and insufficient material through chess.js.
- **Chess clocks**: blitz, rapid, classical, and unlimited controls, with increments, time forfeits, and resignation.
- **Analysis**: White-perspective evaluations, search depth, best lines, and optional hints.
- **Study tools**: move-by-move review, takebacks, board flip, PGN download/import, and FEN copy/import.
- **Thoughtful details**: original SVG pieces, keyboard board navigation, accessible dialogs, optional synthesized move sounds, responsive layout, and saved games on your device.

Games are **unrated practice**. This is a browser-only app; it has no accounts, server, online matchmaking, or remote multiplayer. Hints and takebacks are available for learning. A reload restores the game with clocks paused until you choose Resume. Takebacks retain the current clocks. Time continues during review, analysis, and dialogs. Imported positions open as untimed local boards.

## Development

Requires Node.js **22.12+** (Node 24 is used in the cloud environment) and npm. No environment variables, secrets, database, or external service accounts are needed.

```sh
cd /workspace/Chess
npm ci
npm run dev -- --port 5173 --strictPort
```

`npm ci` runs `postinstall`, which copies the pinned Stockfish single-threaded lite loader, 7 MB WASM file, and license/source notices into `public/engine/`. These generated assets are ignored by Git. If lifecycle scripts were disabled, run `npm run prepare:engine` before starting or building. The browser downloads the engine from this app's origin, and no external CDN or cross-origin isolation headers are required.

```sh
npm run build       # TypeScript check and production bundle in dist/
npm run preview     # Serve the production bundle
npm test            # Rules, history, notation, and engine lifecycle unit tests
npm run test:e2e    # Real Chromium functional tests, including the WASM engine
```

The browser suite uses system Chromium at `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to your Chromium/Chrome executable if it is installed elsewhere. Tests start their own Vite server or reuse an existing development server on port 5173. The suite covers engine replies, illegal moves, checkmate, underpromotion, both castling sides, en passant, history, export/import, persistence, and mobile layout.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Game session, clocks, player controls, history, and dialogs |
| `src/components/ChessBoard.tsx` | Accessible board and keyboard navigation |
| `src/components/Piece.tsx` | Original SVG chess set |
| `src/engine.ts` | UCI worker lifecycle, search cancellation, and analysis |
| `src/game.ts` | Results, notation, timelines, and clock formatting |
| `src/styles.css` | Responsive visual design |
| `scripts/prepare-engine.mjs` | Repeatable preparation of pinned engine assets |

## Deployment and credits

Run `npm ci && npm run build` and serve `dist/` as static files. Preserve the `engine/` directory, WASM MIME type, and license/source notices. A secure origin enables the clipboard API; when clipboard access is unavailable, Copy FEN opens a selectable text fallback.

Created by **Vaibhav Thakur**. Original app code is licensed under **GPL-3.0-only**; see [LICENSE](LICENSE). Stockfish.js is GPLv3. Engine authors, license, and corresponding source/build links are generated at `public/engine/AUTHORS`, `Copying.txt`, and `SOURCE.md`, with a link in the app footer. Dependency notices are collected in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
