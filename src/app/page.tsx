"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, CircleAlert, CircleCheck, Clipboard, Copy, Lightbulb, Loader2, PenLine,
  Sparkles, SpellCheck, Trash2, TrendingUp, Volume2, Wand2, BookOpen, Smile, Gauge,
  Clock, Hash, Type, Download, Settings, Send, Languages, Bot, RefreshCw, ChevronDown,
  Target, FileText, Zap, Heart, AlertCircle, X, Plus, History, BarChart3, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

// ---------- Types ----------
type IssueType = "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary" | "capitalization";
type Severity = "critical" | "warning" | "suggestion";

interface Issue {
  type: IssueType; original: string; suggestion: string; explanation: string;
  severity: Severity; start: number; end: number;
}
interface ToneInfo { tone: string; confidence: number; formality: "formal" | "neutral" | "informal"; sentiment: "positive" | "neutral" | "negative"; }
interface VocabSuggestion { word: string; alternatives: string[]; reason: string; }
interface Stats { wordCount: number; sentenceCount: number; averageWordsPerSentence: number; readabilityScore: number; readingTime: string; uniqueWords: number; lexicalDiversity: number; }
interface Scores { grammar: number; clarity: number; readability: number; vocabulary: number; tone: number; conciseness: number; engagement: number; }
interface GrammarResponse {
  issues: Issue[]; correctedText: string; tone: ToneInfo; vocabulary: VocabSuggestion[];
  stats: Stats; overallScore: number; scores?: Scores; goal?: string; error?: string;
}
interface RewriteResponse { result: string; alternatives?: string[]; error?: string; }

const SAMPLE_TEXT = `I has been working on this project for almost three months now, and i think we are ready to launch. The team have done a great job, and their commited to delivering high-quality results. Its been a incredible journey, and we learnt alot from our mistakes.`;

