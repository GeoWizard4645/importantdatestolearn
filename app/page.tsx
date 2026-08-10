"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import sourceEvents from "./events.json";

type EventItem = (typeof sourceEvents)[number];
type Mode = "flashcards" | "learn" | "test" | "blockblast" | "charms";
type AnswerStyle = "multiple" | "written";

const TEST_QUESTION_COUNT = 20;

const modes: { id: Mode; label: string; mark: string; note: string }[] = [
  { id: "flashcards", label: "Flashcards", mark: "▰", note: "Flip and review" },
  { id: "learn", label: "Learn", mark: "✦", note: "Unlimited practice" },
  { id: "test", label: "Test", mark: "▤", note: "20-question rounds" },
  { id: "blockblast", label: "Block Blast", mark: "◆", note: "Quiz, then drag blocks" },
  { id: "charms", label: "Charms", mark: "⬟", note: "Streaks & hearts" },
];

const BLAST_GRID_SIZE = 8;
const QUESTIONS_PER_BLAST = 5;
const BLAST_MOVES = 5;
const WRONG_PENALTY = 5;
const LEARN_HIGH_SCORE_KEY = "chronicle-learn-high-score";
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

function findAnchorForCell(grid: (string | null)[][], cells: [number, number][], targetRow: number, targetCol: number) {
  for (const [dy, dx] of cells) {
    const anchorRow = targetRow - dy;
    const anchorCol = targetCol - dx;
    if (canPlacePiece(grid, cells, anchorRow, anchorCol)) {
      return { row: anchorRow, col: anchorCol };
    }
  }
  return null;
}

function pieceCellsAtAnchor(cells: [number, number][], anchorRow: number, anchorCol: number) {
  return cells.map(([dy, dx]) => [anchorRow + dy, anchorCol + dx] as [number, number]);
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
  const reshuffle = () => {
    const next = shuffleArray(events);
    setDeck(next);
    return next;
  };
  return { deck, reshuffle };
}

function readLearnHighScore() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LEARN_HIGH_SCORE_KEY);
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function saveLearnHighScore(value: number) {
  window.localStorage.setItem(LEARN_HIGH_SCORE_KEY, String(value));
}

