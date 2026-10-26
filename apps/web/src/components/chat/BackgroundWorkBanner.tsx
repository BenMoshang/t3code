import type {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2Subagent,
  ThreadId,
} from "@t3tools/contracts";
import {
  presentPendingBackgroundWork,
  type PendingBackgroundWorkPresentation,
} from "@t3tools/client-runtime/state/thread-execution";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import * as DateTime from "effect/DateTime";
import { CheckIcon, CircleDashedIcon, CircleXIcon, TerminalIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ComposerBanner } from "./ComposerBanner";

type RowStatus = "running" | "completed" | "failed";

interface BackgroundWorkRow {
  readonly key: string;
  readonly kind: PendingBackgroundWorkPresentation["items"][number]["kind"];
  readonly label: string;
  readonly activity: string | null;
  readonly status: RowStatus;
  readonly startedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly childThreadId: ThreadId | undefined;
}

export interface BackgroundWorkPresentation {
  readonly title: string;
  readonly waiting: boolean;
  /** The newest live activity, shown while the list is folded. */
  readonly summary: string | null;
  readonly rows: ReadonlyArray<BackgroundWorkRow>;
}

const MAX_ROWS = 4;
const ROW_ORDER: Record<RowStatus, number> = { failed: 0, running: 1, completed: 2 };

const toMs = (value: DateTime.Utc | null) =>
  value === null ? null : DateTime.toEpochMillis(value);

function subagentRowStatus(status: OrchestrationV2Subagent["status"]): RowStatus {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "failed";
  return "running";
}

/**
 * Pending tasks joined with the subagent records the thread projection already carries, so the
 * banner can show each agent's latest progress and its finished siblings without another read.
 */
export function presentBackgroundWork(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
  subagents: ReadonlyArray<OrchestrationV2Subagent>,
): BackgroundWorkPresentation | null {
  const pending = presentPendingBackgroundWork(tasks);
  if (pending === null) return null;
  const byChild = new Map(
    subagents.flatMap((agent) =>
      agent.childThreadId === null ? [] : [[agent.childThreadId, agent] as const],
    ),
  );
  const matched: OrchestrationV2Subagent[] = [];
  const running = pending.items.map((item): BackgroundWorkRow => {
    const agent = item.childThreadId === undefined ? undefined : byChild.get(item.childThreadId);
    if (agent) matched.push(agent);
    return {
      key: item.taskId,
      kind: item.kind,
      label: item.label,
      activity: agent?.progress?.replace(/\s+/gu, " ").trim() || null,
      status: "running",
      startedAtMs: toMs(agent?.startedAt ?? null),
      endedAtMs: null,
      childThreadId: item.childThreadId,
    };
  });
  // Siblings from the same run that already finished; the pending list drops them.
  const runIds = new Set(matched.map((agent) => agent.runId).filter((runId) => runId !== null));
  const matchedIds = new Set(matched.map((agent) => agent.id));
  const finished = subagents
    .filter(
      (agent) =>
        agent.runId !== null &&
        runIds.has(agent.runId) &&
        !matchedIds.has(agent.id) &&
        subagentRowStatus(agent.status) !== "running",
    )
    .map((agent): BackgroundWorkRow => ({
      key: agent.id,
      kind: "subagent",
      label: formatSubagentDisplayTitle(agent.title ?? agent.prompt).trim() || "Subagent",
      activity: (agent.result ?? agent.progress)?.replace(/\s+/gu, " ").trim() || null,
      status: subagentRowStatus(agent.status),
      startedAtMs: toMs(agent.startedAt),
      endedAtMs: toMs(agent.completedAt),
      childThreadId: agent.childThreadId ?? undefined,
    }));
  const rows = [...running, ...finished].toSorted(
    (left, right) => ROW_ORDER[left.status] - ROW_ORDER[right.status],
  );
  const newest = matched
    .filter((agent) => agent.progress?.trim())
    .toSorted(
      (left, right) =>
        DateTime.toEpochMillis(right.updatedAt) - DateTime.toEpochMillis(left.updatedAt),
    )[0];
  const newestRow = newest && running.find((row) => row.childThreadId === newest.childThreadId);
  const summary =
    newestRow?.activity != null
      ? `${newestRow.label}: ${newestRow.activity}`
      : running.length > 1
        ? running.map((row) => row.label).join(", ")
        : null;
  const [only] = rows.length === 1 ? rows : [];
  const allSubagents = rows.every((row) => row.kind === "subagent");
  const title = only
    ? only.kind === "subagent"
      ? `${pending.waiting ? "Waiting on" : "Running"} ${only.label}`
      : pending.title
    : !pending.waiting
      ? `${rows.length} running in background`
      : finished.length > 0 && allSubagents
        ? `Waiting on ${running.length} of ${rows.length} subagents`
        : pending.title;
  return { title, waiting: pending.waiting, summary, rows };
}

