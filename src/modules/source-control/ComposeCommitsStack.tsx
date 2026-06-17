import { cn } from "@/lib/utils";
import type { GitComposeTab, Tab } from "@/modules/tabs";
import { ComposeCommitsPane } from "./ComposeCommitsPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onPendingAnalyzeHandled: (tabId: number) => void;
  onRefreshSourceControl: () => Promise<void> | void;
};

export function ComposeCommitsStack({
  tabs,
  activeId,
  onPendingAnalyzeHandled,
  onRefreshSourceControl,
}: Props) {
  const composeTabs = tabs.filter(
    (tab): tab is GitComposeTab => tab.kind === "git-compose",
  );

  if (composeTabs.length === 0) return null;

  return (
    <>
      {composeTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "absolute inset-0",
            tab.id !== activeId && "invisible pointer-events-none",
          )}
          aria-hidden={tab.id !== activeId}
        >
          <ComposeCommitsPane
            tab={tab}
            onPendingAnalyzeHandled={() => onPendingAnalyzeHandled(tab.id)}
            onRefreshSourceControl={onRefreshSourceControl}
          />
        </div>
      ))}
    </>
  );
}
