"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import sourceEvents from "./events.json";

type EventItem = (typeof sourceEvents)[number];
type Mode = "learn" | "test" | "blockblast" | "charms";
type AnswerStyle = "multiple" | "written";

const modes: { id: Mode; label: string; mark: string; note: string }[] = [
  { id: "learn", label: "Learn", mark: "✦", note: "All events, two ways" },
  { id: "test", label: "Test", mark: "▤", note: "10-question rounds" },
  { id: "blockblast", label: "Block Blast", mark: "◆", note: "Quiz, then 5 moves" },
  { id: "charms", label: "Charms", mark: "⬟", note: "Keep your hearts" },
];

const BLAST_GRID_SIZE = 8;
const QUESTIONS_PER_BLAST = 5;
const BLAST_MOVES = 5;
const PIECE_COLORS = ["#4255ff", "#6c45e9", "#5a58e9", "#34b276", "#e5a500", "#7b4ae8"];

const BLAST_SHAPES: [number, number][][] = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
];

type BlastPiece = {
  id: string;
  cells: [number, number][];
  color: string;
};

function chronologyValue(year: string) {
  const number = Number((year.match(/[\d,]+/)?.[0] ?? "0").replaceAll(",", ""));
  return year.includes("BCE") ? -number : number;
}

const events = [...sourceEvents].sort((a, b) => {
  const byYear = chronologyValue(a.year) - chronologyValue(b.year);
  return byYear || a.sourceOrder - b.sourceOrder;
});

function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function splitIntoRows<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function compactYear(year: string) {
  return year.replace(" CE", "").replace("c. ", "c. ");
}

function optionsFor(item: EventItem, pool: EventItem[], count = 4) {
  const at = pool.findIndex((event) => event.title === item.title);
  const offsets = [0, 7, 17, 31, 43, 58];
  const values = offsets
    .map((offset) => pool[(at + offset + pool.length) % pool.length].year)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, count);
  const turn = Math.abs(at) % values.length;
  return [...values.slice(turn), ...values.slice(0, turn)];
}

function answerMatches(value: string, item: EventItem) {
  const clean = (text: string) => text.toLowerCase().replaceAll(",", "").replace(/\bc\.?\s*/g, "").trim();
  const expected = clean(item.year);
  const given = clean(value);
  const firstNumber = expected.match(/\d+/)?.[0];
  if (!firstNumber) return given === expected;
  return given === expected || (given.includes(firstNumber) && (!expected.includes("bce") || given.includes("bce")));
}

function createEmptyGrid() {
  return Array.from({ length: BLAST_GRID_SIZE }, () => Array<string | null>(BLAST_GRID_SIZE).fill(null));
}

function randomPieces(count = 3) {
  return Array.from({ length: count }, (_, index) => {
    const cells = BLAST_SHAPES[Math.floor(Math.random() * BLAST_SHAPES.length)];
    return {
      id: `${Date.now()}-${index}-${Math.random()}`,
      cells,
      color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)],
    } satisfies BlastPiece;
  });
}

function canPlacePiece(grid: (string | null)[][], cells: [number, number][], row: number, col: number) {
  return cells.every(([dy, dx]) => {
    const y = row + dy;
    const x = col + dx;
    return y >= 0 && y < BLAST_GRID_SIZE && x >= 0 && x < BLAST_GRID_SIZE && grid[y][x] === null;
  });
}

function placePiece(grid: (string | null)[][], cells: [number, number][], row: number, col: number, color: string) {
  const next = grid.map((line) => [...line]);
  cells.forEach(([dy, dx]) => {
    next[row + dy][col + dx] = color;
  });
  return next;
}

function clearCompletedLines(grid: (string | null)[][]) {
  let cleared = 0;
  const next = grid.map((line) => [...line]);
  for (let row = 0; row < BLAST_GRID_SIZE; row++) {
    if (next[row].every((cell) => cell !== null)) {
      next[row] = Array<string | null>(BLAST_GRID_SIZE).fill(null);
      cleared += 1;
    }
  }
  for (let col = 0; col < BLAST_GRID_SIZE; col++) {
    if (next.every((line) => line[col] !== null)) {
      for (let row = 0; row < BLAST_GRID_SIZE; row++) next[row][col] = null;
      cleared += 1;
    }
  }
  return { grid: next, cleared };
}

function pieceFitsAnywhere(grid: (string | null)[][], cells: [number, number][]) {
  for (let row = 0; row < BLAST_GRID_SIZE; row++) {
    for (let col = 0; col < BLAST_GRID_SIZE; col++) {
      if (canPlacePiece(grid, cells, row, col)) return true;
    }
  }
  return false;
}