/** One arc per agent; finished arcs fill in. Static, so it only repaints when a status changes. */
function ProgressRing({ rows }: { rows: ReadonlyArray<BackgroundWorkRow> }) {
  const radius = 6.25;
  const circumference = 2 * Math.PI * radius;
  const gap = 2.2;
  const segment = circumference / rows.length - gap;
  return (
    <svg viewBox="0 0 16 16" className="-rotate-90" aria-hidden>
      {rows.map((row, index) => (
        <circle
          key={row.key}
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-(index * (circumference / rows.length)) - gap / 2}
          className={
            row.status === "running"
              ? "stroke-foreground/15 light:stroke-foreground/25"
              : "stroke-foreground"
          }
        />
      ))}
    </svg>
  );
}

function HeaderIcon({ rows }: { rows: ReadonlyArray<BackgroundWorkRow> }) {
  if (rows.every((row) => row.kind === "command")) return <TerminalIcon />;
  if (rows.length > 1 && rows.some((row) => row.status !== "running")) {
    return <ProgressRing rows={rows} />;
  }
  return <CircleDashedIcon />;
}

function RowIcon({ row }: { row: BackgroundWorkRow }) {
  const className = "size-3.5";
  if (row.status === "failed") return <CircleXIcon className={cn(className, "text-foreground")} />;
  if (row.status === "completed") {
    return <CheckIcon className={cn(className, "text-muted-foreground")} />;
  }
  if (row.kind !== "subagent") {
    return <TerminalIcon className={cn(className, "text-muted-foreground")} />;
  }
  return null;
}