const SEVERITY_STYLES: Record<Severity, { underline: string; badge: string; label: string }> = {
  critical: { underline: "decoration-red-500 decoration-wavy decoration-2", badge: "bg-red-100 text-red-700 border-red-200", label: "Critical" },
  warning: { underline: "decoration-amber-500 decoration-wavy decoration-2", badge: "bg-amber-100 text-amber-700 border-amber-200", label: "Warning" },
  suggestion: { underline: "decoration-emerald-500 decoration-dotted decoration-2", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Suggestion" },
};

const TYPE_LABELS: Record<IssueType, string> = {
  grammar: "Grammar", spelling: "Spelling", punctuation: "Punctuation",
  style: "Style", clarity: "Clarity", vocabulary: "Vocabulary", capitalization: "Capitalization",
};

const ALL_ISSUE_TYPES: IssueType[] = ["grammar", "spelling", "punctuation", "style", "clarity", "vocabulary", "capitalization"];

const ISSUE_TYPE_ICONS: Record<IssueType, typeof SpellCheck> = {
  grammar: SpellCheck, spelling: SpellCheck, punctuation: SpellCheck,
  style: PenLine, clarity: Lightbulb, vocabulary: BookOpen, capitalization: Type,
};

const WRITING_GOALS = [
  { id: "general", label: "General", icon: Type, desc: "Balanced suggestions" },
  { id: "professional", label: "Professional", icon: Briefcase, desc: "Clear, polished business writing" },
  { id: "academic", label: "Academic", icon: BookOpen, desc: "Formal, structured, precise" },
  { id: "business", label: "Business", icon: Briefcase, desc: "Concise, action-oriented" },
  { id: "casual", label: "Casual", icon: Smile, desc: "Relaxed, friendly tone" },
  { id: "email", label: "Email", icon: Send, desc: "Subject lines, CTAs, follow-ups" },
  { id: "marketing", label: "Marketing", icon: Zap, desc: "Engaging, persuasive" },
  { id: "technical", label: "Technical", icon: Gauge, desc: "Precise, accurate" },
  { id: "creative", label: "Creative", icon: Sparkles, desc: "Expressive, original" },
  { id: "social", label: "Social Media", icon: Heart, desc: "Short, punchy" },
] as const;

const TONE_ACTIONS = [
  { id: "professional", label: "Professional" },
  { id: "formal", label: "Formal" },
  { id: "casual", label: "Casual" },
  { id: "friendly", label: "Friendly" },
  { id: "confident", label: "Confident" },
  { id: "polite", label: "Polite" },
  { id: "diplomatic", label: "Diplomatic" },
  { id: "persuasive", label: "Persuasive" },
  { id: "concise", label: "Concise" },
  { id: "direct", label: "Direct" },
  { id: "empathetic", label: "Empathetic" },
  { id: "enthusiastic", label: "Enthusiastic" },
  { id: "authoritative", label: "Authoritative" },
];

const REWRITE_ACTIONS = [
  { id: "improve", label: "Improve", icon: TrendingUp },
  { id: "rewrite", label: "Rewrite", icon: RefreshCw },
  { id: "shorten", label: "Shorten", icon: ChevronDown },
  { id: "expand", label: "Expand", icon: Plus },
  { id: "simplify", label: "Simplify", icon: Sparkles },
  { id: "clarify", label: "Clarify", icon: Lightbulb },
  { id: "natural", label: "Make Natural", icon: Smile },
  { id: "engaging", label: "Make Engaging", icon: Heart },
  { id: "stronger", label: "Make Stronger", icon: Zap },
];

const LANGUAGES = ["Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Korean", "Arabic", "Hindi", "Russian", "Dutch"];

function Briefcase(props: any) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getReadabilityLabel(score: number): string {
  if (score >= 90) return "Very Easy";
  if (score >= 80) return "Easy";
  if (score >= 70) return "Fairly Easy";
  if (score >= 60) return "Standard";
  if (score >= 50) return "Fairly Difficult";
  if (score >= 30) return "Difficult";
  return "Very Difficult";
}

export default function Home() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<GrammarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [acceptedFixes, setAcceptedFixes] = useState<Set<number>>(new Set());
  const [dismissedIssues, setDismissedIssues] = useState<Set<number>>(new Set());
  const [goal, setGoal] = useState<string>("general");
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<string | null>(null);
  const [aiCommand, setAiCommand] = useState("");
  const [dictionary, setDictionary] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [assistantEnabled, setAssistantEnabled] = useState(true);
  const [categoryToggles, setCategoryToggles] = useState<Record<IssueType, boolean>>({
    grammar: true, spelling: true, punctuation: true,
    style: true, clarity: true, vocabulary: true, capitalization: true,
  });
  const [showTogglePanel, setShowTogglePanel] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const analyze = useCallback(async (value: string, g: string = goal) => {
    if (!value.trim()) {
      setAnalysis(null);
      setLoading(false);
      return;
    }
    if (!assistantEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
      setError(null);
    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, goal: g }),
      });
      const data: GrammarResponse = await res.json();
      setAnalysis(data);
      setAcceptedFixes(new Set());
      setDismissedIssues(new Set());
      if (data.error) toast.error("Analysis issue", { description: data.error });
    } catch (err: any) {
      toast.error("Network error", { description: err?.message });
        setError(err?.message || "Failed to analyze text");
    } finally {
      setLoading(false);
    }
  }, [goal]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    setRewriteResult(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => analyze(value), 1200);
  }, [analyze]);

  const handleScroll = useCallback(() => {
    if (editorRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop;
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, []);

  const visibleIssues = useMemo(() => {
    if (!analysis || !assistantEnabled) return [];
    return analysis.issues.filter((issue, idx) =>
      !dismissedIssues.has(idx) &&
      !acceptedFixes.has(idx) &&
      categoryToggles[issue.type] !== false,
    );
  }, [analysis, dismissedIssues, acceptedFixes, assistantEnabled, categoryToggles]);

  const issueCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, warning: 0, suggestion: 0 };
    visibleIssues.forEach((i) => counts[i.severity]++);
    return counts;
  }, [visibleIssues]);

  const callRewrite = useCallback(async (action: string, opts: { instruction?: string; targetLang?: string } = {}) => {
    if (!text.trim()) {
      toast.error("Nothing to rewrite", { description: "Write some text first." });
      return;
    }
    setRewriteLoading(true);
    setRewriteResult(null);
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, action, goal, ...opts }),
      });
      const data: RewriteResponse = await res.json();
      if (data.error) {
        toast.error("Rewrite failed", { description: data.error });
      } else if (data.result) {
        setRewriteResult(data.result);
        toast.success("Rewrite ready");
      }
    } catch (err: any) {
      toast.error("Network error", { description: err?.message });
    } finally {
      setRewriteLoading(false);
    }
  }, [text, goal]);

  const sendAiCommand = useCallback(() => {
    if (!aiCommand.trim()) return;
    callRewrite("ai_command", { instruction: aiCommand });
    setAiCommand("");
  }, [aiCommand, callRewrite]);

  const renderHighlightedText = () => {
    if (!text) return null;
    if (!analysis || visibleIssues.length === 0) {
      return <span className="text-transparent">{text}</span>;
    }
    const sorted = [...visibleIssues]
      .map((issue) => ({ issue, originalIdx: analysis.issues.indexOf(issue) }))
      .sort((a, b) => a.issue.start - b.issue.start);
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    let kc = 0;
    for (const { issue, originalIdx } of sorted) {
      if (issue.start < lastEnd || issue.start >= text.length) continue;
      if (issue.end > text.length || issue.end <= issue.start) continue;
      if (issue.start > lastEnd) {
        parts.push(<span key={`t-${kc++}`} className="text-transparent">{text.slice(lastEnd, issue.start)}</span>);
      }
      const style = SEVERITY_STYLES[issue.severity];
      parts.push(
        <span
          key={`i-${kc++}`}
          className={`underline ${style.underline} cursor-pointer transition-colors`}
          onClick={() => setActiveIssue(originalIdx)}
        >
          {text.slice(issue.start, issue.end)}
        </span>
      );
      lastEnd = issue.end;
    }
    if (lastEnd < text.length) {
      parts.push(<span key={`t-${kc++}`} className="text-transparent">{text.slice(lastEnd)}</span>);
    }
    return parts;
  };

  const acceptFix = (idx: number) => {
    const issue = analysis?.issues[idx];
    if (!issue) return;
    const newText = text.slice(0, issue.start) + issue.suggestion + text.slice(issue.end);
    setText(newText);
    setAcceptedFixes((prev) => new Set(prev).add(idx));
    setActiveIssue(null);
    toast.success("Fix applied", { description: `"${issue.original}" → "${issue.suggestion}"` });
    setTimeout(() => analyze(newText), 500);
  };

  const dismissIssue = (idx: number) => {
    setDismissedIssues((prev) => new Set(prev).add(idx));
    setActiveIssue(null);
  };

  const acceptAll = () => {
    if (!analysis?.correctedText) return;
    setText(analysis.correctedText);
    toast.success("All fixes applied");
    setTimeout(() => analyze(analysis.correctedText), 500);
  };

  const copyText = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied to clipboard");
  };

  const clearText = () => {
    setText(""); setAnalysis(null); setActiveIssue(null);
    setAcceptedFixes(new Set()); setDismissedIssues(new Set());
    setRewriteResult(null);
    toast.success("Editor cleared");
  };

  const loadSample = () => {
    handleTextChange(SAMPLE_TEXT);
    toast.success("Sample text loaded");
  };

  const speakText = () => {
    if (!text) { toast.error("Nothing to read aloud"); return; }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      window.speechSynthesis.speak(u);
      toast.success("Reading aloud...");
    }
  };

  const downloadText = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "linguaai-text.txt"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { handleTextChange(t); toast.success("Pasted"); }
      else toast.error("Clipboard is empty");
    } catch { toast.error("Could not read clipboard"); }
  };

  const addToDictionary = (word: string) => {
    setDictionary((d) => d.includes(word) ? d : [...d, word]);
    toast.success(`Added "${word}" to personal dictionary`);
  };

  const applyRewriteResult = () => {
    if (!rewriteResult) return;
    setText(rewriteResult);
    setRewriteResult(null);
    toast.success("Replaced with rewritten version");
    setTimeout(() => analyze(rewriteResult), 500);
  };

  const stats = analysis?.stats;
  const tone = analysis?.tone;
  const vocab = analysis?.vocabulary ?? [];
  const overallScore = analysis?.overallScore ?? 0;
  const scores = analysis?.scores;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-slate-950">
        {/* ---------- Top bar ---------- */}
        <header className="shrink-0 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                <SpellCheck className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight flex items-center gap-1.5">
                  LinguaAI
                </h1>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-tight hidden sm:block">
                  AI writing assistant
                </p>
              </div>
            </div>

            {/* Assistant toggle + settings */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 pr-2 border-r border-gray-200 dark:border-slate-800">
                <span className="text-xs font-medium text-gray-600 dark:text-slate-300">Assistant</span>
                <Switch
                  checked={assistantEnabled}
                  onCheckedChange={setAssistantEnabled}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>

              <Popover open={showTogglePanel} onOpenChange={setShowTogglePanel}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-200">
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">Categories</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800 dark:text-slate-100">Check categories</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700"
                        onClick={() => setCategoryToggles({ grammar: true, spelling: true, punctuation: true, style: true, clarity: true, vocabulary: true, capitalization: true })}>
                        Enable all
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-gray-500 hover:text-gray-700"
                        onClick={() => setCategoryToggles({ grammar: false, spelling: false, punctuation: false, style: false, clarity: false, vocabulary: false, capitalization: false })}>
                        Disable all
                      </Button>
                    </div>
                  </div>
                  <div className="p-1">
                    {ALL_ISSUE_TYPES.map((t) => {
                      const Icon = ISSUE_TYPE_ICONS[t];
                      return (
                        <label key={t} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer">
                          <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                            <Icon className="w-3.5 h-3.5 text-gray-400" />
                            {TYPE_LABELS[t]}
                          </span>
                          <Switch
                            checked={categoryToggles[t]}
                            onCheckedChange={(v) => setCategoryToggles((prev) => ({ ...prev, [t]: v }))}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </header>

        {/* ---------- Split layout ---------- */}
        <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
          {/* ===== Left: editor ===== */}
          <section className="flex flex-col min-h-0 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            {/* Editor toolbar */}
            <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600" onClick={pasteFromClipboard}>
                      <Clipboard className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Paste</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600" onClick={() => copyText(text)} disabled={!text}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600" onClick={downloadText} disabled={!text}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600" onClick={speakText} disabled={!text}>
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Read aloud</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-gray-600 hover:text-emerald-600" onClick={loadSample}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sample
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-gray-600 hover:text-red-600" onClick={clearText} disabled={!text}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
                </Button>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
                <span className="hidden sm:flex items-center gap-1"><Type className="w-3 h-3" />{text.length} chars</span>
              </div>
            </div>

            {/* Textarea */}
            <div className="flex-1 min-h-0 relative">
              <textarea
                ref={editorRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onScroll={handleScroll}
                placeholder="Start writing or paste your text here… LinguaAI will check grammar, spelling, clarity, and tone in real time."
                spellCheck={false}
                className="absolute inset-0 w-full h-full resize-none bg-transparent px-4 sm:px-8 py-6 text-[15px] leading-7 text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-600 focus:outline-none"
              />
              {loading && (
                <div className="absolute top-3 right-4 flex items-center gap-1.5 text-xs text-emerald-600 bg-white/80 dark:bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-full shadow-sm border border-gray-100 dark:border-slate-800">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                </div>
              )}
            </div>

            {/* Bottom action bar: Check + score */}
            <div className="shrink-0 border-t border-gray-100 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 bg-gray-50/60 dark:bg-slate-900/40">
              <Button
                size="sm"
                onClick={() => analyze(text)}
                disabled={!text.trim() || loading || !assistantEnabled}
                className="gap-1.5 h-9 px-4 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Check
              </Button>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 leading-none">Score</p>
                  <p className={`text-lg font-bold leading-tight ${getScoreColor(overallScore)}`}>
                    {analysis ? overallScore : "—"}
                  </p>
                </div>
                <div className="relative w-11 h-11">
                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-200 dark:text-slate-800" />
                    <circle
                      cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                      className={getScoreColor(overallScore)}
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - (analysis ? overallScore : 0) / 100)}`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                    {analysis ? `${overallScore}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ===== Right: suggestions panel ===== */}
          <aside className="flex flex-col min-h-0 bg-gray-50 dark:bg-slate-950">
            {/* Panel header */}
            <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Suggestions</h2>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-tight">
                    {analysis ? `${visibleIssues.length} issue${visibleIssues.length === 1 ? "" : "s"} found` : "Run a check to see suggestions"}
                  </p>
                </div>
              </div>
              {analysis && visibleIssues.length > 0 && (
                <Button size="sm" variant="outline"
                  className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/30 dark:text-emerald-400"
                  onClick={acceptAll}>
                  <Check className="w-3.5 h-3.5" /> Accept all
                </Button>
              )}
            </div>

            {/* Stats summary by issue type */}
            {analysis && (
              <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ISSUE_TYPES.map((t) => {
                    const count = analysis.issues.filter((i) => i.type === t).length;
                    if (count === 0) return null;
                    return (
                      <Badge key={t} variant="outline" className="text-[10px] py-0.5 px-2 gap-1 bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300">
                        {TYPE_LABELS[t]} <span className="font-semibold text-gray-800 dark:text-slate-100">{count}</span>
                      </Badge>
                    );
                  })}
                  {analysis.issues.length === 0 && (
                    <span className="text-[11px] text-emerald-600 flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> No issues detected</span>
                  )}
                </div>
              </div>
            )}

            {/* Issue list */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 space-y-2.5">
                {!analysis && !loading && !error && (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                      <PenLine className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-200">No suggestions yet</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-[220px]">Write something and hit Check to get grammar, clarity and tone suggestions.</p>
                  </div>
                )}

                {loading && !analysis && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    <p className="text-xs text-gray-400">Analyzing your text…</p>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {analysis && visibleIssues.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                      <CircleCheck className="w-7 h-7 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-200">All clear!</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">No issues to address in your text.</p>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {visibleIssues.map((issue, i) => {
                    const originalIdx = analysis!.issues.indexOf(issue);
                    const sev = SEVERITY_STYLES[issue.severity];
                    const Icon = ISSUE_TYPE_ICONS[issue.type];
                    return (
                      <motion.div
                        key={`${originalIdx}-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                      >
                        <Card className="p-3.5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
                          {/* Badge row */}
                          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] py-0 px-2 gap-1 font-medium border ${sev.badge}`}>
                              <Icon className="w-3 h-3" />
                              {TYPE_LABELS[issue.type]}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] py-0 px-2 font-medium border ${sev.badge}`}>
                              {sev.label}
                            </Badge>
                          </div>

                          {/* Original -> suggestion */}
                          <div className="flex items-start gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-0.5">Original</p>
                              <p className="text-sm text-red-600 dark:text-red-400 line-through decoration-red-300/70 break-words">{issue.original || "—"}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600 shrink-0 mt-5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-0.5">Suggestion</p>
                              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium break-words">{issue.suggestion || "—"}</p>
                            </div>
                          </div>

                          {/* Explanation */}
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 leading-relaxed">{issue.explanation}</p>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="h-8 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => acceptFix(originalIdx)}>
                              <Check className="w-3.5 h-3.5" /> Apply fix
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-gray-500 hover:text-gray-700 dark:hover:text-slate-200" onClick={() => dismissIssue(originalIdx)}>
                              <X className="w-3.5 h-3.5" /> Dismiss
                            </Button>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </aside>
        </main>
      </div>
    </TooltipProvider>
  );
}