function useShuffledDeck() {
  const [deck, setDeck] = useState(() => shuffleArray(events));
  const reshuffle = () => setDeck(shuffleArray(events));
  return { deck, reshuffle };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("learn");
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [era, setEra] = useState("All eras");
  const timelineRows = useMemo(() => splitIntoRows(events, 7), []);
  const timelineRef = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return events.filter((event) => {
      const inEra = era === "All eras" || event.era === era;
      const inSearch = !needle || `${event.title} ${event.year} ${event.description}`.toLowerCase().includes(needle);
      return inEra && inSearch;
    });
  }, [search, era]);

  function navigateTimeline(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(events.length - 1, timelineIndex + moves[event.key]));
    setTimelineIndex(next);
    const node = timelineRef.current?.querySelector<HTMLElement>(`[data-timeline-index="${next}"]`);
    node?.focus();
    node?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  const activeMode = modes.find((item) => item.id === mode);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Chronicle home">
          <span className="brand-mark">C</span>
          <span>Chronicle</span>
        </a>
        <nav aria-label="Page sections">
          <a href="#timeline">Timeline</a>
          <a href="#study">Study</a>
          <a href="#library">All events</a>
        </nav>
        <span className="event-count">{events.length} events</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> World history, in order</div>
        <h1>Know what happened.<br /><em>Remember when.</em></h1>
        <p>Move through 12,000 years of history, study every turning point, and test what you know.</p>
        <div className="hero-actions">
          <a className="primary-button" href="#study">Start studying <span>→</span></a>
          <a className="quiet-button" href="#timeline">Explore the timeline</a>
        </div>
        <div className="hero-facts" aria-label="Study set summary">
          <span><strong>{events.length}</strong> events</span>
          <span><strong>4</strong> study modes</span>
          <span><strong>c. 10,000 BCE</strong> to <strong>{events[events.length - 1].year}</strong></span>
        </div>
      </section>

      <section className="timeline-section" id="timeline">
        <div className="section-heading">
          <div>
            <span className="section-kicker">The long view</span>
            <h2>A serpentine timeline</h2>
          </div>
          <p>Hover over a year to reveal the event. Focus the timeline and use your arrow keys to travel through history.</p>
        </div>
        <div
          className="timeline-shell"
          ref={timelineRef}
          onKeyDown={navigateTimeline}
          role="group"
          aria-label="Chronological timeline. Use arrow keys to move between events."
        >
          {timelineRows.map((row, rowIndex) => (
            <div className={`timeline-row ${rowIndex % 2 ? "reverse" : ""}`} key={rowIndex}>
              {row.map((item) => {
                const index = events.indexOf(item);
                return (
                  <button
                    key={item.title}
                    className={`timeline-node ${timelineIndex === index ? "active" : ""}`}
                    data-timeline-index={index}
                    tabIndex={timelineIndex === index ? 0 : -1}
                    onFocus={() => setTimelineIndex(index)}
                    onClick={() => {
                      setMode("learn");
                      document.querySelector("#study")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    aria-label={`${item.year}: ${item.title}`}
                  >
                    <span className="timeline-year">{compactYear(item.year)}</span>
                    <span className="timeline-dot" />
                    <span className="timeline-tooltip"><b>{item.title}</b><small>{item.exactDate || item.year}</small></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="timeline-key"><span>←</span><span>→</span><span>↑</span><span>↓</span> Navigate timeline</div>
      </section>

      <section className="study-section" id="study">
        <div className="section-heading light-heading">
          <div>
            <span className="section-kicker">Make it stick</span>
            <h2>Study your way</h2>
          </div>
          <p>Learn, test, blast blocks, and collect charms. Every mode draws from the complete set of {events.length} events.</p>
        </div>

        <div className="study-app">
          <aside className="mode-rail" aria-label="Study modes">
            {modes.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? "selected" : ""}
                onClick={() => setMode(item.id)}
              >
                <span className={`mode-mark ${item.id}`}>{item.mark}</span>
                <span><b>{item.label}</b><small>{item.note}</small></span>
              </button>
            ))}
          </aside>

          <div className="study-workspace">
            <div className="workspace-topbar">
              <div>
                <span className="workspace-label">World history</span>
                <h3>{activeMode?.label}</h3>
              </div>
              <span className="progress-pill">All {events.length} events</span>
            </div>

            {mode === "learn" && <QuestionRound kind="Learn" limit={events.length} />}
            {mode === "test" && <QuestionRound kind="Test" limit={10} />}
            {mode === "blockblast" && <BlockBlastGame />}
            {mode === "charms" && <CharmsGame />}
          </div>
        </div>
      </section>

      <section className="library-section" id="library">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Complete reference</span>
            <h2>All {events.length} events</h2>
          </div>
          <p>The full source list, arranged chronologically from the Neolithic Revolution to the invention of the iPhone.</p>
        </div>

        <div className="library-tools">
          <label className="search-box">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, years, or descriptions" />
          </label>
          <select value={era} onChange={(event) => setEra(event.target.value)} aria-label="Filter by era">
            <option>All eras</option>
            {[...new Set(events.map((event) => event.era))].map((item) => <option key={item}>{item}</option>)}
          </select>
          <span className="result-count">{filteredEvents.length} shown</span>
        </div>

        <ol className="event-list">
          {filteredEvents.map((event) => (
            <li key={event.title}>
              <span className="list-number">{String(events.indexOf(event) + 1).padStart(2, "0")}</span>
              <article>
                <div className="event-title-line">
                  <h3>{event.title}</h3>
                  <span>{event.year}</span>
                </div>
                <p className="exact-date"><b>Exact date</b> {event.exactDate || "See event description"}</p>
                <p>{event.description}</p>
              </article>
            </li>
          ))}
        </ol>
        {filteredEvents.length === 0 && <div className="empty-state">No events match that search.</div>}
      </section>

      <footer>
        <span className="brand"><span className="brand-mark">C</span><span>Chronicle</span></span>
        <p>{events.length} turning points · one continuous story</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}

function QuestionRound({ kind, limit }: { kind: "Learn" | "Test"; limit: number }) {
  const { deck, reshuffle } = useShuffledDeck();
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [style, setStyle] = useState<AnswerStyle>("multiple");
  const [choice, setChoice] = useState("");
  const [written, setWritten] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const total = Math.min(limit, deck.length);
  const item = deck[index];
  const finished = index >= total;

  function check(value: string) {
    if (result || finished) return;
    const right = answerMatches(value, item);
    setResult(right ? "correct" : "wrong");
    if (right) setScore((current) => current + 1);
  }

  function next() {
    if (index + 1 >= total) {
      setIndex(total);
      setResult(null);
      return;
    }
    setIndex((current) => current + 1);
    setChoice("");
    setWritten("");
    setResult(null);
  }

  function restart() {
    reshuffle();
    setIndex(0);
    setScore(0);
    setChoice("");
    setWritten("");
    setResult(null);
  }

  if (finished) {
    return (
      <div className="quiz-panel">
        <div className="game-over">
          <span className="question-label">{kind} complete</span>
          <h4>{score} of {total} correct</h4>
          <p>You worked through every question in this shuffled round.</p>
          <button className="primary-button" onClick={restart}>Play another round →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-panel">
      <div className="quiz-meta">
        <span>Question {index + 1} of {total}</span>
        <span>{score} correct</span>
      </div>
      <div className="quiz-progress"><span style={{ width: `${((index + 1) / total) * 100}%` }} /></div>
      <div className="answer-style" role="group" aria-label="Answer style">
        <button className={style === "multiple" ? "active" : ""} onClick={() => { setStyle("multiple"); setResult(null); }}>Multiple choice</button>
        <button className={style === "written" ? "active" : ""} onClick={() => { setStyle("written"); setResult(null); }}>Written answer</button>
      </div>
      <span className="question-label">{kind === "Test" ? "Choose the correct year" : "Recall the date"}</span>
      <h4>{item.title}</h4>
      {style === "multiple" ? (
        <div className="choice-grid">
          {optionsFor(item, deck).map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => { setChoice(option); check(option); }}
              className={`${choice === option ? "chosen" : ""} ${result && option === item.year ? "right" : ""} ${result === "wrong" && choice === option ? "wrong-choice" : ""}`}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
            </button>
          ))}
        </div>
      ) : (
        <form className="written-form" onSubmit={(event) => { event.preventDefault(); check(written); }}>
          <input value={written} onChange={(event) => setWritten(event.target.value)} placeholder="Type the year, including BCE when needed" />
          <button type="submit">Check answer</button>
        </form>
      )}
      {result && (
        <div className={`feedback ${result}`}>
          <div><b>{result === "correct" ? "Exactly right" : "Not quite"}</b><span>{item.year} · {item.exactDate}</span></div>
          <button onClick={next}>Next →</button>
        </div>
      )}
    </div>
  );
}

function BlockBlastGame() {
  const { deck, reshuffle } = useShuffledDeck();
  const [phase, setPhase] = useState<"questions" | "blast">("questions");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionsThisRound, setQuestionsThisRound] = useState(0);
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [grid, setGrid] = useState(createEmptyGrid);
  const [pieces, setPieces] = useState<BlastPiece[]>(() => randomPieces());
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [movesLeft, setMovesLeft] = useState(BLAST_MOVES);
  const [linesCleared, setLinesCleared] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const item = deck[questionIndex];
  const questionsUntilBlast = QUESTIONS_PER_BLAST - questionsThisRound;

  function checkAnswer(option: string) {
    if (result || finished || phase !== "questions") return;
    const right = answerMatches(option, item);
    setResult(right ? "correct" : "wrong");
    if (right) setScore((value) => value + 1);
  }

  function advanceQuestion() {
    const nextQuestionIndex = questionIndex + 1;
    const nextQuestionsThisRound = questionsThisRound + 1;

    if (nextQuestionIndex >= deck.length) {
      setFinished(true);
      setResult(null);
      return;
    }

    if (nextQuestionsThisRound >= QUESTIONS_PER_BLAST) {
      setQuestionIndex(nextQuestionIndex);
      setQuestionsThisRound(0);
      setPhase("blast");
      setMovesLeft(BLAST_MOVES);
      setPieces(randomPieces());
      setSelectedPieceId(null);
      setResult(null);
      setChoice("");
      return;
    }

    setQuestionIndex(nextQuestionIndex);
    setQuestionsThisRound(nextQuestionsThisRound);
    setResult(null);
    setChoice("");
  }

  function placeOnGrid(row: number, col: number) {
    if (phase !== "blast" || !selectedPieceId || movesLeft <= 0) return;
    const piece = pieces.find((entry) => entry.id === selectedPieceId);
    if (!piece || !canPlacePiece(grid, piece.cells, row, col)) return;

    const placed = placePiece(grid, piece.cells, row, col, piece.color);
    const { grid: clearedGrid, cleared } = clearCompletedLines(placed);
    const remainingPieces = pieces.filter((entry) => entry.id !== selectedPieceId);
    const nextMoves = movesLeft - 1;

    setGrid(clearedGrid);
    setLinesCleared((value) => value + cleared);
    setScore((value) => value + cleared * 10);
    setMovesLeft(nextMoves);
    setSelectedPieceId(null);
    setPieces(remainingPieces.length ? remainingPieces : randomPieces());

    if (nextMoves <= 0) finishBlastRound();
  }

  function finishBlastRound() {
    setPhase("questions");
    setQuestionsThisRound(0);
    setSelectedPieceId(null);
    setMovesLeft(BLAST_MOVES);
    setPieces(randomPieces());

    if (questionIndex >= deck.length - 1) {
      setFinished(true);
    }
  }

  function restart() {
    reshuffle();
    setPhase("questions");
    setQuestionIndex(0);
    setQuestionsThisRound(0);
    setChoice("");
    setResult(null);
    setGrid(createEmptyGrid());
    setPieces(randomPieces());
    setSelectedPieceId(null);
    setMovesLeft(BLAST_MOVES);
    setLinesCleared(0);
    setScore(0);
    setFinished(false);
  }

  const selectedPiece = pieces.find((entry) => entry.id === selectedPieceId) ?? null;
  const anyPieceFits = pieces.some((piece) => pieceFitsAnywhere(grid, piece.cells));

  if (finished) {
    return (
      <div className="blast-game">
        <div className="blast-score">
          <span><b>{score}</b> score</span>
          <span><b>{linesCleared}</b> lines</span>
          <span><b>{deck.length}</b> events</span>
        </div>
        <div className="blast-core">
          <div className="game-over">
            <span className="question-label">Block Blast complete</span>
            <h4>You cleared the full shuffled deck</h4>
            <button className="primary-button" onClick={restart}>Play again →</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "questions") {
    return (
      <div className="blast-game">
        <div className="blast-score">
          <span><b>{questionIndex + 1}</b> of {deck.length}</span>
          <span><b>{questionsUntilBlast}</b> until blast</span>
          <span><b>{score}</b> score</span>
        </div>
        <div className="blast-core">
          <span className="question-label">Answer 5 questions to unlock Block Blast</span>
          <h4>{item.title}</h4>
          <div className="choice-grid">
            {optionsFor(item, deck).map((option, optionIndex) => (
              <button
                key={option}
                onClick={() => { setChoice(option); checkAnswer(option); }}
                className={`${choice === option ? "chosen" : ""} ${result && option === item.year ? "right" : ""}`}
                disabled={Boolean(result)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
              </button>
            ))}
          </div>
          {result && (
            <div className={`feedback ${result}`}>
              <div><b>{result === "correct" ? "Exactly right" : "Not quite"}</b><span>{item.year} · {item.exactDate}</span></div>
              <button onClick={advanceQuestion}>{questionsThisRound + 1 >= QUESTIONS_PER_BLAST ? "Start Block Blast →" : "Next question →"}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="blast-game">
      <div className="blast-score">
        <span><b>{movesLeft}</b> moves left</span>
        <span><b>{linesCleared}</b> lines cleared</span>
        <span><b>{score}</b> score</span>
      </div>
      <div className="blast-core block-blast-board">
        <div className="block-blast-header">
          <div>
            <span className="question-label">Block Blast unlocked</span>
            <p>Place {BLAST_MOVES} blocks to clear rows and columns, then return to the quiz.</p>
          </div>
          {!anyPieceFits && (
            <button className="quiet-button" onClick={finishBlastRound}>Skip to next questions</button>
          )}
        </div>

        <div className="blast-grid" role="grid" aria-label="Block Blast board">
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const preview =
                selectedPiece &&
                canPlacePiece(grid, selectedPiece.cells, rowIndex, colIndex);
              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  className={`blast-cell ${cell ? "filled" : ""} ${preview ? "preview" : ""}`}
                  style={cell ? { background: cell } : undefined}
                  onClick={() => placeOnGrid(rowIndex, colIndex)}
                  aria-label={cell ? "Filled cell" : "Empty cell"}
                />
              );
            }),
          )}
        </div>

        <div className="blast-tray" aria-label="Available blocks">
          {pieces.map((piece) => (
            <button
              key={piece.id}
              className={`blast-piece ${selectedPieceId === piece.id ? "selected" : ""} ${pieceFitsAnywhere(grid, piece.cells) ? "" : "disabled"}`}
              onClick={() => setSelectedPieceId(piece.id)}
              disabled={!pieceFitsAnywhere(grid, piece.cells)}
            >
              <span
                className="blast-piece-grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(...piece.cells.map(([, col]) => col)) + 1}, 16px)`,
                }}
              >
                {renderPieceCells(piece)}
              </span>
            </button>
          ))}
        </div>

        <div className="blast-actions">
          <button className="primary-button" onClick={finishBlastRound}>Finish blast round →</button>
        </div>
      </div>
    </div>
  );
}