function Elapsed({ startedAtMs, endedAtMs }: { startedAtMs: number; endedAtMs: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  // oxlint-disable-next-line t3code/react-effect-budget -- writes the ticking label to the DOM so the chat does not re-render every second
  useLayoutEffect(() => {
    const update = () => {
      if (ref.current) {
        const elapsed = Math.max(1_000, (endedAtMs ?? Date.now()) - startedAtMs);
        ref.current.textContent = formatDuration(Math.floor(elapsed / 1_000) * 1_000);
      }
    };
    update();
    if (endedAtMs !== null) return;
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [startedAtMs, endedAtMs]);
  return <span ref={ref} />;
}

const mutedText = "text-muted-foreground/70 light:text-muted-foreground";

function Rows({
  rows,
  onOpenThread,
}: {
  rows: ReadonlyArray<BackgroundWorkRow>;
  onOpenThread: (threadId: ThreadId) => void;
}) {
  const folded = rows.length > MAX_ROWS ? rows.filter((row) => row.status === "completed") : [];
  const shown = folded.length > 0 ? rows.filter((row) => row.status !== "completed") : rows;
  const rowClassName =
    "grid h-7 w-full grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)_auto] items-center gap-x-1 rounded-md pe-2 text-start sm:h-6";
  return (
    <ul className="mt-0.5 grid pb-1" aria-label="Background work">
      {shown.map((row) => {
        const childThreadId = row.childThreadId;
        const content = (
          <>
            <span className="flex justify-center">
              <RowIcon row={row} />
            </span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span
                className={cn(
                  "max-w-[40%] shrink-0 truncate text-foreground @max-[480px]:max-w-[55%]",
                  row.kind === "command" && "font-mono",
                )}
              >
                {row.label}
              </span>
              {row.activity ? (
                <span className={cn("w-0 min-w-0 grow truncate", mutedText)}>{row.activity}</span>
              ) : null}
            </span>
            {row.status === "failed" ? (
              <span className="text-foreground">Failed</span>
            ) : row.startedAtMs !== null ? (
              <span
                className={cn(
                  "text-muted-foreground/60 tabular-nums @max-[480px]:hidden",
                  "light:text-muted-foreground",
                )}
              >
                <Elapsed startedAtMs={row.startedAtMs} endedAtMs={row.endedAtMs} />
              </span>
            ) : null}
          </>
        );
        return (
          <li key={row.key}>
            {childThreadId === undefined ? (
              <div className={rowClassName}>{content}</div>
            ) : (
              <button
                type="button"
                aria-label={`Open subagent ${row.label}`}
                className={cn(
                  rowClassName,
                  "cursor-pointer hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
                onClick={() => onOpenThread(childThreadId)}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
      {folded.length > 0 ? (
        <li className={cn(rowClassName, "text-muted-foreground")}>
          <span className="flex justify-center">
            <CheckIcon className="size-3.5" />
          </span>
          <span>+{folded.length} done</span>
        </li>
      ) : null}
    </ul>
  );
}

export function BackgroundWorkBanner(props: {
  readonly presentation: BackgroundWorkPresentation;
  readonly stopDisabled: boolean;
  readonly stopping: boolean;
  readonly onStop: () => Promise<void>;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { presentation, onOpenThread } = props;
  const [expanded, setExpanded] = useState(false);
  const [single] = presentation.rows.length === 1 ? presentation.rows : [];
  const singleThreadId = single?.childThreadId;
  const description = single ? single.activity : presentation.summary;
  const header = (
    <>
      <ComposerBanner.Icon className="h-(--composer-banner-icon-column) self-start">
        <HeaderIcon rows={presentation.rows} />
      </ComposerBanner.Icon>
      <ComposerBanner.Content className="whitespace-nowrap">
        <span className="min-w-0 shrink-0 truncate font-medium leading-7 sm:leading-6">
          {single?.kind === "command" ? (
            <>
              {presentation.waiting ? "Waiting on " : "Running "}
              <span className="font-mono">{single.label}</span>
            </>
          ) : (
            presentation.title
          )}
        </span>
        {description && !expanded ? (
          <span className={cn("w-0 min-w-0 grow truncate @max-[400px]:sr-only", mutedText)}>
            {description}
          </span>
        ) : null}
      </ComposerBanner.Content>
      <ComposerBanner.Actions className="flex-nowrap">
        {single?.startedAtMs != null ? (
          <span className="px-1 text-muted-foreground/60 tabular-nums light:text-muted-foreground">
            <Elapsed startedAtMs={single.startedAtMs} endedAtMs={null} />
          </span>
        ) : null}
        {single ? null : (
          <span className="flex text-muted-foreground">
            <ComposerBanner.ToggleIcon expanded={expanded} />
          </span>
        )}
      </ComposerBanner.Actions>
    </>
  );
  return (
    <div data-background-work-banner="true">
      <div className="flex items-center">
        {single ? (
          <ComposerBanner.Row className="flex-1">{header}</ComposerBanner.Row>
        ) : (
          <ComposerBanner.Row
            render={<button type="button" />}
            aria-expanded={expanded}
            aria-label={`${presentation.title}. ${expanded ? "Hide" : "Show"} details`}
            className="flex-1"
            onClick={() => setExpanded((value) => !value)}
          >
            {header}
          </ComposerBanner.Row>
        )}
        <span className="flex gap-1 ps-0.5">
          {singleThreadId === undefined ? null : (
            <Button size="xs" variant="ghost-muted" onClick={() => onOpenThread(singleThreadId)}>
              Open
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={props.stopDisabled}
            onClick={() => void props.onStop()}
          >
            {props.stopping ? "Stopping..." : "Stop"}
          </Button>
        </span>
      </div>
      {expanded && !single ? <Rows rows={presentation.rows} onOpenThread={onOpenThread} /> : null}
    </div>
  );
}
