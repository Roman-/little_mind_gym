import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { puzzleById } from '../puzzles'
import { makeRng } from '../lib/rng'
import { useProgress } from '../lib/progress'
import { useSettings } from '../lib/settings'
import { useImmersion } from '../lib/immersion'
import { usePageTitle } from '../lib/title'
import { useEphemeral } from '../lib/ephemeral'
import { useCue } from '../lib/motion'
import { playSound } from '../lib/sound'
import { usePrefersReducedMotion } from '../lib/theme'
import type { PuzzleLevel, PuzzleMeta } from '../lib/types'
import { Button, ButtonLink, Panel } from '../components/kit'
import { Confetti } from '../components/Confetti'
import { ExpandIcon, ResetIcon, ShrinkIcon, ShuffleIcon, UndoIcon } from '../components/icons'
import { MoveTape } from '../components/MoveTape'
import { Stamp } from '../components/Stamp'
import { NotFound } from './NotFound'
import s from './puzzle.module.css'

interface Entry {
  state: unknown
  /** What the move that produced this state did. Empty for the opening position. */
  note: string
}

const Tick = () => (
  <svg
    className={s.tick}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 12.5 9.5 18 20 6" />
  </svg>
)

const Chevron = () => (
  <svg
    className={s.chevron}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff)
}

/** Where a returning player should land: the first level they have not finished. */
function openingLevel(meta: PuzzleMeta, solved: string[]): number {
  const i = meta.levels.findIndex((l) => !solved.includes(l.id))
  return i === -1 ? 0 : i
}

export function PuzzlePage() {
  const { id } = useParams()
  const meta = puzzleById(id)
  if (!meta) return <NotFound />
  return <PuzzleShell key={meta.id} meta={meta} />
}

