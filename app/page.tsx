"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import sourceEvents from "./events.json";

type EventItem = (typeof sourceEvents)[number];
type Mode = "flashcards" | "learn" | "test" | "blocks" | "blast" | "match" | "charms";
type AnswerStyle = "multiple" | "written";

const modes: { id: Mode; label: string; mark: string; note: string }[] = [
  { id: "flashcards", label: "Flashcards", mark: "▰", note: "Flip and review" },
  { id: "learn", label: "Learn", mark: "✦", note: "Practice two ways" },
  { id: "test", label: "Test", mark: "▤", note: "10-question rounds" },
  { id: "blocks", label: "Blocks", mark: "▦", note: "Build the pairs" },
  { id: "blast", label: "Blast", mark: "◆", note: "Race the clock" },
  { id: "match", label: "Match", mark: "▭", note: "Clear the board" },
  { id: "charms", label: "Charms", mark: "⬟", note: "Keep your hearts" },
];

function chronologyValue(year: string) {
  const number = Number((year.match(/[\d,]+/)?.[0] ?? "0").replaceAll(",", ""));
  return year.includes("BCE") ? -number : number;
}

const events = [...sourceEvents].sort((a, b) => {
  const byYear = chronologyValue(a.year) - chronologyValue(b.year);
  return byYear || a.sourceOrder - b.sourceOrder;
});

function splitIntoRows<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function compactYear(year: string) {
  return year.replace(" CE", "").replace("c. ", "c. ");
}

