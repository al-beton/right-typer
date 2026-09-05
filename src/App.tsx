import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  CALIBRATION_VERSION,
  matchesCamera,
  validateCalibrationSample,
  visibleHandCount,
  type CalibrationRecord,
  type CalibrationSample,
  type KeyCentre,
} from './calibration/calibration'
import { clearCalibration, loadCalibration, saveCalibration } from './calibration/storage'
import { classifyPress } from './tracking/classifier'
import { LandmarkFrameBuffer } from './tracking/frameBuffer'
import type { TrackingStatus } from './tracking/trackingClient'
import type { LandmarkFrame } from './tracking/types'
import { useCamera } from './tracking/useCamera'
import { FINGER_TARGETS, TARGET_BY_CODE, describeFinger, type FingerTarget } from './typing/fingerMap'
import { gradeWord, type ObservedKeypress, type WordGrade } from './typing/grading'
import { FIRST_LESSON, LESSON_WORDS } from './typing/lesson'
import {
  EMPTY_STATISTICS,
  accuracy,
  applyGrade,
  wordsPerMinute,
  type LessonStatistics,
} from './typing/statistics'
import { CameraPreview } from './ui/CameraPreview'

type Stage = 'intro' | 'camera' | 'calibration' | 'confirm' | 'lesson' | 'results'

interface Feedback {
  grade: WordGrade
  word: string
}

const STEP_LABELS: Record<Exclude<Stage, 'results'>, string> = {
  intro: 'Welcome',
  camera: 'Camera',
  calibration: 'Calibrate',
  confirm: 'Confirm',
  lesson: 'Type',
}

function Brand() {
  return (
    <div className="brand" aria-label="Right Typer">
      <span className="brand-mark" aria-hidden="true">r</span>
      <span>right typer</span>
    </div>
  )
}

function AppHeader({ stage }: { stage: Stage }) {
  return (
    <header className="app-header">
      <Brand />
      {stage !== 'intro' && stage !== 'results' ? (
        <div className="step-indicator">
          <span className="eyebrow">setup</span>
          <span>{STEP_LABELS[stage]}</span>
        </div>
      ) : (
        <span className="local-badge"><i /> local only</span>
      )}
    </header>
  )
}

function Intro({ onStart }: { onStart: () => void }) {
  const supported = /Macintosh/.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent)
  return (
    <section className="intro panel-enter">
      <div className="intro-copy">
        <span className="eyebrow">touch typing, with a second pair of eyes</span>
        <h1>Teach your hands<br />where to go.</h1>
        <p className="lede">
          Right Typer watches your fingers while you type, then helps each word land on the right keys
          with the right fingers.
        </p>
        <div className="intro-actions">
          <button className="button button-primary" type="button" onClick={onStart}>
            Set up my camera <span aria-hidden="true">→</span>
          </button>
          <span>About 5 minutes the first time</span>
        </div>
        {!supported ? (
          <p className="support-note" role="note">
            This first prototype is tuned for current Chrome on a MacBook with an Apple British keyboard.
          </p>
        ) : null}
      </div>
      <div className="intro-visual" aria-hidden="true">
        <div className="key-cloud">
          <span className="key key-q">q</span><span className="key key-w">w</span>
          <span className="key key-e">e</span><span className="key key-r">r</span>
          <span className="key key-f">f</span><span className="key key-j">j</span>
          <span className="key key-k">k</span><span className="key key-l">l</span>
          <span className="finger-line line-left" /><span className="finger-line line-right" />
          <span className="visual-caption">camera-aware practice</span>
        </div>
      </div>
      <div className="trust-row">
        <span><b>01</b> frame your keyboard</span>
        <span><b>02</b> mark each key</span>
        <span><b>03</b> type one short lesson</span>
      </div>
    </section>
  )
}

