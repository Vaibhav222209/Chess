import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { Piece } from './Piece';

export interface ChessBoardProps {
  fen: string;
  orientation: Color;
  selected: Square | null;
  legalTargets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  disabled: boolean;
  onSquareClick: (square: Square) => void;
}

const names: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

function readPosition(fen: string) {
  const pieces = new Map<Square, { type: PieceSymbol; color: Color }>();
  fen.split(' ')[0].split('/').forEach((rank, row) => {
    let file = 0;
    for (const char of rank) {
      if (/\d/.test(char)) file += Number(char);
      else {
        pieces.set(`${'abcdefgh'[file]}${8 - row}` as Square, {
          type: char.toLowerCase() as PieceSymbol,
          color: char === char.toUpperCase() ? 'w' : 'b',
        });
        file += 1;
      }
    }
  });
  return pieces;
}

export function ChessBoard({ fen, orientation, selected, legalTargets, lastMove, checkSquare, disabled, onSquareClick }: ChessBoardProps) {
  const files = orientation === 'w' ? 'abcdefgh' : 'hgfedcba';
  const ranks = orientation === 'w' ? '87654321' : '12345678';
  const position = readPosition(fen);
  const [focused, setFocused] = useState<Square>('e2');
  const buttons = useRef(new Map<Square, HTMLButtonElement>());

  function navigate(event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(7, row + offset[0]));
    const nextCol = Math.max(0, Math.min(7, col + offset[1]));
    const square = `${files[nextCol]}${ranks[nextRow]}` as Square;
    setFocused(square);
    buttons.current.get(square)?.focus();
  }

  return (
    <div className="board-shell">
      <div className="chessboard" role="group" aria-label={`Chessboard, ${orientation === 'w' ? 'white' : 'black'} at bottom. Use arrow keys to navigate and Enter to select a square.`}>
        {[...ranks].flatMap((rank, row) => [...files].map((file, col) => {
          const square = `${file}${rank}` as Square;
          const piece = position.get(square);
          const isLegal = legalTargets.includes(square);
          const isLastMove = lastMove?.from === square || lastMove?.to === square;
          const isCheck = checkSquare === square;
          const description = piece ? `${piece.color === 'w' ? 'white' : 'black'} ${names[piece.type]}` : 'empty';
          const className = ['square', (row + col) % 2 === 0 ? 'light' : 'dark', selected === square && 'selected', isLastMove && 'last-move', isCheck && 'in-check', isLegal && 'legal-target'].filter(Boolean).join(' ');

          return (
            <button
              key={square}
              ref={(element) => { if (element) buttons.current.set(square, element); else buttons.current.delete(square); }}
              type="button"
              className={className}
              data-square={square}
              style={{ '--square-row': row, '--square-col': col } as CSSProperties}
              aria-label={`${square} ${description}${isCheck ? ', in check' : ''}${isLegal ? ', legal move' : ''}`}
              aria-pressed={selected === square}
              disabled={disabled}
              tabIndex={focused === square ? 0 : -1}
              onFocus={() => setFocused(square)}
              onKeyDown={(event) => navigate(event, row, col)}
              onClick={() => onSquareClick(square)}
            >
              {col === 0 && <span className="coordinate rank" aria-hidden="true">{rank}</span>}
              {row === 7 && <span className="coordinate file" aria-hidden="true">{file}</span>}
              {piece && <Piece {...piece} />}
              {isLegal && <span className={piece ? 'capture-ring' : 'legal-dot'} aria-hidden="true" />}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

export default ChessBoard;
