"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, CircleAlert, CircleCheck, Clipboard, Copy, Lightbulb, Loader2, PenLine,
  Sparkles, SpellCheck, Trash2, TrendingUp, Volume2, Wand2, BookOpen, Smile, Gauge,
  Clock, Hash, Type, Download, Settings, Send, Languages, Bot, RefreshCw, ChevronDown,
  Target, FileText, Zap, Heart, AlertCircle, X, Plus, History, BarChart3,
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
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
        {/* Header */}
        <header className="border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <SpellCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  LinguaAI
                </h1>
                <p className="text-[11px] text-muted-foreground -mt-0.5 hidden sm:block">
                  Advanced AI writing assistant · grammar · tone · rewrite · translate
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Writing goal selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Target className="w-4 h-4 mr-1.5" />
                    <span className="hidden sm:inline">{WRITING_GOALS.find(g => g.id === goal)?.label || "Goal"}</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Writing goal</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {WRITING_GOALS.map((g) => (
                    <DropdownMenuItem key={g.id} onClick={() => { setGoal(g.id); if (text) analyze(text, g.id); }} className="flex flex-col items-start gap-0.5 py-2">
                      <div className="flex items-center gap-2">
                        <g.icon className="w-3.5 h-3.5" />
                        <span className="text-sm font-medium">{g.label}</span>
                        {goal === g.id && <Check className="w-3 h-3 ml-auto text-emerald-600" />}
                      </div>
                      <span className="text-[10px] text-muted-foreground pl-5">{g.desc}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Rewrite menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!text.trim() || rewriteLoading}>
                    {rewriteLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                    <span className="hidden sm:inline">Rewrite</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Transform text</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {REWRITE_ACTIONS.map((a) => (
                    <DropdownMenuItem key={a.id} onClick={() => callRewrite(a.id)}>
                      <a.icon className="w-3.5 h-3.5 mr-2" />
                      <span className="text-sm">{a.label}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Change tone</DropdownMenuLabel>
                  <div className="grid grid-cols-2 gap-1 p-1">
                    {TONE_ACTIONS.map((t) => (
                      <Button key={t.id} variant="ghost" size="sm" className="h-7 text-[11px] justify-start" onClick={() => callRewrite(t.id)}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Translate</DropdownMenuLabel>
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {LANGUAGES.map((l) => (
                      <Button key={l} variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => callRewrite("translate", { targetLang: l })}>
                        {l}
                      </Button>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="sm" onClick={loadSample} className="hidden sm:flex">
                <Sparkles className="w-4 h-4 mr-1.5" /> Sample
              </Button>
              <Button variant="outline" size="sm" onClick={() => analyze(text)} disabled={loading || !text.trim() || !assistantEnabled}>
                {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                <span className="hidden sm:inline">Re-check</span>
              </Button>
              {/* Grammarly-style assistant toggle */}
              <Popover open={showTogglePanel} onOpenChange={setShowTogglePanel}>
                <PopoverTrigger asChild>
                  <Button variant={assistantEnabled ? "outline" : "ghost"} size="sm" className={assistantEnabled ? "border-emerald-300 text-emerald-700" : "text-muted-foreground"}>
                    <Settings className="w-4 h-4 mr-1.5" />
                    <span className="hidden sm:inline">Assistant</span>
                    <div className={`ml-1.5 w-7 h-4 rounded-full transition-colors relative ${assistantEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${assistantEnabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0">
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${assistantEnabled ? "bg-emerald-100 dark:bg-emerald-950" : "bg-slate-100 dark:bg-slate-800"}`}>
                          <SpellCheck className={`w-4 h-4 ${assistantEnabled ? "text-emerald-600" : "text-slate-400"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Writing Assistant</p>
                          <p className="text-[10px] text-muted-foreground">{assistantEnabled ? "Active — real-time checking" : "Paused"}</p>
                        </div>
                      </div>
                      <Switch checked={assistantEnabled} onCheckedChange={(v) => { setAssistantEnabled(v); if (v && text.trim()) setTimeout(() => analyze(text), 100); }} />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Check for</p>
                    <div className="space-y-1">
                      {ALL_ISSUE_TYPES.map((type) => (
                        <div key={type} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="flex items-center gap-2">
                            {(() => { const Icon = ISSUE_TYPE_ICONS[type]; return <Icon className="w-3.5 h-3.5 text-muted-foreground" />; })()}
                            <span className="text-sm">{TYPE_LABELS[type]}</span>
                          </div>
                          <Switch
                            checked={categoryToggles[type]}
                            onCheckedChange={(v) => setCategoryToggles((prev) => ({ ...prev, [type]: v }))}
                            disabled={!assistantEnabled}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="p-3 flex items-center justify-between">
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setCategoryToggles({ grammar: true, spelling: true, punctuation: true, style: true, clarity: true, vocabulary: true, capitalization: true })}>
                      Enable all
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setCategoryToggles({ grammar: false, spelling: false, punctuation: false, style: false, clarity: false, vocabulary: false, capitalization: false })}>
                      Disable all
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 h-[calc(100vh-180px)] min-h-[600px]">
            {/* Editor Column */}
            <div className="flex flex-col gap-4 min-h-0">
              {/* Score bar */}
              <Card className="border-emerald-200/50 dark:border-emerald-900/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur">
                <CardContent className="py-3 px-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-slate-800" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="url(#scoreGrad)" strokeWidth="3"
                          strokeDasharray={`${(overallScore / 100) * 94.25} 94.25`} strokeLinecap="round" className="transition-all duration-700" />
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#f59e0b" : overallScore >= 40 ? "#f97316" : "#ef4444"} />
                            <stop offset="100%" stopColor={overallScore >= 80 ? "#14b8a6" : overallScore >= 60 ? "#eab308" : overallScore >= 40 ? "#ea580c" : "#e11d48"} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-sm font-bold ${getScoreColor(overallScore)}`}>{overallScore || "—"}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Writing Score</p>
                      <p className="text-xs text-muted-foreground">{analysis ? `${visibleIssues.length} issues · ${tone?.tone || "—"} tone` : "Start typing to analyze"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(["critical", "warning", "suggestion"] as Severity[]).map((sev) => (
                      <Tooltip key={sev}>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={SEVERITY_STYLES[sev].badge}>
                            {issueCounts[sev]} {SEVERITY_STYLES[sev].label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{issueCounts[sev]} {SEVERITY_STYLES[sev].label.toLowerCase()} issues</TooltipContent>
                      </Tooltip>
                    ))}
                    {visibleIssues.length > 0 && (
                      <Button size="sm" onClick={acceptAll} className="bg-emerald-600 hover:bg-emerald-700">
                        <CircleCheck className="w-4 h-4 mr-1.5" /> Accept all
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Editor */}
              <Card className="flex-1 min-h-0 relative overflow-hidden">
                <CardHeader className="py-3 px-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-emerald-600" /> Editor
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={pasteFromClipboard}>
                          <Clipboard className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Paste</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(text)} disabled={!text}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={speakText} disabled={!text}>
                          <Volume2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Read aloud</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={downloadText} disabled={!text}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={clearText} disabled={!text}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear</TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent className="p-0 relative h-[calc(100%-49px)]">
                  <div
                    ref={highlightRef}
                    aria-hidden
                    className="absolute inset-0 px-4 py-4 overflow-auto pointer-events-auto whitespace-pre-wrap break-words text-base leading-7"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {renderHighlightedText()}
                  </div>
                  <textarea
                    ref={editorRef}
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onScroll={handleScroll}
                    placeholder="Start typing or paste your text here. LinguaAI analyzes grammar, spelling, style, vocabulary, tone, and clarity in real time."
                    spellCheck={false}
                    className="absolute inset-0 px-4 py-4 w-full h-full resize-none bg-transparent text-transparent caret-emerald-600 outline-none whitespace-pre-wrap break-words text-base leading-7"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  />
                  <AnimatePresence>
                    {loading && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-3 right-3 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-full shadow-md border"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        <span className="text-xs font-medium">Analyzing...</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>

              {/* AI Command Box */}
              <Card className="border-emerald-200/50 dark:border-emerald-900/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <input
                      type="text"
                      value={aiCommand}
                      onChange={(e) => setAiCommand(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendAiCommand()}
                      placeholder='Ask AI: "Make this more professional", "Turn into an email", "Make shorter"...'
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                    <Button size="sm" onClick={sendAiCommand} disabled={!aiCommand.trim() || rewriteLoading} className="bg-emerald-600 hover:bg-emerald-700 h-7">
                      {rewriteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {["Make professional", "Make shorter", "Make friendly", "Fix grammar", "Make confident"].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setAiCommand(q); setTimeout(() => callRewrite("ai_command", { instruction: q }), 50); }}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Rewrite Result Panel */}
              <AnimatePresence>
                {(rewriteResult || rewriteLoading) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <Card className="border-emerald-300 dark:border-emerald-800 shadow-md">
                      <CardHeader className="py-2 px-4 flex flex-row items-center justify-between border-b bg-emerald-50/50 dark:bg-emerald-950/30">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Wand2 className="w-4 h-4 text-emerald-600" /> AI Rewrite
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => rewriteResult && copyText(rewriteResult)} disabled={!rewriteResult}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setRewriteResult(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        {rewriteLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> Generating rewrite...
                          </div>
                        ) : (
                          <>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{rewriteResult}</p>
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                              <Button size="sm" onClick={applyRewriteResult} className="bg-emerald-600 hover:bg-emerald-700">
                                <Check className="w-3.5 h-3.5 mr-1" /> Replace original
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => copyText(rewriteResult!)}>
                                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                              </Button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Words", value: stats?.wordCount ?? 0, icon: Hash },
                  { label: "Characters", value: text.length, icon: Type },
                  { label: "Reading", value: stats?.readingTime ?? "0 sec", icon: Clock },
                  { label: "Readability", value: stats?.readabilityScore?.toFixed(0) ?? "—", icon: Gauge },
                ].map((s) => (
                  <Card key={s.label} className="border-slate-200/60">
                    <CardContent className="p-3 flex items-center gap-2">
                      <s.icon className="w-4 h-4 text-emerald-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-semibold">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col min-h-0">
              <Card className="flex-1 min-h-0 flex flex-col">
                <Tabs defaultValue="issues" className="flex-1 flex flex-col min-h-0">
                  <CardHeader className="py-3 px-4 border-b">
                    <TabsList className="grid grid-cols-5 w-full h-9">
                      <TabsTrigger value="issues" className="text-xs">Issues {visibleIssues.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-emerald-600">{visibleIssues.length}</Badge>}</TabsTrigger>
                      <TabsTrigger value="scores" className="text-xs">Scores</TabsTrigger>
                      <TabsTrigger value="vocab" className="text-xs">Vocab {vocab.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-emerald-600">{vocab.length}</Badge>}</TabsTrigger>
                      <TabsTrigger value="tone" className="text-xs">Tone</TabsTrigger>
                      <TabsTrigger value="stats" className="text-xs">Stats</TabsTrigger>
                    </TabsList>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 min-h-0 overflow-hidden">
                    {/* Issues */}
                    <TabsContent value="issues" className="m-0 h-full data-[state=active]:flex flex-col">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Lightbulb className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">No analysis yet</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">Start typing. LinguaAI will surface grammar, spelling, punctuation, style, and clarity issues here.</p>
                            </div>
                          )}
                          {analysis && visibleIssues.length === 0 && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <CircleCheck className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All clear!</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">No issues detected.</p>
                            </div>
                          )}
                          <AnimatePresence>
                            {analysis?.issues.map((issue, idx) => {
                              if (dismissedIssues.has(idx) || acceptedFixes.has(idx)) return null;
                              const style = SEVERITY_STYLES[issue.severity];
                              const isActive = activeIssue === idx;
                              return (
                                <motion.div key={idx} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                                  <Card className={`p-3 cursor-pointer transition-all hover:shadow-md ${isActive ? "ring-2 ring-emerald-500 shadow-md" : "hover:border-emerald-300"}`} onClick={() => setActiveIssue(isActive ? null : idx)}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className={style.badge}>{TYPE_LABELS[issue.type]}</Badge>
                                        <Badge variant="ghost" className="text-[10px] text-muted-foreground">{style.label}</Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2 text-sm flex-wrap">
                                        <span className="line-through text-red-600 dark:text-red-400">{issue.original}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">{issue.suggestion}</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground leading-relaxed">{issue.explanation}</p>
                                    </div>
                                    {isActive && (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center gap-2 mt-3 pt-3 border-t">
                                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7" onClick={(e) => { e.stopPropagation(); acceptFix(idx); }}>
                                          <Check className="w-3.5 h-3.5 mr-1" /> Replace
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); dismissIssue(idx); }}>
                                          Ignore
                                        </Button>
                                        {issue.type === "spelling" && (
                                          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); addToDictionary(issue.original); }}>
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add to dictionary
                                          </Button>
                                        )}
                                      </motion.div>
                                    )}
                                  </Card>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Scores */}
                    <TabsContent value="scores" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <BarChart3 className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Document scores</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">Detailed dimension scores appear here.</p>
                            </div>
                          )}
                          {analysis && scores && (
                            <>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">Overall writing score</span>
                                  <span className={`text-sm font-bold ${getScoreColor(overallScore)}`}>{overallScore}/100</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700" style={{ width: `${overallScore}%` }} />
                                </div>
                              </Card>
                              {[
                                { label: "Grammar", value: scores.grammar, icon: SpellCheck, desc: "Correctness of grammar, spelling, punctuation" },
                                { label: "Clarity", value: scores.clarity, icon: Lightbulb, desc: "How easy the text is to understand" },
                                { label: "Readability", value: scores.readability, icon: Gauge, desc: "Flesch reading ease score" },
                                { label: "Vocabulary", value: scores.vocabulary, icon: BookOpen, desc: "Word diversity and richness" },
                                { label: "Tone", value: scores.tone, icon: Smile, desc: "Tone consistency and appropriateness" },
                                { label: "Conciseness", value: scores.conciseness, icon: ChevronDown, desc: "Lack of unnecessary words" },
                                { label: "Engagement", value: scores.engagement, icon: Heart, desc: "How engaging the writing is" },
                              ].map((s) => (
                                <Card key={s.label} className="p-3">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <s.icon className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-sm font-medium">{s.label}</span>
                                    </div>
                                    <span className={`text-sm font-bold ${getScoreColor(s.value)}`}>{s.value}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div className={`h-full bg-gradient-to-r ${s.value >= 80 ? "from-emerald-500 to-teal-500" : s.value >= 60 ? "from-amber-500 to-yellow-500" : "from-red-500 to-rose-500"} transition-all duration-700`} style={{ width: `${s.value}%` }} />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1.5">{s.desc}</p>
                                </Card>
                              ))}
                              <Card className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
                                <div className="flex items-center gap-2 mb-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-semibold">Top priority improvements</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {issueCounts.critical > 0 ? `Fix ${issueCounts.critical} critical issue${issueCounts.critical > 1 ? "s" : ""} first.` : "Polish style and clarity next."}
                                </p>
                              </Card>
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Vocabulary */}
                    <TabsContent value="vocab" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <BookOpen className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Vocabulary suggestions</p>
                            </div>
                          )}
                          {analysis && vocab.length === 0 && (
                            <div className="text-center py-12 px-4">
                              <CircleCheck className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                              <p className="text-sm font-medium">Vocabulary is on point</p>
                            </div>
                          )}
                          {vocab.map((v, idx) => (
                            <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                              <Card className="p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <BookOpen className="w-4 h-4 text-emerald-600" />
                                  <span className="text-sm font-medium line-through text-muted-foreground">{v.word}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {v.alternatives.map((alt, i) => (
                                    <Button key={i} size="sm" variant="outline" className="h-6 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => {
                                      const regex = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                                      const match = text.match(regex);
                                      if (match && match.index !== undefined) {
                                        const newText = text.slice(0, match.index) + alt + text.slice(match.index + match[0].length);
                                        setText(newText);
                                        toast.success(`Replaced "${v.word}" → "${alt}"`);
                                        setTimeout(() => analyze(newText), 400);
                                      }
                                    }}>
                                      {alt}
                                    </Button>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">{v.reason}</p>
                              </Card>
                            </motion.div>
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Tone */}
                    <TabsContent value="tone" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-3">
                          {!analysis && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Smile className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Tone analysis</p>
                            </div>
                          )}
                          {analysis && tone && (
                            <>
                              <Card className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Smile className="w-5 h-5 text-emerald-600" />
                                  <h3 className="text-sm font-semibold">Detected Tone</h3>
                                </div>
                                <div className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{tone.tone}</div>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${tone.confidence}%` }} />
                                  </div>
                                  <span className="text-xs font-medium">{tone.confidence}%</span>
                                </div>
                              </Card>
                              <div className="grid grid-cols-2 gap-2">
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-1">Formality</p>
                                  <p className="text-sm font-semibold capitalize">{tone.formality}</p>
                                </Card>
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-1">Sentiment</p>
                                  <p className="text-sm font-semibold capitalize">{tone.sentiment}</p>
                                </Card>
                              </div>
                              <Card className="p-3">
                                <h3 className="text-xs font-semibold mb-2">Change tone</h3>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {TONE_ACTIONS.map((t) => (
                                    <Button key={t.id} size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={rewriteLoading || !text} onClick={() => callRewrite(t.id)}>
                                      {t.label}
                                    </Button>
                                  ))}
                                </div>
                              </Card>
                              {analysis.correctedText && analysis.correctedText !== text && (
                                <Card className="p-4">
                                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-600" /> Corrected version
                                  </h3>
                                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap mb-2">{analysis.correctedText}</p>
                                  <Button size="sm" variant="outline" className="w-full" onClick={() => { setText(analysis.correctedText); toast.success("Replaced"); setTimeout(() => analyze(analysis.correctedText), 400); }}>
                                    Use this version
                                  </Button>
                                </Card>
                              )}
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Stats */}
                    <TabsContent value="stats" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Gauge className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Writing statistics</p>
                            </div>
                          )}
                          {analysis && stats && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: "Words", value: stats.wordCount },
                                  { label: "Sentences", value: stats.sentenceCount },
                                  { label: "Unique words", value: stats.uniqueWords },
                                  { label: "Avg w/s", value: stats.averageWordsPerSentence },
                                ].map((s) => (
                                  <Card key={s.label} className="p-3">
                                    <p className="text-xs text-muted-foreground mb-0.5">{s.label}</p>
                                    <p className="text-lg font-bold">{s.value}</p>
                                  </Card>
                                ))}
                              </div>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-muted-foreground">Readability (Flesch)</span>
                                  <Badge variant="outline" className="text-xs">{getReadabilityLabel(stats.readabilityScore)}</Badge>
                                </div>
                                <div className="text-2xl font-bold text-emerald-600">{stats.readabilityScore.toFixed(0)}</div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-2">
                                  <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${stats.readabilityScore}%` }} />
                                </div>
                              </Card>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-muted-foreground">Lexical diversity</span>
                                  <span className="text-sm font-bold">{(stats.lexicalDiversity * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${stats.lexicalDiversity * 100}%` }} />
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">Ratio of unique words to total words.</p>
                              </Card>
                              <Card className="p-3 flex items-center gap-3">
                                <Clock className="w-5 h-5 text-emerald-600" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Reading time</p>
                                  <p className="text-sm font-semibold">{stats.readingTime}</p>
                                </div>
                              </Card>
                              {dictionary.length > 0 && (
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Personal dictionary ({dictionary.length})</p>
                                  <div className="flex flex-wrap gap-1">
                                    {dictionary.map((w) => (
                                      <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>
                                    ))}
                                  </div>
                                </Card>
                              )}
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            </div>
          </div>
        </main>

        <footer className="mt-auto border-t bg-white/60 dark:bg-slate-950/60 backdrop-blur py-3">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>LinguaAI · Powered by Sarvam AI · Real-time grammar, vocabulary, tone, rewrite & translation</span>
            <span className="hidden sm:flex items-center gap-1">
              <CircleAlert className="w-3 h-3" /> APK + extension + advanced editor available in <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/download</code>
            </span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