function CameraSetup({
  requesting,
  cameraActive,
  error,
  handsVisible,
  trackingReady,
  hasSavedCalibration,
  onRequest,
  onCalibrate,
  onUseSaved,
}: {
  requesting: boolean
  cameraActive: boolean
  error: string | null
  handsVisible: number
  trackingReady: boolean
  hasSavedCalibration: boolean
  onRequest: () => void
  onCalibrate: () => void
  onUseSaved: () => void
}) {
  const ready = trackingReady && handsVisible === 2
  return (
    <section className="setup-copy panel-enter">
      <div>
        <span className="eyebrow">camera position</span>
        <h2>Let the camera see<br />your hands and keys.</h2>
        <p>
          Angle the screen down slightly. The keyboard should fill the guide and look like a trapezoid,
          wider along the top edge. Keep both hands in view.
        </p>
      </div>
      <ol className="setup-list">
        <li><span>1</span><div><b>Use your built-in camera</b><small>No video is saved or sent anywhere.</small></div></li>
        <li><span>2</span><div><b>Frame the full letter area</b><small>Include the space bar and both hands.</small></div></li>
        <li><span>3</span><div><b>Rest on the home row</b><small>We need all ten fingertips before calibration.</small></div></li>
      </ol>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      {!cameraActive && !requesting && !error ? (
        <button className="button button-primary" type="button" onClick={onRequest}>Allow camera</button>
      ) : null}
      {requesting ? <button className="button button-primary" type="button" disabled>Opening camera…</button> : null}
      {trackingReady ? (
        <div className={`hands-check ${ready ? 'is-ready' : ''}`} aria-live="polite">
          <span className="hands-icon" aria-hidden="true">✦</span>
          <div><b>{ready ? 'Both hands are in view' : `${handsVisible} of 2 hands visible`}</b><small>{ready ? 'Framing looks ready to calibrate.' : 'Adjust the screen and rest both hands on the keyboard.'}</small></div>
        </div>
      ) : null}
      {ready ? (
        <div className="button-row">
          {hasSavedCalibration ? (
            <button className="button button-primary" type="button" onClick={onUseSaved}>Use saved calibration</button>
          ) : null}
          <button className={hasSavedCalibration ? 'button button-secondary' : 'button button-primary'} type="button" onClick={onCalibrate}>
            {hasSavedCalibration ? 'Calibrate again' : 'Start calibration'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function CalibrationPanel({
  target,
  index,
  pendingCentre,
  error,
  onRemark,
}: {
  target: FingerTarget
  index: number
  pendingCentre: KeyCentre | null
  error: string | null
  onRemark: () => void
}) {
  return (
    <section className="calibration-copy panel-enter">
      <div className="progress-label"><span>Calibrating keyboard</span><b>{index + 1} / {FINGER_TARGETS.length}</b></div>
      <div className="progress-track"><span style={{ width: `${(index / FINGER_TARGETS.length) * 100}%` }} /></div>
      <div className="target-key" aria-live="polite">{target.label}</div>
      <h2>{pendingCentre ? `Press ${target.label} now` : `Mark the ${target.label} key`}</h2>
      <p>
        {pendingCentre
          ? <>Use your <strong>{describeFinger(target)}</strong>. Lift it first, then make one deliberate press.</>
          : 'Click the exact centre of the highlighted key in the camera view.'}
      </p>
      {pendingCentre ? <button className="text-button" type="button" onClick={onRemark}>Mark a different centre</button> : null}
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      <div className="finger-legend" aria-label="Finger colour legend">
        <span className="finger-thumb">thumb</span><span className="finger-index">index</span>
        <span className="finger-middle">middle</span><span className="finger-ring">ring</span>
        <span className="finger-little">little</span>
      </div>
    </section>
  )
}

function Confirmation({ onConfirm, onRedo }: { onConfirm: () => void; onRedo: () => void }) {
  return (
    <section className="confirmation-copy panel-enter">
      <span className="eyebrow">calibration complete</span>
      <h2>Do the dots sit in<br />the centre of every key?</h2>
      <p>
        Check the overlay carefully. A precise map matters more than a fast setup, and this calibration will
        be saved only in this browser.
      </p>
      <div className="notice notice-success"><span>✓</span> All 31 inputs have a motion sample</div>
      <div className="button-row">
        <button className="button button-primary" type="button" onClick={onConfirm}>Looks good — start lesson</button>
        <button className="button button-secondary" type="button" onClick={onRedo}>Start over</button>
      </div>
    </section>
  )
}

function Passage({ wordIndex, typed }: { wordIndex: number; typed: string }) {
  return (
    <div className="passage" aria-label={`Typing passage. Current word: ${LESSON_WORDS[wordIndex]}`}>
      {LESSON_WORDS.map((word, index) => {
        const state = index < wordIndex ? 'complete' : index === wordIndex ? 'current' : 'future'
        return (
          <span className={`passage-word word-${state}`} key={`${word}-${index}`}>
            {index === wordIndex
              ? word.split('').map((character, characterIndex) => {
                  const typedCharacter = typed[characterIndex]
                  const characterState = typedCharacter === undefined
                    ? characterIndex === typed.length ? 'cursor' : 'waiting'
                    : typedCharacter === character ? 'right' : 'wrong'
                  return <span className={`char-${characterState}`} key={`${character}-${characterIndex}`}>{character}</span>
                })
              : word}
            {index === wordIndex && typed.length > word.length ? (
              <span className="char-wrong">{typed.slice(word.length)}</span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

function FeedbackCard({ feedback }: { feedback: Feedback }) {
  if (feedback.grade.outcome === 'pass') {
    return <div className="feedback feedback-pass"><b>Nicely placed.</b><span>Next word.</span></div>
  }
  if (feedback.grade.outcome === 'uncertain') {
    return (
      <div className="feedback feedback-uncertain" role="status">
        <b>I lost the movement on “{feedback.word}”.</b>
        <span>Try the word again — this one does not count against you.</span>
      </div>
    )
  }
  return (
    <div className="feedback feedback-fail" role="status">
      <b>One more go at “{feedback.word}”.</b>
      {feedback.grade.wrongKeyCount > 0 ? <span>{feedback.grade.wrongKeyCount} literal key {feedback.grade.wrongKeyCount === 1 ? 'error' : 'errors'}.</span> : null}
      {feedback.grade.fingerErrors.map((error, index) => (
        <span key={`${error.character}-${index}`}><mark>{error.character}</mark> used {error.observed}; expected {error.expected}.</span>
      ))}
    </div>
  )
}

function LessonPanel({
  wordIndex,
  typed,
  statistics,
  feedback,
  onRecalibrate,
}: {
  wordIndex: number
  typed: string
  statistics: LessonStatistics
  feedback: Feedback | null
  onRecalibrate: () => void
}) {
  return (
    <section className="lesson panel-enter">
      <div className="lesson-head">
        <div><span className="eyebrow">{FIRST_LESSON.title}</span><h2>Keep it light and steady.</h2></div>
        <div className="live-stats"><span><b>{statistics.correctWords}</b> words</span><span><b>{statistics.failedAttempts}</b> retries</span></div>
      </div>
      <Passage wordIndex={wordIndex} typed={typed} />
      <div className="lesson-foot">
        <span><kbd>space</kbd> checks the word</span>
        <span><kbd>⌫</kbd> repairs text, but not a wrong-finger press</span>
        <button className="text-button" type="button" onClick={onRecalibrate}>recalibrate</button>
      </div>
      {feedback ? <FeedbackCard feedback={feedback} /> : <div className="feedback-placeholder" />}
    </section>
  )
}

function Results({ statistics, onAgain, onRecalibrate }: { statistics: LessonStatistics; onAgain: () => void; onRecalibrate: () => void }) {
  const wpm = Math.round(wordsPerMinute(statistics))
  const accuracyValue = Math.round(accuracy(statistics))
  return (
    <section className="results panel-enter">
      <div className="result-burst" aria-hidden="true"><span>✓</span></div>
      <span className="eyebrow">lesson complete</span>
      <h1>Your hands found<br />their rhythm.</h1>
      <p>One careful pass is worth more than ten rushed ones.</p>
      <div className="result-grid">
        <div className="result-primary"><b>{wpm}</b><span>words per minute</span></div>
        <div><b>{accuracyValue}%</b><span>accuracy</span></div>
        <div><b>{statistics.correctWords}</b><span>correct words</span></div>
        <div><b>{statistics.failedAttempts}</b><span>failed word attempts</span></div>
        <div><b>{statistics.wrongKeys}</b><span>wrong keys</span></div>
        <div><b>{statistics.wrongFingers}</b><span>wrong fingers</span></div>
      </div>
      <div className="button-row result-actions">
        <button className="button button-primary" type="button" onClick={onAgain}>Type it again</button>
        <button className="button button-secondary" type="button" onClick={onRecalibrate}>Recalibrate</button>
      </div>
      <small>Results stay on this device and reset when you start again.</small>
    </section>
  )
}

function App() {
  const [stage, setStage] = useState<Stage>('intro')
  const camera = useCamera()
  const frameBuffer = useRef(new LandmarkFrameBuffer())
  const lastUiFrameAt = useRef(0)
  const [handsVisible, setHandsVisible] = useState(0)
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('loading')
  const [savedCalibration, setSavedCalibration] = useState<CalibrationRecord | null>(() => loadCalibration())
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null)
  const [calibrationKeys, setCalibrationKeys] = useState<Record<string, CalibrationSample>>({})
  const [calibrationIndex, setCalibrationIndex] = useState(0)
  const [pendingCentre, setPendingCentre] = useState<KeyCentre | null>(null)
  const [calibrationError, setCalibrationError] = useState<string | null>(null)
  const [wordIndex, setWordIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [observations, setObservations] = useState<ObservedKeypress[]>([])
  const [statistics, setStatistics] = useState<LessonStatistics>(EMPTY_STATISTICS)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const validSavedCalibration = useMemo(
    () => camera.info ? matchesCamera(savedCalibration, camera.info) : false,
    [camera.info, savedCalibration],
  )
  const activeTarget = FINGER_TARGETS[calibrationIndex]

  const handleFrame = useCallback((frame: LandmarkFrame) => {
    frameBuffer.current.push(frame)
    if (frame.timestamp - lastUiFrameAt.current > 220) {
      lastUiFrameAt.current = frame.timestamp
      setHandsVisible(visibleHandCount(frame))
    }
  }, [])

  const beginCalibration = useCallback(() => {
    setCalibration(null)
    setCalibrationKeys({})
    setCalibrationIndex(0)
    setPendingCentre(null)
    setCalibrationError(null)
    setStage('calibration')
  }, [])

  const resetLesson = useCallback(() => {
    setWordIndex(0)
    setTyped('')
    setObservations([])
    setStatistics(EMPTY_STATISTICS)
    setFeedback(null)
  }, [])

  const startLesson = useCallback(() => {
    resetLesson()
    setStage('lesson')
  }, [resetLesson])

  useEffect(() => {
    if (stage !== 'calibration' || !activeTarget || !pendingCentre || !camera.info) return
    const cameraInfo = camera.info
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      if (event.code !== activeTarget.code) {
        setCalibrationError(`That was ${event.key === ' ' ? 'space' : event.key}. Press ${activeTarget.label} with your ${describeFinger(activeTarget)}.`)
        return
      }
      const frames = frameBuffer.current.around(event.timeStamp)
      const check = validateCalibrationSample(activeTarget, pendingCentre, frames, event.timeStamp)
      if (!check.ok || !check.sample) {
        setCalibrationError(check.reason ?? 'That sample was unclear. Try once more.')
        return
      }
      const nextKeys = { ...calibrationKeys, [activeTarget.code]: check.sample }
      setCalibrationKeys(nextKeys)
      setCalibrationError(null)
      setPendingCentre(null)
      if (calibrationIndex === FINGER_TARGETS.length - 1) {
        const record: CalibrationRecord = {
          version: CALIBRATION_VERSION,
          createdAt: new Date().toISOString(),
          camera: cameraInfo,
          keys: nextKeys,
        }
        saveCalibration(record)
        setSavedCalibration(record)
        setCalibration(record)
        setStage('confirm')
      } else {
        setCalibrationIndex((current) => current + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTarget, calibrationIndex, calibrationKeys, camera.info, pendingCentre, stage])

  const finishWord = useCallback((word: string, nextTyped: string, nextObservations: ObservedKeypress[]) => {
    const grade = gradeWord(word, nextTyped, nextObservations)
    const finalWord = wordIndex === LESSON_WORDS.length - 1
    setStatistics((current) => {
      const startedAt = current.startedAt ?? nextObservations[0]?.timestamp ?? performance.now()
      const graded = applyGrade(
        { ...current, startedAt },
        grade,
        grade.outcome === 'pass' ? word.length + (finalWord ? 0 : 1) : 0,
        nextObservations.length,
      )
      return finalWord && grade.outcome === 'pass' ? { ...graded, endedAt: performance.now() } : graded
    })
    setFeedback({ grade, word })
    setTyped('')
    setObservations([])
    if (grade.outcome === 'pass') {
      if (finalWord) {
        camera.stop()
        setStage('results')
      } else {
        setWordIndex((current) => current + 1)
      }
    }
  }, [camera, wordIndex])

  useEffect(() => {
    if (stage !== 'lesson' || !calibration) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.code === 'Backspace') {
        event.preventDefault()
        setTyped((current) => current.slice(0, -1))
        setFeedback(null)
        return
      }
      const target = TARGET_BY_CODE.get(event.code)
      if (!target || !/[a-z,. ]/.test(target.character)) return
      event.preventDefault()
      const word = LESSON_WORDS[wordIndex]
      if (!word) return
      const classification = classifyPress(event.code, event.timeStamp, frameBuffer.current.around(event.timeStamp), calibration)
      const observation: ObservedKeypress = {
        code: event.code,
        actualCharacter: event.key.length === 1 ? event.key.toLowerCase() : target.character,
        expectedCharacter: target.character === ' ' ? ' ' : word[typed.length] ?? '',
        timestamp: event.timeStamp,
        classification,
      }
      const nextObservations = [...observations, observation]
      setFeedback(null)
      if (event.code === 'Space') {
        if (typed.length > 0 && wordIndex < LESSON_WORDS.length - 1) finishWord(word, typed, nextObservations)
        return
      }
      const nextTyped = typed + observation.actualCharacter
      setTyped(nextTyped)
      setObservations(nextObservations)
      if (wordIndex === LESSON_WORDS.length - 1 && nextTyped.length >= word.length) {
        finishWord(word, nextTyped, nextObservations)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [calibration, finishWord, observations, stage, typed, wordIndex])

  const displaySamples = useMemo(() => {
    if (stage !== 'calibration' || !pendingCentre || !activeTarget) return calibration?.keys ?? calibrationKeys
    return {
      ...calibrationKeys,
      [activeTarget.code]: {
        centre: pendingCentre,
        observedHand: activeTarget.hand === 'right' ? 'right' : 'left',
        observedFinger: activeTarget.finger,
        proximity: 0,
        motion: 0,
        confidence: 0,
      } satisfies CalibrationSample,
    }
  }, [activeTarget, calibration, calibrationKeys, pendingCentre, stage])

  const redoCalibration = useCallback(() => {
    clearCalibration()
    setSavedCalibration(null)
    beginCalibration()
  }, [beginCalibration])

  const handleStartAgain = useCallback(() => {
    resetLesson()
    setHandsVisible(0)
    setTrackingStatus('loading')
    setStage('camera')
    void camera.start()
  }, [camera, resetLesson])

  const handleRecalibrateFromResults = useCallback(() => {
    clearCalibration()
    setSavedCalibration(null)
    setCalibration(null)
    handleStartAgain()
  }, [handleStartAgain])

  const cameraMode = stage === 'camera' ? 'setup' : stage === 'calibration' ? 'calibration' : stage === 'confirm' ? 'confirm' : 'lesson'
  const isCameraStage = ['camera', 'calibration', 'confirm', 'lesson'].includes(stage)

  return (
    <main className={`app stage-${stage}`}>
      <AppHeader stage={stage} />
      {stage === 'intro' ? <Intro onStart={() => { setStage('camera'); void camera.start() }} /> : null}
      {isCameraStage ? (
        <div className={`${stage === 'lesson' ? 'lesson-shell' : 'two-column'} page-shell`}>
          {stage === 'camera' ? (
            <CameraSetup
              requesting={camera.requesting}
              cameraActive={Boolean(camera.stream)}
              error={camera.error}
              handsVisible={handsVisible}
              trackingReady={trackingStatus === 'ready'}
              hasSavedCalibration={validSavedCalibration}
              onRequest={() => void camera.start()}
              onCalibrate={beginCalibration}
              onUseSaved={() => { if (savedCalibration) { setCalibration(savedCalibration); setStage('confirm') } }}
            />
          ) : null}
          {stage === 'calibration' && activeTarget ? (
            <CalibrationPanel target={activeTarget} index={calibrationIndex} pendingCentre={pendingCentre} error={calibrationError} onRemark={() => { setPendingCentre(null); setCalibrationError(null) }} />
          ) : null}
          {stage === 'confirm' && calibration ? <Confirmation onConfirm={startLesson} onRedo={redoCalibration} /> : null}
          {stage === 'lesson' && calibration ? (
            <LessonPanel wordIndex={wordIndex} typed={typed} statistics={statistics} feedback={feedback} onRecalibrate={redoCalibration} />
          ) : null}
          {camera.stream ? (
            <CameraPreview
              stream={camera.stream}
              mode={cameraMode}
              activeTarget={stage === 'calibration' ? activeTarget : undefined}
              awaitingCentre={stage === 'calibration' && !pendingCentre}
              keySamples={stage === 'calibration' ? displaySamples : calibration?.keys}
              onCentre={stage === 'calibration' ? (centre) => { setPendingCentre(centre); setCalibrationError(null) } : undefined}
              onFrame={handleFrame}
              onTrackingStatus={(status) => setTrackingStatus(status)}
            />
          ) : <div className="camera-placeholder"><span>Camera preview</span></div>}
        </div>
      ) : null}
      {stage === 'results' ? <Results statistics={statistics} onAgain={handleStartAgain} onRecalibrate={handleRecalibrateFromResults} /> : null}
      <footer><span>Right Typer prototype</span><span>Camera and typing data stay on your Mac</span></footer>
    </main>
  )
}

export default App