function QuizChoiceGrid({
  item,
  choice,
  result,
  eliminated,
  onChoose,
}: {
  item: EventItem;
  choice: string;
  result: "correct" | "wrong" | null;
  eliminated: Set<string>;
  onChoose: (option: string) => void;
}) {
  return (
    <div className="choice-grid">
      {optionsFor(item, events).map((option, optionIndex) => {
        const isEliminated = eliminated.has(option);
        const showWrong = result === "wrong" && choice === option;
        const showRight = result === "correct" && option === item.year;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (result || isEliminated) return;
              onChoose(option);
            }}
            disabled={Boolean(result) || isEliminated}
            className={[
              choice === option && result ? "chosen" : "",
              showRight ? "right" : "",
              showWrong ? "wrong-choice" : "",
              isEliminated ? "eliminated" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{String.fromCharCode(65 + optionIndex)}</span>
            <em>{option}</em>
            {(showWrong || isEliminated) && <i className="choice-x" aria-hidden>✕</i>}
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("flashcards");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [deck, setDeck] = useState(events);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [era, setEra] = useState("All eras");
  const card = deck[cardIndex];
  const timelineRows = useMemo(() => splitIntoRows(events, 7), []);
  const timelineRef = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return events.filter((event) => {
      const inEra = era === "All eras" || event.era === era;
      const inSearch = !needle || `${event.title} ${event.year} ${event.description} ${event.simpleExplanation}`.toLowerCase().includes(needle);
      return inEra && inSearch;
    });
  }, [search, era]);

  function moveCard(direction: number) {
    setCardIndex((current) => (current + direction + deck.length) % deck.length);
    setFlipped(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (mode !== "flashcards") return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveCard(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveCard(-1);
      }
      if (event.key === " " || event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, deck.length]);

  function shuffleDeck() {
    const next = shuffleArray(deck);
    setDeck(next);
    setCardIndex(0);
    setFlipped(false);
  }

  function toggleStar() {
    setStarred((current) => {
      const next = new Set(current);
      if (next.has(card.title)) next.delete(card.title);
      else next.add(card.title);
      return next;
    });
  }

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
          <span><strong>5</strong> study modes</span>
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
                      const deckIndex = deck.findIndex((entry) => entry.title === item.title);
                      setCardIndex(deckIndex >= 0 ? deckIndex : events.indexOf(item));
                      setFlipped(false);
                      setMode("flashcards");
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
          <p>Flashcards, learn, test, blast blocks, and collect charms. Every mode draws from the complete set of {events.length} events.</p>
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
              <span className="progress-pill">
                {mode === "flashcards" ? `${cardIndex + 1} / ${deck.length}` : `All ${events.length} events`}
              </span>
            </div>

            {mode === "flashcards" && (
              <div className="flashcard-mode">
                <div className="card-stack">
                  <button
                    className={`flashcard ${flipped ? "is-flipped" : ""}`}
                    onClick={() => setFlipped((value) => !value)}
                    aria-label={flipped ? "Showing answer. Flip to event." : "Showing event. Flip to answer."}
                  >
                    <span className="card-face card-front">
                      <span className="card-prompt">What year was this?</span>
                      <strong>{card.title}</strong>
                      <span className="tap-hint">Click or press space to flip</span>
                    </span>
                    <span className="card-face card-back">
                      <span className="answer-year">{card.year}</span>
                      <span className="answer-date">{card.exactDate || "Date noted in the description"}</span>
                      <span className="answer-divider" />
                      <span className="answer-description">{card.description}</span>
                    </span>
                  </button>
                </div>
                <div className="card-controls">
                  <button className="circle-button" onClick={() => moveCard(-1)} aria-label="Previous card">←</button>
                  <div className="card-progress"><span style={{ width: `${((cardIndex + 1) / deck.length) * 100}%` }} /></div>
                  <button className="circle-button" onClick={() => moveCard(1)} aria-label="Next card">→</button>
                </div>
                <div className="deck-tools">
                  <button onClick={shuffleDeck}>↝ Shuffle</button>
                  <button onClick={toggleStar} className={starred.has(card.title) ? "starred" : ""}>☆ {starred.has(card.title) ? "Starred" : "Star"}</button>
                  <span>Arrow keys move · Space flips</span>
                </div>
              </div>
            )}

            {mode === "learn" && <QuestionRound kind="Learn" limit={events.length} />}
            {mode === "test" && <QuestionRound kind="Test" limit={TEST_QUESTION_COUNT} />}
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
                <p className="simple-explanation"><b>In simpler terms</b> {event.simpleExplanation}</p>
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
  const unlimited = kind === "Learn";
  const { deck, reshuffle } = useShuffledDeck();
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [missedCurrent, setMissedCurrent] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [style, setStyle] = useState<AnswerStyle>("multiple");
  const [choice, setChoice] = useState("");
  const [written, setWritten] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(() => new Set());
  const total = Math.min(limit, deck.length);
  const item = deck[index];
  const finished = !unlimited && index >= total;
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;

  useEffect(() => {
    if (unlimited) setHighScore(readLearnHighScore());
  }, [unlimited]);

  function clearPromptState() {
    setChoice("");
    setWritten("");
    setResult(null);
    setEliminated(new Set());
    setMissedCurrent(false);
  }

  function check(value: string) {
    if (result || finished || eliminated.has(value)) return;
    const right = answerMatches(value, item);
    setChoice(value);
    if (right) {
      setResult("correct");
      if (!unlimited) setScore((current) => current + 1);
      return;
    }
    setResult("wrong");
    setMissedCurrent(true);
    setEliminated((current) => new Set(current).add(value));
  }

  function retry() {
    setResult(null);
    setChoice("");
    setWritten("");
  }

  function next() {
    if (unlimited) {
      setAnswered((current) => current + 1);
      if (!missedCurrent) setCorrectCount((current) => current + 1);
      if (index + 1 >= deck.length) {
        reshuffle();
        setIndex(0);
      } else {
        setIndex((current) => current + 1);
      }
      clearPromptState();
      return;
    }

    if (index + 1 >= total) {
      setIndex(total);
      setResult(null);
      return;
    }
    setIndex((current) => current + 1);
    clearPromptState();
  }

  function restart() {
    if (unlimited) {
      const nextHigh = Math.max(highScore, accuracy);
      if (nextHigh > highScore) {
        saveLearnHighScore(nextHigh);
        setHighScore(nextHigh);
      }
      setAnswered(0);
      setCorrectCount(0);
    }
    reshuffle();
    setIndex(0);
    setScore(0);
    clearPromptState();
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
        {unlimited ? (
          <>
            <span>Question {answered + 1}</span>
            <span>{accuracy}% accuracy · Best {highScore}%</span>
          </>
        ) : (
          <>
            <span>Question {index + 1} of {total}</span>
            <span>{score} correct</span>
          </>
        )}
      </div>
      {unlimited ? (
        <div className="quiz-meta-actions">
          <div className="quiz-progress"><span style={{ width: `${accuracy}%` }} /></div>
          <button type="button" className="score-reset" onClick={restart}>Reset & save best</button>
        </div>
      ) : (
        <div className="quiz-progress"><span style={{ width: `${((index + 1) / total) * 100}%` }} /></div>
      )}
      <div className="answer-style" role="group" aria-label="Answer style">
        <button className={style === "multiple" ? "active" : ""} onClick={() => { setStyle("multiple"); setResult(null); setChoice(""); }}>Multiple choice</button>
        <button className={style === "written" ? "active" : ""} onClick={() => { setStyle("written"); setResult(null); setChoice(""); }}>Written answer</button>
      </div>
      <span className="question-label">{kind === "Test" ? "Choose the correct year" : "Recall the date"}</span>
      <h4>{item.title}</h4>
      {style === "multiple" ? (
        <QuizChoiceGrid
          item={item}
          choice={choice}
          result={result}
          eliminated={eliminated}
          onChoose={check}
        />
      ) : (
        <form className="written-form" onSubmit={(event) => { event.preventDefault(); check(written); }}>
          <input value={written} onChange={(event) => setWritten(event.target.value)} placeholder="Type the year, including BCE when needed" disabled={Boolean(result)} />
          <button type="submit" disabled={Boolean(result)}>Check answer</button>
        </form>
      )}
      {result === "correct" && (
        <div className="feedback correct">
          <div><b>Exactly right</b><span>{item.year} · {item.exactDate}</span></div>
          <button type="button" onClick={next}>Next →</button>
        </div>
      )}
      {result === "wrong" && (
        <div className="feedback wrong">
          <div>
            <b>Not quite</b>
            <span>{unlimited ? "That choice is out · accuracy takes a hit" : "That choice is out · try again"}</span>
          </div>
          <button type="button" onClick={retry}>Retry</button>
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
  const [answered, setAnswered] = useState(0);
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(() => new Set());
  const [grid, setGrid] = useState(createEmptyGrid);
  const [pieces, setPieces] = useState<BlastPiece[]>(() => randomPieces());
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [movesLeft, setMovesLeft] = useState(BLAST_MOVES);
  const [linesCleared, setLinesCleared] = useState(0);
  const [piecesPlaced, setPiecesPlaced] = useState(0);
  const [score, setScore] = useState(0);

  const item = deck[questionIndex];
  const questionsUntilBlast = QUESTIONS_PER_BLAST - questionsThisRound;

  function clearQuestionState() {
    setChoice("");
    setResult(null);
    setEliminated(new Set());
  }

  function checkAnswer(option: string) {
    if (result || phase !== "questions" || eliminated.has(option)) return;
    setChoice(option);
    if (answerMatches(option, item)) {
      setResult("correct");
      return;
    }
    setResult("wrong");
    setEliminated((current) => new Set(current).add(option));
    setScore((value) => Math.max(0, value - WRONG_PENALTY));
  }

  function retryAnswer() {
    setResult(null);
    setChoice("");
  }

  function goToNextQuestionIndex(fromIndex: number) {
    if (fromIndex + 1 >= deck.length) {
      reshuffle();
      return 0;
    }
    return fromIndex + 1;
  }

  function advanceQuestion() {
    const nextQuestionsThisRound = questionsThisRound + 1;
    const nextQuestionIndex = goToNextQuestionIndex(questionIndex);
    setAnswered((value) => value + 1);

    if (nextQuestionsThisRound >= QUESTIONS_PER_BLAST) {
      setQuestionIndex(nextQuestionIndex);
      setQuestionsThisRound(0);
      setPhase("blast");
      setMovesLeft(BLAST_MOVES);
      setPieces(randomPieces());
      setSelectedPieceId(null);
      setDraggingPieceId(null);
      setHoverCell(null);
      clearQuestionState();
      return;
    }

    setQuestionIndex(nextQuestionIndex);
    setQuestionsThisRound(nextQuestionsThisRound);
    clearQuestionState();
  }

  function placeOnGrid(row: number, col: number, pieceId = selectedPieceId) {
    if (phase !== "blast" || !pieceId || movesLeft <= 0) return;
    const piece = pieces.find((entry) => entry.id === pieceId);
    if (!piece) return;

    const anchor = findAnchorForCell(grid, piece.cells, row, col);
    if (!anchor) return;

    const placed = placePiece(grid, piece.cells, anchor.row, anchor.col, piece.color);
    const { grid: clearedGrid, cleared } = clearCompletedLines(placed);
    const remainingPieces = pieces.filter((entry) => entry.id !== pieceId);
    const nextMoves = movesLeft - 1;
    const piecePoints = piece.cells.length * 5;
    const linePoints = cleared * 20;

    setGrid(clearedGrid);
    setLinesCleared((value) => value + cleared);
    setPiecesPlaced((value) => value + 1);
    setScore((value) => value + piecePoints + linePoints);
    setMovesLeft(nextMoves);
    setSelectedPieceId(null);
    setDraggingPieceId(null);
    setHoverCell(null);
    setPieces(remainingPieces.length ? remainingPieces : randomPieces());

    if (nextMoves <= 0) finishBlastRound();
  }

  function finishBlastRound() {
    setPhase("questions");
    setQuestionsThisRound(0);
    setSelectedPieceId(null);
    setDraggingPieceId(null);
    setHoverCell(null);
    setMovesLeft(BLAST_MOVES);
    setPieces(randomPieces());
    clearQuestionState();
  }

  function restart() {
    reshuffle();
    setPhase("questions");
    setQuestionIndex(0);
    setQuestionsThisRound(0);
    setAnswered(0);
    clearQuestionState();
    setGrid(createEmptyGrid());
    setPieces(randomPieces());
    setSelectedPieceId(null);
    setDraggingPieceId(null);
    setHoverCell(null);
    setMovesLeft(BLAST_MOVES);
    setLinesCleared(0);
    setPiecesPlaced(0);
    setScore(0);
  }

  const activePieceId = draggingPieceId ?? selectedPieceId;
  const selectedPiece = pieces.find((entry) => entry.id === activePieceId) ?? null;
  const anyPieceFits = pieces.some((piece) => pieceFitsAnywhere(grid, piece.cells));
  const hoverAnchor =
    selectedPiece && hoverCell
      ? findAnchorForCell(grid, selectedPiece.cells, hoverCell[0], hoverCell[1])
      : null;
  const hoverFootprint = hoverAnchor
    ? new Set(pieceCellsAtAnchor(selectedPiece!.cells, hoverAnchor.row, hoverAnchor.col).map(([r, c]) => `${r}-${c}`))
    : null;

  if (phase === "questions") {
    return (
      <div className="blast-game">
        <div className="blast-score">
          <span><b>{answered + 1}</b> question</span>
          <span><b>{questionsUntilBlast}</b> until blast</span>
          <span><b>{score}</b> score</span>
        </div>
        <div className="blast-core">
          <div className="blast-meta-row">
            <span className="question-label">Answer 5 questions to unlock Block Blast</span>
            <button type="button" className="score-reset" onClick={restart}>Reset score</button>
          </div>
          <h4>{item.title}</h4>
          <QuizChoiceGrid
            item={item}
            choice={choice}
            result={result}
            eliminated={eliminated}
            onChoose={checkAnswer}
          />
          {result === "correct" && (
            <div className="feedback correct">
              <div><b>Exactly right</b><span>{item.year} · {item.exactDate}</span></div>
              <button type="button" onClick={advanceQuestion}>
                {questionsThisRound + 1 >= QUESTIONS_PER_BLAST ? "Start Block Blast →" : "Next question →"}
              </button>
            </div>
          )}
          {result === "wrong" && (
            <div className="feedback wrong">
              <div><b>Not quite</b><span>−{WRONG_PENALTY} points · that choice is out</span></div>
              <button type="button" onClick={retryAnswer}>Retry</button>
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
        <span><b>{piecesPlaced}</b> pieces</span>
        <span><b>{score}</b> score</span>
      </div>
      <div className="blast-core block-blast-board">
        <div className="block-blast-header">
          <p>Drag blocks onto the board. Score comes from piece size and cleared lines ({linesCleared} cleared).</p>
          {!anyPieceFits && (
            <button type="button" className="quiet-button" onClick={finishBlastRound}>Skip</button>
          )}
        </div>

        <div
          className="blast-grid"
          role="grid"
          aria-label="Block Blast board"
          onDragLeave={() => {
            if (!draggingPieceId) setHoverCell(null);
          }}
        >
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const preview = hoverFootprint?.has(`${rowIndex}-${colIndex}`) ?? false;
              const canDrop =
                selectedPiece &&
                !cell &&
                Boolean(findAnchorForCell(grid, selectedPiece.cells, rowIndex, colIndex));
              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={`blast-cell ${cell ? "filled" : ""} ${preview ? "preview" : ""} ${canDrop && !preview ? "droppable" : ""}`}
                  style={
                    cell
                      ? { background: cell }
                      : preview && selectedPiece
                        ? { background: `${selectedPiece.color}55` }
                        : undefined
                  }
                  onMouseEnter={() => setHoverCell([rowIndex, colIndex])}
                  onMouseLeave={() => {
                    if (!draggingPieceId) setHoverCell(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setHoverCell([rowIndex, colIndex]);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const pieceId = event.dataTransfer.getData("text/piece-id") || draggingPieceId || selectedPieceId;
                    placeOnGrid(rowIndex, colIndex, pieceId);
                  }}
                  onClick={() => placeOnGrid(rowIndex, colIndex)}
                  aria-label={cell ? "Filled cell" : "Empty cell"}
                />
              );
            }),
          )}
        </div>

        <div className="blast-tray" aria-label="Available blocks. Drag onto the board.">
          {pieces.map((piece) => {
            const fits = pieceFitsAnywhere(grid, piece.cells);
            return (
              <button
                key={piece.id}
                type="button"
                draggable={fits}
                className={`blast-piece ${selectedPieceId === piece.id ? "selected" : ""} ${draggingPieceId === piece.id ? "dragging" : ""} ${fits ? "" : "disabled"}`}
                onClick={() => {
                  if (!fits) return;
                  setSelectedPieceId(piece.id);
                  setHoverCell(null);
                }}
                onDragStart={(event) => {
                  if (!fits) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData("text/piece-id", piece.id);
                  event.dataTransfer.effectAllowed = "move";
                  setSelectedPieceId(piece.id);
                  setDraggingPieceId(piece.id);
                }}
                onDragEnd={() => {
                  setDraggingPieceId(null);
                  setHoverCell(null);
                }}
                disabled={!fits}
              >
                <span
                  className="blast-piece-grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(...piece.cells.map(([, col]) => col)) + 1}, 12px)`,
                  }}
                >
                  {renderPieceCells(piece)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="blast-actions">
          <button type="button" className="primary-button blast-finish" onClick={finishBlastRound}>Finish round →</button>
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
  const [answered, setAnswered] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [charms, setCharms] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(() => new Set());
  const item = deck[index];
  const finished = hearts === 0;

  function clearPromptState() {
    setChoice("");
    setResult(null);
    setEliminated(new Set());
  }

  function choose(option: string) {
    if (finished || result || eliminated.has(option)) return;
    setChoice(option);
    if (answerMatches(option, item)) {
      const nextStreak = streak + 1;
      const gained = 10 + (nextStreak - 1) * 5;
      setResult("correct");
      setStreak(nextStreak);
      setBestStreak((current) => Math.max(current, nextStreak));
      setCharms((value) => value + 1);
      setScore((value) => value + gained);
      return;
    }
    setResult("wrong");
    setEliminated((current) => new Set(current).add(option));
    setStreak(0);
    setScore((value) => Math.max(0, value - WRONG_PENALTY));
    setHearts((value) => Math.max(0, value - 1));
  }

  function retry() {
    if (hearts === 0) return;
    setResult(null);
    setChoice("");
  }

  function next() {
    setAnswered((value) => value + 1);
    if (index + 1 >= deck.length) {
      reshuffle();
      setIndex(0);
    } else {
      setIndex((value) => value + 1);
    }
    clearPromptState();
  }

  function reset() {
    reshuffle();
    setHearts(3);
    setCharms(0);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setAnswered(0);
    setIndex(0);
    clearPromptState();
  }

  return (
    <div className="charms-game">
      <div className="charms-header">
        <span className="charm-gem">⬟</span>
        <div>
          <b>{score} score</b>
          <span>
            {charms} right · streak {streak} · best {bestStreak} · Q{answered + 1}
          </span>
        </div>
        <span className="hearts">{"♥".repeat(hearts)}{"♡".repeat(3 - hearts)}</span>
      </div>
      {!finished ? (
        <div className="charm-question">
          <span className="question-label">Protect your hearts · score builds with streaks</span>
          <h4>{item.title}</h4>
          <QuizChoiceGrid
            item={item}
            choice={choice}
            result={result}
            eliminated={eliminated}
            onChoose={choose}
          />
          {result === "correct" && (
            <div className="feedback correct">
              <div><b>Exactly right</b><span>{item.year} · streak {streak}</span></div>
              <button type="button" onClick={next}>Next →</button>
            </div>
          )}
          {result === "wrong" && hearts > 0 && (
            <div className="feedback wrong">
              <div><b>Not quite</b><span>−{WRONG_PENALTY} points · heart lost · that choice is out</span></div>
              <button type="button" onClick={retry}>Retry</button>
            </div>
          )}
        </div>
      ) : (
        <div className="game-over">
          <span className="charm-gem">⬟</span>
          <h4>Run ended with {score} points</h4>
          <p>{charms} correct · best streak {bestStreak}. You ran out of hearts.</p>
          <button className="primary-button" onClick={reset}>Try another run</button>
        </div>
      )}
    </div>
  );
}
