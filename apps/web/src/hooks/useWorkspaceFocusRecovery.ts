import { useEffect, useLayoutEffect, useRef } from "react";
import {
  isWorkspaceElementVisible,
  requestWorkspaceContentFocus,
  requestWorkspaceFocus,
} from "../lib/workspaceFocus";

/** Recover a focused control when a responsive layout removes or hides its area. */
export function useWorkspaceFocusRecovery(
  selector: string,
  layout: string | boolean,
  fallbackArea?: string,
) {
  const ownedFocus = useRef<HTMLElement | null>(null);
  const previousLayout = useRef(layout);
  // oxlint-disable-next-line t3code/react-effect-budget -- Tracks DOM focus, which React does not own.
  useEffect(() => {
    const remember = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        ownedFocus.current = active.closest(selector) ? active : null;
      }
    };
    remember();
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [selector]);
  // oxlint-disable-next-line t3code/react-effect-budget -- A layout change can hide the focused element; recover before paint.
  useLayoutEffect(() => {
    if (previousLayout.current === layout) return;
    previousLayout.current = layout;
    const previous = ownedFocus.current;
    if (!previous || isWorkspaceElementVisible(previous)) return;
    if (document.activeElement !== document.body && document.activeElement !== previous) return;
    ownedFocus.current = null;
    if (fallbackArea) requestWorkspaceFocus({ area: fallbackArea });
    else requestWorkspaceContentFocus();
  }, [layout, fallbackArea]);
}
