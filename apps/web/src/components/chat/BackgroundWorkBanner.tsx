import type { OrchestrationV2PendingBackgroundTask, ThreadId } from "@t3tools/contracts";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { presentPendingBackgroundWork } from "@t3tools/client-runtime/state/thread-execution";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import * as DateTime from "effect/DateTime";
import { CircleDashedIcon, TerminalIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ComposerBanner } from "./ComposerBanner";

interface BackgroundWorkRow {
  readonly key: string;
  readonly isCommand: boolean;
  readonly label: string;
  readonly activity: string | null;
  readonly startedAtMs: number | null;
  readonly childThreadId: ThreadId | undefined;
}

export interface BackgroundWorkPresentation {
  readonly title: string;
  readonly waiting: boolean;
  /** The newest subagent activity, shown while the list is folded. */
  readonly summary: string | null;
  readonly rows: ReadonlyArray<BackgroundWorkRow>;
}

/** Pending tasks joined with their turn items, which already carry each agent's progress. */
export function presentBackgroundWork(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
  turnItems: ThreadStructure["turnItems"],
): BackgroundWorkPresentation | null {
  const pending = presentPendingBackgroundWork(tasks);
  if (pending === null) return null;
  const rows = pending.items.map((task): BackgroundWorkRow & { updatedAtMs: number } => {
    // Same key derivePendingBackgroundWork gives turn-item tasks.
    const item =
      turnItems.findLast(
        (candidate) => (candidate.nativeItemRef?.nativeId || candidate.id) === task.taskId,
      ) ??
      turnItems.findLast(
        (candidate) =>
          candidate.type === "subagent" &&
          task.childThreadId !== undefined &&
          candidate.childThreadId === task.childThreadId,
      );
    const progress = item?.type === "subagent" ? item.progress?.replace(/\s+/gu, " ").trim() : "";
    return {
      key: task.taskId,
      isCommand: task.kind !== "subagent",
      label: task.label,
      activity: progress || null,
      startedAtMs: item?.startedAt ? DateTime.toEpochMillis(item.startedAt) : null,
      updatedAtMs: item?.type === "subagent" ? DateTime.toEpochMillis(item.updatedAt) : 0,
      childThreadId:
        task.childThreadId ?? (item?.type === "subagent" ? item.childThreadId : null) ?? undefined,
    };
  });
  const newest = rows
    .filter((row) => row.activity)
    .toSorted((left, right) => right.updatedAtMs - left.updatedAtMs)[0];
  const [only] = rows.length === 1 ? rows : [];
  const verb = pending.waiting ? "Waiting on" : "Running";
  return {
    title:
      only && !only.isCommand
        ? `${verb} ${only.label}`
        : !only && !pending.waiting
          ? `${rows.length} running in background`
          : pending.title,
    waiting: pending.waiting,
    summary: newest
      ? `${newest.label}: ${newest.activity}`
      : rows.length > 1
        ? rows.map((row) => row.label).join(", ")
        : null,
    rows,
  };
}

function Elapsed({ startedAtMs }: { startedAtMs: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // oxlint-disable-next-line t3code/react-effect-budget -- writes the ticking label to the DOM so the chat does not re-render every second
  useLayoutEffect(() => {
    const update = () => {
      if (ref.current) {
        ref.current.textContent = formatDuration(
          Math.max(1, Math.floor((Date.now() - startedAtMs) / 1_000)) * 1_000,
        );
      }
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [startedAtMs]);
  return (
    <span ref={ref} className="text-muted-foreground/60 tabular-nums light:text-muted-foreground" />
  );
}

const mutedText = "text-muted-foreground/70 light:text-muted-foreground";
const rowClassName =
  "grid h-7 w-full grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)_auto] items-center gap-x-1 rounded-md pe-2 text-start sm:h-6";

function Row({
  row,
  onOpenThread,
}: {
  row: BackgroundWorkRow;
  onOpenThread: (id: ThreadId) => void;
}) {
  const content = (
    <>
      <span className="flex justify-center">
        {row.isCommand ? <TerminalIcon className="size-3.5 text-muted-foreground" /> : null}
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-foreground",
            row.activity && "max-w-[40%] shrink-0 @max-[480px]:max-w-[55%]",
            row.isCommand && "font-mono",
          )}
        >
          {row.label}
        </span>
        {row.activity ? (
          <span className={cn("w-0 min-w-0 grow truncate", mutedText)}>{row.activity}</span>
        ) : null}
      </span>
      {row.startedAtMs === null ? null : (
        <span className="@max-[480px]:hidden">
          <Elapsed startedAtMs={row.startedAtMs} />
        </span>
      )}
    </>
  );
  const childThreadId = row.childThreadId;
  return childThreadId === undefined ? (
    <div className={rowClassName}>{content}</div>
  ) : (
    <button
      type="button"
      className={cn(
        rowClassName,
        "cursor-pointer hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
      )}
      onClick={() => onOpenThread(childThreadId)}
    >
      {content}
    </button>
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
  const description = single ? single.activity : expanded ? null : presentation.summary;
  const header = (
    <>
      <ComposerBanner.Icon className="h-(--composer-banner-icon-column) self-start">
        {presentation.rows.every((row) => row.isCommand) ? <TerminalIcon /> : <CircleDashedIcon />}
      </ComposerBanner.Icon>
      <ComposerBanner.Content className="whitespace-nowrap">
        <span className="min-w-0 truncate font-medium leading-7 sm:leading-6">
          {single?.isCommand ? (
            <>
              {presentation.waiting ? "Waiting on " : "Running "}
              <span className="font-mono">{single.label}</span>
            </>
          ) : (
            presentation.title
          )}
        </span>
        {description ? (
          <span className={cn("w-0 min-w-0 grow truncate @max-[400px]:sr-only", mutedText)}>
            {description}
          </span>
        ) : null}
      </ComposerBanner.Content>
      <ComposerBanner.Actions className="flex-nowrap px-1">
        {single ? (
          single.startedAtMs === null ? null : (
            <Elapsed startedAtMs={single.startedAtMs} />
          )
        ) : (
          <ComposerBanner.ToggleIcon expanded={expanded} />
        )}
      </ComposerBanner.Actions>
    </>
  );
  return (
    <div>
      <span role="status" className="sr-only">
        {presentation.title}
      </span>
      <div className="flex items-center">
        {single ? (
          <ComposerBanner.Row className="flex-1">{header}</ComposerBanner.Row>
        ) : (
          <ComposerBanner.Row
            render={<button type="button" />}
            aria-expanded={expanded}
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
      {expanded && !single ? (
        <ComposerBanner.Scroll>
          <ul className="mt-0.5 grid pb-1" aria-label="Background work">
            {presentation.rows.map((row) => (
              <li key={row.key}>
                <Row row={row} onOpenThread={onOpenThread} />
              </li>
            ))}
          </ul>
        </ComposerBanner.Scroll>
      ) : null}
    </div>
  );
}
