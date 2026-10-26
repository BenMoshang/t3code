import type {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ProviderGoal,
  OrchestrationV2Subagent,
  ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { presentProviderGoal } from "@t3tools/client-runtime/state/thread-execution";
import { childThreadInputsTitle } from "@t3tools/client-runtime/state/threads";
import { GitBranchIcon, MessageCircleIcon, ShieldQuestionIcon, TargetIcon } from "lucide-react";
import { Fragment } from "react";
import { Button, InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BackgroundWorkBanner, presentBackgroundWork } from "./BackgroundWorkBanner";
import type { ComposerBannerStackContent, ComposerBannerStackItem } from "./ComposerBannerStack";

/** Subagents waiting on the user, unless the parent is itself waiting on them. */
export function childInputBannerItem(input: {
  readonly childThreadInputs: ReadonlyArray<EnvironmentThreadShell>;
  readonly parentAwaitingUser: boolean;
  readonly onOpenThread: (threadId: ThreadId) => void;
}): ComposerBannerStackItem | null {
  const { childThreadInputs, onOpenThread } = input;
  const first = childThreadInputs[0];
  if (!first || input.parentAwaitingUser) return null;
  return {
    id: `child-input:${first.id}`,
    variant: "info",
    priority: "activity",
    icon: first.hasPendingApprovals ? <ShieldQuestionIcon /> : <MessageCircleIcon />,
    title: childThreadInputsTitle(childThreadInputs),
    description: childThreadInputs.map((child, index) => (
      <Fragment key={child.id}>
        {index > 0 ? " " : null}
        <span className="whitespace-nowrap">
          <InlineButton tone="muted" onClick={() => onOpenThread(child.id)}>
            {child.title}
          </InlineButton>
          {index < childThreadInputs.length - 1 ? "," : null}
        </span>
      </Fragment>
    )),
    actions: (
      <Button size="xs" variant="ghost" onClick={() => onOpenThread(first.id)}>
        {first.hasPendingApprovals ? "Open approval" : "Open question"}
      </Button>
    ),
  };
}

export function goalBannerItem(input: {
  readonly threadId: ThreadId;
  readonly goal: OrchestrationV2ProviderGoal;
  readonly isWorking: boolean;
  readonly onSendCommand: (text: string, failureMessage: string) => Promise<void>;
}): ComposerBannerStackItem {
  const { isWorking, onSendCommand } = input;
  const presentation = presentProviderGoal(input.goal, isWorking);
  return {
    id: `goal:${input.threadId}`,
    variant: "default",
    priority: "activity",
    icon: <TargetIcon />,
    title:
      presentation.usage === null
        ? presentation.title
        : `${presentation.title} · ${presentation.usage}`,
    description: presentation.objective,
    actions: isWorking ? undefined : (
      <>
        {presentation.canResume ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void onSendCommand("/goal resume", "Failed to resume goal.")}
          >
            Resume
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void onSendCommand("/goal clear", "Failed to clear goal.")}
        >
          Clear
        </Button>
      </>
    ),
  };
}

export function backgroundWorkBannerItem(input: {
  readonly threadId: ThreadId;
  readonly tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
  readonly subagents: ReadonlyArray<OrchestrationV2Subagent>;
  readonly turnItems: Parameters<typeof presentBackgroundWork>[2];
  readonly stopDisabled: boolean;
  readonly stopping: boolean;
  readonly onStop: () => Promise<void>;
  readonly onOpenThread: (threadId: ThreadId) => void;
}): ComposerBannerStackContent | null {
  const presentation = presentBackgroundWork(input.tasks, input.subagents, input.turnItems);
  if (presentation === null) return null;
  return {
    id: `background-work:${input.threadId}`,
    variant: "default",
    priority: "activity",
    content: (
      <BackgroundWorkBanner
        presentation={presentation}
        stopDisabled={input.stopDisabled}
        stopping={input.stopping}
        onStop={input.onStop}
        onOpenThread={input.onOpenThread}
      />
    ),
  };
}

/** The local checkout moved off the branch this thread last ran on. */
export function branchMismatchBannerItem(input: {
  readonly mismatchKey: string;
  readonly mismatch: { readonly threadBranch: string; readonly currentBranch: string };
  readonly restoreDisabled: boolean;
  readonly restoring: boolean;
  readonly onRestore: () => void;
  readonly onDismiss: () => void;
}): ComposerBannerStackItem {
  const { mismatch } = input;
  return {
    id: `branch-mismatch:${input.mismatchKey}`,
    variant: "info",
    icon: <GitBranchIcon />,
    title: (
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-normal text-muted-foreground">Branch changed from</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <code className="min-w-0 truncate font-medium text-foreground">
                {mismatch.threadBranch}
              </code>
            }
          />
          <TooltipPopup side="top">
            This thread last ran on {mismatch.threadBranch}. Sending will continue on{" "}
            {mismatch.currentBranch}.
          </TooltipPopup>
        </Tooltip>
      </span>
    ),
    actions: (
      <Button size="xs" variant="ghost" disabled={input.restoreDisabled} onClick={input.onRestore}>
        {input.restoring ? "Restoring..." : "Restore branch"}
      </Button>
    ),
    dismissLabel: "Dismiss branch change notice",
    onDismiss: input.onDismiss,
  };
}
