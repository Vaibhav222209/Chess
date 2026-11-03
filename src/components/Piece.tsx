import type { Color, PieceSymbol } from 'chess.js';

interface PieceProps {
  type: PieceSymbol;
  color: Color;
}

/** Original, scalable Staunton silhouettes. All pieces are rendered locally. */
export function Piece({ type, color }: PieceProps) {
  const fill = color === 'w' ? '#fbf8ee' : '#263846';
  const stroke = color === 'w' ? '#455463' : '#111e2a';
  const detail = color === 'w' ? '#c7c8bd' : '#657684';
  const base = (
    <>
      <path d="M29 78 Q50 73 71 78 L76 87 Q50 92 24 87 Z" />
      <path d="M29 83 Q50 87 71 83" fill="none" stroke={detail} strokeWidth="2" />
    </>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      className={`chess-piece piece-${color} piece-${type}`}
      aria-hidden="true"
      focusable="false"
      fill={fill}
      stroke={stroke}
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {type === 'p' && (
        <>
          <circle cx="50" cy="29" r="13" />
          <path d="M38 42 Q50 47 62 42 L65 51 L60 56 Q60 68 69 77 Q50 82 31 77 Q40 68 40 56 L35 51 Z" />
          <path d="M38 51 Q50 55 62 51" fill="none" stroke={detail} strokeWidth="2" />
          {base}
        </>
      )}
      {type === 'r' && (
        <>
          <path d="M28 20 L39 20 L39 29 L45 29 L45 20 L55 20 L55 29 L61 29 L61 20 L72 20 L72 40 L64 47 L64 69 L71 77 Q50 82 29 77 L36 69 L36 47 L28 40 Z" />
          <path d="M30 40 H70 M37 48 H63 M37 69 H63" fill="none" />
          <path d="M42 50 V65" fill="none" stroke={detail} strokeWidth="2" />
          {base}
        </>
      )}
      {type === 'n' && (
        <>
          <path d="M28 77 Q37 66 37 54 L26 59 L18 52 L26 40 L34 31 L36 16 L47 24 Q64 24 72 39 Q81 57 70 78 Z" />
          <path d="M43 32 Q62 33 64 46 Q65 57 52 67 L48 77" fill="none" />
          <path d="M59 32 Q72 42 70 60" fill="none" stroke={detail} strokeWidth="2" />
          <path d="M28 47 L34 46 M38 19 L40 29" fill="none" />
          <circle cx="40" cy="37" r="2" fill={stroke} stroke="none" />
          {base}
        </>
      )}
      {type === 'b' && (
        <>
          <circle cx="50" cy="15" r="5" />
          <path d="M50 21 Q76 42 64 53 L58 57 Q58 68 68 77 Q50 83 32 77 Q42 67 42 57 L36 53 Q25 42 50 21 Z" />
          <path d="M55 29 L46 43" fill="none" strokeWidth="5" />
          <path d="M37 53 Q50 58 63 53 M42 63 H58" fill="none" />
          <path d="M44 71 Q50 73 56 71" fill="none" stroke={detail} strokeWidth="2" />
          {base}
        </>
      )}
      {type === 'q' && (
        <>
          <path d="M25 31 L37 44 L39 24 L50 43 L61 24 L63 44 L75 31 L65 59 Q50 64 35 59 Z" />
          <circle cx="24" cy="27" r="5" />
          <circle cx="39" cy="21" r="5" />
          <circle cx="50" cy="16" r="5" />
          <path d="M50 21 V42" fill="none" />
          <circle cx="61" cy="21" r="5" />
          <circle cx="76" cy="27" r="5" />
          <path d="M36 60 Q50 65 64 60 L61 67 L70 77 Q50 83 30 77 L39 67 Z" />
          <path d="M39 68 Q50 71 61 68" fill="none" stroke={detail} strokeWidth="2" />
          {base}
        </>
      )}
      {type === 'k' && (
        <>
          <path d="M46 12 H54 V19 H62 V26 H54 V36 H46 V26 H38 V19 H46 Z" />
          <path d="M50 38 Q33 26 27 40 Q21 52 36 62 L39 68 L30 77 Q50 83 70 77 L61 68 L64 62 Q79 52 73 40 Q67 26 50 38 Z" />
          <path d="M50 39 V57 M36 62 Q50 67 64 62 M39 68 Q50 72 61 68" fill="none" />
          <path d="M32 42 Q29 49 37 55 M65 41 Q70 48 63 55" fill="none" stroke={detail} strokeWidth="2" />
          {base}
        </>
      )}
    </svg>
  );
}
