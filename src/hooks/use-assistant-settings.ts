import { useState, useCallback, useEffect } from "react";

export type IssueCategory =
  | "grammar" | "spelling" | "punctuation"
  | "style" | "clarity" | "vocabulary" | "capitalization";

export const ALL_CATEGORIES: IssueCategory[] = [
  "grammar", "spelling", "punctuation",
  "style", "clarity", "vocabulary", "capitalization",
];

export interface AssistantSettings {
  enabled: boolean;
  categories: Record<IssueCategory, boolean>;
}

const DEFAULT_SETTINGS: AssistantSettings = {
  enabled: true,
  categories: {
    grammar: true, spelling: true, punctuation: true,
    style: true, clarity: true, vocabulary: true, capitalization: true,
  },
};

const STORAGE_KEY = "linguaai-assistant-settings";

function loadSettings(): AssistantSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? true,
        categories: { ...DEFAULT_SETTINGS.categories, ...(parsed.categories ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function useAssistantSettings() {
  // Lazy initializer reads localStorage once on mount — no effect needed.
  const [settings, setSettings] = useState<AssistantSettings>(loadSettings);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }, [settings]);

  const toggleEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => ({ ...prev, enabled }));
  }, []);

  const toggleCategory = useCallback((cat: IssueCategory, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      categories: { ...prev.categories, [cat]: enabled },
    }));
  }, []);

  const enableAllCategories = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      categories: ALL_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: true }), {} as Record<IssueCategory, boolean>),
    }));
  }, []);

  const disableAllCategories = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      categories: ALL_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: false }), {} as Record<IssueCategory, boolean>),
    }));
  }, []);

  return {
    enabled: settings.enabled,
    categories: settings.categories,
    toggleEnabled,
    toggleCategory,
    enableAllCategories,
    disableAllCategories,
  };
}