function PuzzleShell({ meta }: { meta: PuzzleMeta }) {
  const { get, markTried, markSolved } = useProgress()
  const { settings } = useSettings()
  const { immersed, fullscreen, canFullscreen, enter, leave } = useImmersion()
  const record = get(meta.id)
  const [params, setParams] = useSearchParams()

  const wanted = params.get('level')
  const fromUrl = meta.levels.findIndex((l) => l.id === wanted)
  const [levelIndex, setLevelIndex] = useState(() =>
    fromUrl >= 0 ? fromUrl : openingLevel(meta, record.solved),
  )
  const level: PuzzleLevel = meta.levels[levelIndex] ?? meta.levels[0]

  usePageTitle(meta.title)

  const [seed, setSeed] = useState(newSeed)

  const initial = useMemo(
    () => meta.engine.init(level, makeRng(seed)),
    [meta.engine, level, seed],
  )
  // Changing the level or reshuffling replaces `initial`, which clears the
  // history and the revealed hints during render — no half-old board is painted.
  const [history, setHistory] = useEphemeral<Entry[]>(initial, [{ state: initial, note: '' }])
  const [hintsShown, setHintsShown] = useEphemeral(initial, 0)

  const current = history[history.length - 1].state
  const moves = history.length - 1
  const solved = meta.engine.isSolved(current)
  const failure = solved ? null : (meta.engine.failure?.(current) ?? null)
  const locked = solved || failure !== null

  const dispatch = useCallback(
    (action: unknown) => {
      setHistory((h) => {
        const state = h[h.length - 1].state
        if (meta.engine.isSolved(state) || meta.engine.failure?.(state)) return h
        const next = meta.engine.reduce(state, action)
        if (next === state) return h
        const note = meta.engine.describe?.(state, next, action) ?? 'Made a move'
        return [...h, { state: next, note }]
      })
    },
    [meta.engine, setHistory],
  )

  /**
   * Several boards replace the very button that was pressed — a piece moves
   * into the boat, a ball moves onto a pan, a Fill button greys out — which
   * drops the browser's focus onto <body> and sends the next Tab back to the
   * top of the page. When that happens, put focus on the board instead so a
   * child playing by keyboard carries on from where they were.
   *
   * It cannot be an effect on the puzzle state. Half the taps in a puzzle are a
   * *selection* — putting the goat in the boat, lifting a disc — which by
   * contract is board-local, so the shell never re-renders and never gets the
   * chance to look. Listening for `focusout` on the stage catches both kinds.
   *
   * The two guards are what keep it from stealing focus: it acts only when
   * nothing at all has focus, and only when the thing that had it last has
   * gone from the document or gone dead.
   */
  const stageRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (stage === null) return
    const caught = (event: FocusEvent) => {
      const left = event.target as HTMLElement
      // focusout fires *before* focus lands anywhere else, and before React has
      // finished detaching the node, so both questions are asked one tick later.
      queueMicrotask(() => {
        if (document.activeElement !== document.body) return
        if (left.isConnected && !(left as HTMLButtonElement).disabled) return
        stage.focus()
      })
    }
    stage.addEventListener('focusout', caught)
    return () => stage.removeEventListener('focusout', caught)
  }, [])

  /**
   * /random_instantly asks for its puzzle already immersed. The request travels
   * as history state rather than in the address, so /puzzle/<id> keeps meaning
   * one thing wherever it is typed.
   */
  const asked = (useLocation().state as { immerse?: boolean } | null)?.immerse === true
  useEffect(() => {
    if (asked) enter()
  }, [asked, enter])

  /**
   * Immerse unmounts the button that was pressed, which drops focus on <body>
   * the same way a board replacing its own controls does. Put it on the board.
   * A page that arrives immersed had no press to lose: a ring around a stage
   * nobody has touched yet says nothing.
   */
  useEffect(() => {
    if (immersed && !asked && document.activeElement === document.body) stageRef.current?.focus()
  }, [immersed, asked])

  const rewind = useCallback(
    (keep: number) => {
      setHistory((h) => (keep >= h.length - 1 ? h : h.slice(0, keep + 1)))
    },
    [setHistory],
  )

  const restart = useCallback(() => {
    setHistory([{ state: initial, note: '' }])
  }, [initial, setHistory])

  const chooseLevel = (index: number) => {
    setLevelIndex(index)
    const next = new URLSearchParams(params)
    next.set('level', meta.levels[index].id)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (moves > 0) markTried(meta.id)
  }, [moves, markTried, meta.id])

  /**
   * One sound a move, and one only: the knock of the piece going down, or —
   * where the move ended the level — what it ended it as. A dead end and a
   * solve are the news, so the landing underneath them is not played as well.
   *
   * The ref is what keeps it to a move that has just been made. The tape
   * rewinds, hints open and a solved level re-renders, and none of those are
   * somebody putting a piece down.
   */
  const sounded = useRef(moves)
  useEffect(() => {
    const moved = moves > sounded.current
    sounded.current = moves
    if (moved) playSound(solved ? 'solve' : failure !== null ? 'wrong' : 'place')
  }, [moves, solved, failure])

  /**
   * The two things that happen on the move that solves the level, and only on
   * that move: the score is banked, and the paper is thrown. The ref is what
   * keeps both out of every later render — the level stays solved, and a
   * solved level re-renders every time a hint is opened or the tape is drawn.
   */
  const reduced = usePrefersReducedMotion()
  const [confetti, celebrate] = useCue('--dur-5')
  const banked = useRef(false)
  useEffect(() => {
    if (!solved) {
      banked.current = false
      return
    }
    if (banked.current) return
    banked.current = true
    markSolved(meta.id, level.id, moves)
    if (!reduced) celebrate(true)
  }, [solved, markSolved, meta.id, level.id, moves, reduced, celebrate])

  const Board = meta.engine.Board as ComponentType<{
    state: unknown
    dispatch: (action: unknown) => void
    locked: boolean
  }>

  /**
   * Open on a first visit, shut afterwards — but decided once, at mount.
   * Reading `record.tried` on every render would slam the panel closed under a
   * child's hand on the first move, and take the hint they were reading with it.
   */
  const [helpOpen] = useState(() => !record.tried)

  /** While a notice is up it owns the actions, so the toolbar does not repeat them. */
  const noticeShowing = solved || failure !== null
  const par = level.par
  const best = record.best[level.id]
  // `par` is the fewest moves a solver can be *sure* of. On a puzzle that hides
  // something, a well-earned piece of luck can beat it, so say so rather than
  // claiming a number is the shortest when the tape above says otherwise.
  const verdict =
    par === undefined
      ? ''
      : moves === par
        ? ' — nobody can do it in fewer.'
        : moves < par
          ? ` — we expected ${par}.`
          : ''
  const nextLevel = levelIndex + 1 < meta.levels.length ? levelIndex + 1 : null

  return (
    <>
      {/* Title and levels share one line. The board is what a child came for,
          so everything above it is one row tall and then gets out of the way —
          and immersed, it goes altogether. */}
      {!immersed && (
        <header className={s.head}>
          <h1 className={s.title}>
            <span className={s.titleMark} aria-hidden="true">
              <meta.Icon />
            </span>
            {meta.title}
          </h1>
          <div className={s.levels} role="group" aria-label="Choose a level">
            {meta.levels.map((l, i) => (
              <button
                key={l.id}
                type="button"
                className={`${s.level} u-press`}
                aria-pressed={i === levelIndex}
                onClick={() => chooseLevel(i)}
              >
                {l.label}
                {record.solved.includes(l.id) && <Tick />}
              </button>
            ))}
          </div>
        </header>
      )}

      <Panel className={s.main} id="board">
        <div className={`u-sunk ${s.stage}`} ref={stageRef} tabIndex={-1}>
          <Board
            key={`${level.id}:${seed}`}
            state={current}
            dispatch={dispatch}
            locked={locked}
          />
        </div>

        {/* Mounted from the first render, so a screen reader is already
            watching it when the news arrives. A live region created in the same
            commit as its text is announced unreliably or not at all. */}
        <p className="u-sr" role="status">
          {failure !== null
            ? `${failure} Nothing is lost. Go back one move and try another way.`
            : solved
              ? `Solved. ${moves} ${moves === 1 ? 'move' : 'moves'}${verdict}`
              : ''}
        </p>

        {failure !== null && (
          <div className={s.notice} data-tone="clay">
            <div className={s.noticeBody}>
              <p className={s.noticeTitle}>{failure}</p>
              <p className={s.noticeLine}>Nothing is lost. Go back one move and try another way.</p>
            </div>
            <div className={s.noticeActions}>
              <Button variant="primary" onClick={() => rewind(moves - 1)}>
                <UndoIcon />
                Step back
              </Button>
              <Button onClick={restart}>Start over</Button>
            </div>
          </div>
        )}

        {confetti && <Confetti />}

        {solved && (
          <div className={s.notice} data-tone="moss">
            <Stamp>Solved</Stamp>
            <div className={s.noticeBody}>
              <p className={s.noticeTitle}>
                {moves} {moves === 1 ? 'move' : 'moves'}
                {verdict}
              </p>
              {par !== undefined && moves > par && (
                <p className={s.noticeLine}>
                  It can be done in {par}. Want another go?
                  {best !== undefined && best < moves && ` Your best so far is ${best}.`}
                </p>
              )}
            </div>
            <div className={s.noticeActions}>
              {nextLevel !== null && (
                <Button variant="primary" onClick={() => chooseLevel(nextLevel)}>
                  Next level
                </Button>
              )}
              <Button onClick={restart}>
                <ResetIcon />
                Try again
              </Button>
              <ButtonLink to="/random" variant={nextLevel === null ? 'primary' : 'secondary'}>
                <ShuffleIcon />
                Another puzzle
              </ButtonLink>
            </div>
          </div>
        )}

        <div className={s.toolbar}>
          <MoveTape
            steps={history.slice(1).map((e) => e.note)}
            onRewind={rewind}
            showCount={settings.showMoveCount}
          />
          <div className={s.tools}>
            {/* The way out of the mode, and — where the browser turned the
                screen down — the way into it. They come first because on a
                narrow screen this row wraps, and while the chrome is gone the
                way out is the one control that cannot be the one to fall off
                the bottom. */}
            {immersed && (
              <>
                {canFullscreen && !fullscreen && (
                  <Button size="sm" variant="primary" onClick={enter}>
                    <ExpandIcon />
                    Full screen
                  </Button>
                )}
                <Button size="sm" onClick={leave}>
                  <ShrinkIcon />
                  Leave immerse
                </Button>
              </>
            )}
            {!noticeShowing && (
              <>
                <Button size="sm" onClick={() => rewind(moves - 1)} disabled={moves === 0}>
                  <UndoIcon />
                  Step back
                </Button>
                <Button size="sm" onClick={restart} disabled={moves === 0}>
                  <ResetIcon />
                  Start over
                </Button>
              </>
            )}
            {meta.reseedable && (
              <Button size="sm" onClick={() => setSeed(newSeed())}>
                Mix it up
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* One drawer under the board holds everything the app has to say: the
          rules, and the hints. Both were cards taking up more room than the
          board they explained, and immersed, both wait outside. */}
      {!immersed && (
        <details className={s.help} open={helpOpen}>
          <summary className={s.helpTop}>
            How to play
            <Chevron />
          </summary>
          <div className={s.helpBody}>
            <div>
              <p className={s.helpIntro}>{meta.tagline}</p>
              <ol className={s.steps}>
                {meta.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>

            <div className={s.hints}>
              <p className={`u-label ${s.hintsTitle}`}>Stuck?</p>
              {/* A revealed hint appears above the button that revealed it, so
                  without this it arrives silently and out of reading order. */}
              <div className={s.hintList} role="status">
                {level.hints.slice(0, hintsShown).map((hint, i) => (
                  <p key={hint} className={s.hint}>
                    <span className={`u-label ${s.hintNum}`}>Hint {i + 1}</span>
                    {hint}
                  </p>
                ))}
              </div>
              {/* Disabled on the last hint rather than replaced by a sentence:
                  unmounting the button a child has just pressed drops their
                  keyboard focus on the floor. */}
              <Button
                size="sm"
                aria-disabled={hintsShown >= level.hints.length || undefined}
                onClick={() => {
                  if (hintsShown < level.hints.length) setHintsShown((n) => n + 1)
                }}
              >
                {hintsShown === 0 ? 'Give me a nudge' : 'One more nudge'}
              </Button>
              <p className={s.hintIntro}>
                {hintsShown >= level.hints.length
                  ? 'That is every hint there is.'
                  : hintsShown === 0
                    ? 'No hint gives the answer away.'
                    : ''}
              </p>
            </div>
          </div>
        </details>
      )}
    </>
  )
}