function optionsFor(item: EventItem, count = 4) {
  const at = events.findIndex((event) => event.title === item.title);
  const offsets = [0, 7, 17, 31, 43, 58];
  const values = offsets
    .map((offset) => events[(at + offset) % events.length].year)
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

function useCountdown(active: boolean, resetKey: number) {
  const [seconds, setSeconds] = useState(45);
  useEffect(() => {
    setSeconds(45);
    if (!active) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [active, resetKey]);
  return seconds;
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
      const inSearch = !needle || `${event.title} ${event.year} ${event.description}`.toLowerCase().includes(needle);
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

  function shuffleDeck() {
    const next = [...deck];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
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
          <span><strong>7</strong> study modes</span>
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
                      setCardIndex(deck.findIndex((entry) => entry.title === item.title));
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
          <p>Review, recall, race, and match. Every mode draws from the complete set of {events.length} events.</p>
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
                <h3>{modes.find((item) => item.id === mode)?.label}</h3>
              </div>
              <span className="progress-pill">{mode === "flashcards" ? `${cardIndex + 1} / ${deck.length}` : `All ${events.length} events`}</span>
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

            {mode === "learn" && <QuestionRound kind="Learn" />}
            {mode === "test" && <QuestionRound kind="Test" limit={10} />}
            {mode === "blocks" && <PairBoard variant="blocks" />}
            {mode === "match" && <PairBoard variant="match" />}
            {mode === "blast" && <BlastGame />}
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

function QuestionRound({ kind, limit = events.length }: { kind: "Learn" | "Test"; limit?: number }) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [style, setStyle] = useState<AnswerStyle>("multiple");
  const [choice, setChoice] = useState("");
  const [written, setWritten] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const total = Math.min(limit, events.length);
  const item = events[index % total];

  function check(value: string) {
    if (result) return;
    const right = answerMatches(value, item);
    setResult(right ? "correct" : "wrong");
    if (right) setScore((current) => current + 1);
  }

  function next() {
    setIndex((current) => (current + 1) % total);
    setChoice("");
    setWritten("");
    setResult(null);
  }

  return (
    <div className="quiz-panel">
      <div className="quiz-meta">
        <span>Question {(index % total) + 1} of {total}</span>
        <span>{score} correct</span>
      </div>
      <div className="quiz-progress"><span style={{ width: `${(((index % total) + 1) / total) * 100}%` }} /></div>
      <div className="answer-style" role="group" aria-label="Answer style">
        <button className={style === "multiple" ? "active" : ""} onClick={() => { setStyle("multiple"); setResult(null); }}>Multiple choice</button>
        <button className={style === "written" ? "active" : ""} onClick={() => { setStyle("written"); setResult(null); }}>Written answer</button>
      </div>
      <span className="question-label">{kind === "Test" ? "Choose the correct year" : "Recall the date"}</span>
      <h4>{item.title}</h4>
      {style === "multiple" ? (
        <div className="choice-grid">
          {optionsFor(item).map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => { setChoice(option); check(option); }}
              className={`${choice === option ? "chosen" : ""} ${result && option === item.year ? "right" : ""}`}
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

function PairBoard({ variant }: { variant: "blocks" | "match" }) {
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<{ side: "event" | "year"; title: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const set = useMemo(() => Array.from({ length: variant === "blocks" ? 5 : 6 }, (_, index) => events[(round * 6 + index) % events.length]), [round, variant]);
  const years = [...set].reverse();

  function pick(side: "event" | "year", item: EventItem) {
    if (matched.has(item.title)) return;
    if (!selected || selected.side === side) {
      setSelected({ side, title: item.title });
      return;
    }
    if (selected.title === item.title) {
      setMatched((current) => new Set(current).add(item.title));
    }
    setSelected(null);
  }

  const done = matched.size === set.length;
  return (
    <div className={`pair-game ${variant}`}>
      <div className="game-intro">
        <div><span className="question-label">{variant === "blocks" ? "Build every pair" : "Clear the board"}</span><h4>{variant === "blocks" ? "Connect each event to its year" : "Match the event and year"}</h4></div>
        <span>{matched.size} / {set.length}</span>
      </div>
      <div className="pair-columns">
        <div>{set.map((item) => <button key={item.title} className={`${matched.has(item.title) ? "matched" : ""} ${selected?.side === "event" && selected.title === item.title ? "selected-pair" : ""}`} onClick={() => pick("event", item)}>{item.title}</button>)}</div>
        <div>{years.map((item) => <button key={item.title} className={`${matched.has(item.title) ? "matched" : ""} ${selected?.side === "year" && selected.title === item.title ? "selected-pair" : ""}`} onClick={() => pick("year", item)}>{item.year}</button>)}</div>
      </div>
      {done && <div className="round-complete"><b>Board cleared.</b><button onClick={() => { setRound((value) => value + 1); setMatched(new Set()); setSelected(null); }}>New round →</button></div>}
    </div>
  );
}

function BlastGame() {
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [run, setRun] = useState(0);
  const seconds = useCountdown(true, run);
  const item = events[(index * 7) % events.length];

  function choose(option: string) {
    if (seconds === 0) return;
    if (option === item.year) {
      const next = streak + 1;
      setStreak(next);
      setBest((value) => Math.max(value, next));
      setIndex((value) => value + 1);
    } else setStreak(0);
  }

  return (
    <div className="blast-game">
      <div className="blast-score"><span><b>{seconds}</b> seconds</span><span><b>{streak}</b> streak</span><span><b>{best}</b> best</span></div>
      <div className="blast-core">
        <span className="question-label">Tap the year before time runs out</span>
        <h4>{seconds ? item.title : "Time’s up"}</h4>
        {seconds ? <div className="choice-grid">{optionsFor(item).map((option) => <button key={option} onClick={() => choose(option)}>{option}</button>)}</div> : <button className="primary-button" onClick={() => { setRun((value) => value + 1); setIndex(0); setStreak(0); }}>Play again</button>}
      </div>
    </div>
  );
}

function CharmsGame() {
  const [index, setIndex] = useState(2);
  const [hearts, setHearts] = useState(3);
  const [charms, setCharms] = useState(0);
  const item = events[(index * 5) % events.length];

  function choose(option: string) {
    if (option === item.year) {
      setCharms((value) => value + 1);
      setIndex((value) => value + 1);
    } else setHearts((value) => Math.max(0, value - 1));
  }

  function reset() {
    setHearts(3); setCharms(0); setIndex(2);
  }

  return (
    <div className="charms-game">
      <div className="charms-header"><span className="charm-gem">⬟</span><div><b>{charms} charms</b><span>Build a collection without losing your hearts.</span></div><span className="hearts">{"♥".repeat(hearts)}{"♡".repeat(3 - hearts)}</span></div>
      {hearts ? <div className="charm-question"><span className="question-label">Protect your streak</span><h4>{item.title}</h4><div className="choice-grid">{optionsFor(item).map((option) => <button key={option} onClick={() => choose(option)}>{option}</button>)}</div></div> : <div className="game-over"><span className="charm-gem">⬟</span><h4>You collected {charms} charms</h4><button className="primary-button" onClick={reset}>Try another run</button></div>}
    </div>
  );
}