function renderPieceCells(piece: BlastPiece) {
  const maxRow = Math.max(...piece.cells.map(([row]) => row));
  const maxCol = Math.max(...piece.cells.map(([, col]) => col));
  const cells = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      const filled = piece.cells.some(([r, c]) => r === row && c === col);
      cells.push(
        <span
          key={`${piece.id}-${row}-${col}`}
          className={`blast-mini-cell ${filled ? "filled" : ""}`}
          style={filled ? { background: piece.color } : undefined}
        />,
      );
    }
  }
  return cells;
}

function CharmsGame() {
  const { deck, reshuffle } = useShuffledDeck();
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [charms, setCharms] = useState(0);
  const item = deck[index];
  const finished = hearts === 0 || index >= deck.length;

  function choose(option: string) {
    if (finished) return;
    if (option === item.year) {
      setCharms((value) => value + 1);
      setIndex((value) => value + 1);
    } else {
      setHearts((value) => Math.max(0, value - 1));
    }
  }

  function reset() {
    reshuffle();
    setHearts(3);
    setCharms(0);
    setIndex(0);
  }

  return (
    <div className="charms-game">
      <div className="charms-header">
        <span className="charm-gem">⬟</span>
        <div>
          <b>{charms} charms</b>
          <span>Question {Math.min(index + 1, deck.length)} of {deck.length} · every event, shuffled</span>
        </div>
        <span className="hearts">{"♥".repeat(hearts)}{"♡".repeat(3 - hearts)}</span>
      </div>
      {!finished ? (
        <div className="charm-question">
          <span className="question-label">Protect your hearts</span>
          <h4>{item.title}</h4>
          <div className="choice-grid">
            {optionsFor(item, deck).map((option) => (
              <button key={option} onClick={() => choose(option)}>{option}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="game-over">
          <span className="charm-gem">⬟</span>
          <h4>{hearts ? `You collected ${charms} charms` : `Run ended with ${charms} charms`}</h4>
          <p>{index >= deck.length ? "You made it through the full shuffled deck." : "You ran out of hearts before finishing the deck."}</p>
          <button className="primary-button" onClick={reset}>Try another run</button>
        </div>
      )}
    </div>
  );
}
