import { useCallback, useEffect, useRef, useState } from "react";
import {
  Coffee,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Timer,
  CheckCheck,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { durationLabel } from "../lib/dates";
import {
  BREAK_MS,
  finishTimer,
  freshTimer,
  pauseTimer,
  readTimer,
  remaining,
  startTimer,
  TIMER_KEY,
  WORK_MS,
} from "../lib/timer";
import type { FocusSession, Task } from "../types";
import { isSameDay } from "date-fns";

export function Pomodoro({
  tasks,
  sessions,
  request,
  compact,
  refresh,
}: {
  tasks: Task[];
  sessions: FocusSession[];
  request: { taskId: number; key: number } | null;
  compact: boolean;
  refresh: () => Promise<void>;
}) {
  const [state, setState] = useState(readTimer);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncing = useRef(false);
  const lastRequest = useRef<number | null>(null);
  const left = remaining(state, now);
  const running = state.runningSince !== null;
  const active = state.startedAt !== null;
  const task = tasks.find((t) => t.id === state.taskId);
  const todaySeconds = sessions
    .filter((s) => isSameDay(new Date(s.ended_at), new Date(now)))
    .reduce((sum, s) => sum + s.elapsed_seconds, 0);

  useEffect(() => {
    try {
      const value = JSON.stringify(state);
      if (localStorage.getItem(TIMER_KEY) !== value)
        localStorage.setItem(TIMER_KEY, value);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TIMER_KEY) setState(readTimer());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      const current = stateRef.current;
      if (current.runningSince !== null && remaining(current, time) === 0) {
        setNotice(
          current.mode === "work"
            ? "Session complete. Take a five-minute break."
            : "Break finished. Ready when you are.",
        );
        setState((previous) =>
          previous.runningSince !== null && remaining(previous, time) === 0
            ? finishTimer(previous, time)
            : previous,
        );
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!request || lastRequest.current === request.key) return;
    lastRequest.current = request.key;
    const current = stateRef.current;
    if (current.startedAt !== null && current.taskId !== request.taskId) {
      setError("Finish the current interval before switching tasks.");
      setExpanded(true);
      return;
    }
    setState((previous) =>
      previous.startedAt === null
        ? freshTimer("work", request.taskId, previous.pending)
        : { ...previous, taskId: request.taskId },
    );
    setExpanded(true);
    setError("");
  }, [request]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    let saved = false;
    try {
      for (const record of stateRef.current.pending) {
        try {
          await api.saveSession(record);
        } catch (err) {
          if (
            err instanceof ApiError &&
            err.status === 404 &&
            record.task_id !== null
          )
            await api.saveSession({ ...record, task_id: null });
          else throw err;
        }
        setState((previous) => ({
          ...previous,
          pending: previous.pending.filter(
            (item) => item.client_session_id !== record.client_session_id,
          ),
        }));
        saved = true;
      }
      if (saved) await refresh();
      setError("");
    } catch (err) {
      setError(`Focus time is waiting to save. ${(err as Error).message}`);
    } finally {
      syncing.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    if (state.pending.length) void sync();
  }, [state.pending.length, sync]);
  useEffect(() => {
    const retry = () => {
      if (stateRef.current.pending.length) void sync();
    };
    const id = window.setInterval(retry, 15000);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", retry);
    };
  }, [sync]);
  const minutes = Math.floor(Math.ceil(left / 1000) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (Math.ceil(left / 1000) % 60).toString().padStart(2, "0");
  const total = state.mode === "work" ? WORK_MS : BREAK_MS;
  function toggle() {
    const time = Date.now();
    setNow(time);
    setNotice("");
    setState((previous) =>
      previous.runningSince === null
        ? startTimer(previous, time)
        : pauseTimer(previous, time),
    );
  }
  return (
    <div
      className={`${compact ? "focus-dock" : "focus-panel"} ${expanded ? "expanded" : ""}`}
    >
      {compact && (
        <button
          className="focus-dock-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Timer size={18} />
          <span>{running ? "Focusing" : "Focus timer"}</span>
          <strong>
            {minutes}:{seconds}
          </strong>
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      <div
        className={`panel pomodoro ${compact && !expanded ? "timer-hidden" : ""}`}
      >
        <div className="focus-title">
          <span>
            <Timer size={16} />
            FOCUS TIMER
          </span>
          <span className="tag">25 / 5</span>
        </div>
        <div className="timer-tabs" aria-label="Timer mode">
          <button
            disabled={active}
            className={state.mode === "work" ? "selected" : ""}
            onClick={() => {
              setState((previous) =>
                freshTimer("work", previous.taskId, previous.pending),
              );
              setNotice("");
            }}
          >
            Focus
          </button>
          <button
            disabled={active}
            className={state.mode === "break" ? "selected" : ""}
            onClick={() => {
              setState((previous) =>
                freshTimer("break", previous.taskId, previous.pending),
              );
              setNotice("");
            }}
          >
            Short break
          </button>
        </div>
        <div
          className={`timer-ring ${state.mode === "break" ? "break-ring" : ""}`}
          style={
            {
              "--timer-progress": `${(1 - left / total) * 360}deg`,
            } as React.CSSProperties
          }
        >
          <div className="timer-ring-inner">
            <span className="timer-mode">
              {state.mode === "work" ? "TIME TO FOCUS" : "TAKE A BREATHER"}
            </span>
            <div
              className="timer-digits"
              role="timer"
              aria-label={`${minutes} minutes ${seconds} seconds remaining`}
            >
              {minutes}
              <span>:</span>
              {seconds}
            </div>
            <span className="timer-status">
              {running
                ? state.mode === "work"
                  ? "One thing at a time"
                  : "Step away for a moment"
                : active
                  ? "Paused"
                  : "Ready when you are"}
            </span>
          </div>
        </div>
        <label className="timer-task-label">
          Working on
          <select
            value={state.taskId ?? ""}
            disabled={active}
            onChange={(e) =>
              setState((previous) => ({
                ...previous,
                taskId: e.target.value ? Number(e.target.value) : null,
              }))
            }
          >
            <option value="">Unlinked focus session</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.status === "completed" ? " (completed)" : ""}
              </option>
            ))}
            {state.taskId !== null && !task && (
              <option value={state.taskId}>
                Deleted task · history retained
              </option>
            )}
          </select>
        </label>
        <div className="timer-actions">
          <button className="button primary" onClick={toggle}>
            {running ? <Pause size={17} /> : <Play size={17} />}{" "}
            {running
              ? "Pause"
              : active
                ? "Resume"
                : state.mode === "work"
                  ? "Start focus"
                  : "Start break"}
          </button>
          {active && (
            <button
              className="icon-button timer-finish"
              aria-label={
                state.mode === "work"
                  ? "Finish and save elapsed work"
                  : "Finish break"
              }
              title={
                state.mode === "work"
                  ? "Finish & save elapsed work"
                  : "Finish break"
              }
              onClick={() => {
                setState((previous) => finishTimer(previous, Date.now()));
                setNotice(
                  state.mode === "work"
                    ? "Elapsed work saved to your session queue."
                    : "Ready for your next session.",
                );
              }}
            >
              <CheckCheck size={20} />
            </button>
          )}
          {!active && (
            <button
              className="icon-button timer-finish"
              aria-label="Reset timer"
              onClick={() => {
                setState((previous) =>
                  freshTimer(previous.mode, previous.taskId, previous.pending),
                );
                setNotice("");
              }}
            >
              <RotateCcw size={17} />
            </button>
          )}
        </div>
        {notice && (
          <p className="timer-notice" role="status">
            {notice}
          </p>
        )}
        {storageError && (
          <p className="form-error">
            Browser storage is unavailable. Keep this tab open to retain the
            timer.
          </p>
        )}
        {error && (
          <div className="timer-error">
            <p role="alert">{error}</p>
            {state.pending.length > 0 && (
              <button className="text-button" onClick={() => void sync()}>
                Retry save
              </button>
            )}
          </div>
        )}
        <div className="focus-summary">
          <Coffee size={16} />
          <span>Focused today</span>
          <strong>{durationLabel(todaySeconds)}</strong>
        </div>
        {state.pending.length > 0 && (
          <p className="pending-label" role="status">
            {state.pending.length} session(s) waiting to save
          </p>
        )}
      </div>
      {!compact && (
        <div className="focus-tip">
          <span className="eyebrow">A SMALL STUDY HABIT</span>
          <p>Break the big assignment into one small next step. Start there.</p>
          <div>
            <span />
            25 minutes of undivided attention
          </div>
        </div>
      )}
    </div>
  );
}
