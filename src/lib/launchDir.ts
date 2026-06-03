import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { loadPreferences } from "@/modules/settings/store";

let cached: string | undefined;

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
}

async function authorizeWorkspaceDir(dir: string): Promise<void> {
  try {
    await invoke("workspace_authorize", {
      path: dir,
      workspace: currentWorkspaceEnv(),
    });
  } catch {
    // Bootstrap may already authorize this root.
  }
}

export async function initLaunchDir(): Promise<void> {
  const cliDir = await invoke<string | null>("get_launch_dir").catch(() => null);
  if (cliDir) {
    cached = normalizeDir(cliDir);
    return;
  }

  const prefs = await loadPreferences();
  const configured = prefs.defaultWorkspaceDir.trim();
  if (configured) {
    cached = normalizeDir(configured);
    await authorizeWorkspaceDir(cached);
    return;
  }

  const fallback = await invoke<string>("workspace_current_dir").catch(() => null);
  cached = fallback ? normalizeDir(fallback) : undefined;
}

export function getLaunchDir(): string | undefined {
  return cached;
}
