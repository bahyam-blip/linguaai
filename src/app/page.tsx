"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Clipboard,
  Copy,
  Lightbulb,
  Loader2,
  PenLine,
  Sparkles,
  SpellCheck,
  Trash2,
  TrendingUp,
  Volume2,
  Wand2,
  BookOpen,
  Smile,
  Gauge,
  Clock,
  Hash,
  Type,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type IssueType = "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary";
type Severity = "critical" | "warning" | "suggestion";

interface Issue {
  type: IssueType;
  original: string;
  suggestion: string;
  explanation: string;
  severity: Severity;
  start: number;
  end: number;
}

interface ToneInfo {
  tone: string;
  confidence: number;
  formality: "formal" | "neutral" | "informal";
  sentiment: "positive" | "neutral" | "negative";
}

interface VocabSuggestion {
  word: string;
  alternatives: string[];
  reason: string;
}

interface Stats {
  wordCount: number;
  sentenceCount: number;
  averageWordsPerSentence: number;
  readabilityScore: number;
  readingTime: string;
  uniqueWords: number;
  lexicalDiversity: number;
}

interface GrammarResponse {
  issues: Issue[];
  correctedText: string;
  tone: ToneInfo;
  vocabulary: VocabSuggestion[];
  stats: Stats;
  overallScore: number;
  error?: string;
}

const SAMPLE_TEXT = `I has been working on this project for almost three months now, and i think we are ready to launch. The team have done a great job, and their commited to delivering high-quality results. Its been a incredible journey, and we learnt alot from our mistakes. We are very excited for the oppurtunity to share this with you, and we hope you will find it usefull. The product is design to be intuitive, and its packed with features that makes your life easier. We can't wait to here your feedback!`;

const SEVERITY_STYLES: Record<Severity, { underline: string; badge: string; label: string }> = {
  critical: { underline: "decoration-red-500 decoration-wavy decoration-2", badge: "bg-red-100 text-red-700 border-red-200", label: "Critical" },
  warning: { underline: "decoration-amber-500 decoration-wavy decoration-2", badge: "bg-amber-100 text-amber-700 border-amber-200", label: "Warning" },
  suggestion: { underline: "decoration-emerald-500 decoration-dotted decoration-2", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Suggestion" },
};

const TYPE_LABELS: Record<IssueType, string> = {
  grammar: "Grammar",
  spelling: "Spelling",
  punctuation: "Punctuation",
  style: "Style",
  clarity: "Clarity",
  vocabulary: "Vocabulary",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "from-emerald-500 to-teal-500";
  if (score >= 60) return "from-amber-500 to-yellow-500";
  if (score >= 40) return "from-orange-500 to-amber-500";
  return "from-red-500 to-rose-500";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const analyze = useCallback(async (value: string) => {
    if (!value.trim()) {
      setAnalysis(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, mode: "full" }),
      });
      const data: GrammarResponse = await res.json();
      if (data.error) {
        toast.error("Analysis failed", { description: data.error });
      }
      setAnalysis(data);
      setAcceptedFixes(new Set());
      setDismissedIssues(new Set());
    } catch (err: any) {
      toast.error("Network error", { description: err?.message || "Could not reach grammar service" });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => analyze(value), 1200);
    },
    [analyze]
  );

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (editorRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop;
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, []);

  const visibleIssues = useMemo(() => {
    if (!analysis) return [];
    return analysis.issues.filter((_, idx) => !dismissedIssues.has(idx) && !acceptedFixes.has(idx));
  }, [analysis, dismissedIssues, acceptedFixes]);

  const issueCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, warning: 0, suggestion: 0 };
    visibleIssues.forEach((i) => {
      counts[i.severity]++;
    });
    return counts;
  }, [visibleIssues]);

  const renderHighlightedText = () => {
    if (!text) return null;
    if (!analysis || visibleIssues.length === 0) {
      return <span className="text-transparent">{text}</span>;
    }

    // Sort issues by start position; ensure no overlaps (skip overlapping)
    const sorted = [...visibleIssues]
      .map((issue, idx) => ({ issue, originalIdx: analysis.issues.indexOf(issue) }))
      .sort((a, b) => a.issue.start - b.issue.start);

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    let keyCounter = 0;

    for (const { issue, originalIdx } of sorted) {
      if (issue.start < lastEnd || issue.start >= text.length) continue;
      if (issue.end > text.length || issue.end <= issue.start) continue;
      if (issue.start > lastEnd) {
        parts.push(
          <span key={`t-${keyCounter++}`} className="text-transparent">
            {text.slice(lastEnd, issue.start)}
          </span>
        );
      }
      const style = SEVERITY_STYLES[issue.severity];
      parts.push(
        <span
          key={`i-${keyCounter++}`}
          className={`underline ${style.underline} cursor-pointer transition-colors`}
          onClick={() => setActiveIssue(originalIdx)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {text.slice(issue.start, issue.end)}
        </span>
      );
      lastEnd = issue.end;
    }
    if (lastEnd < text.length) {
      parts.push(
        <span key={`t-${keyCounter++}`} className="text-transparent">
          {text.slice(lastEnd)}
        </span>
      );
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
    // Re-analyze after a brief delay
    setTimeout(() => analyze(newText), 500);
  };

  const dismissIssue = (idx: number) => {
    setDismissedIssues((prev) => new Set(prev).add(idx));
    setActiveIssue(null);
  };

  const acceptAll = () => {
    if (!analysis?.correctedText) return;
    setText(analysis.correctedText);
    toast.success("All fixes applied", { description: `${visibleIssues.length} improvements accepted` });
    setTimeout(() => analyze(analysis.correctedText), 500);
  };

  const copyText = () => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const clearText = () => {
    setText("");
    setAnalysis(null);
    setActiveIssue(null);
    setAcceptedFixes(new Set());
    setDismissedIssues(new Set());
    toast.success("Editor cleared");
  };

  const pasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        handleTextChange(clipText);
        toast.success("Pasted from clipboard");
      } else {
        toast.error("Clipboard is empty");
      }
    } catch {
      toast.error("Could not read clipboard");
    }
  };

  const loadSample = () => {
    handleTextChange(SAMPLE_TEXT);
    toast.success("Sample text loaded");
  };

  const downloadText = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linguaai-text.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as .txt");
  };

  const speakText = () => {
    if (!text) {
      toast.error("Nothing to read aloud");
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
      toast.success("Reading aloud...");
    } else {
      toast.error("Speech synthesis not supported");
    }
  };

  // Auto-analyze on mount if there's text
  useEffect(() => {
    if (text && !analysis) {
      const t = setTimeout(() => analyze(text), 800);
      return () => clearTimeout(t);
    }
  }, [text, analysis, analyze]);

  const stats = analysis?.stats;
  const tone = analysis?.tone;
  const vocab = analysis?.vocabulary ?? [];
  const overallScore = analysis?.overallScore ?? 0;

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
                  AI grammar &amp; writing assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={loadSample} className="hidden sm:flex">
                <Sparkles className="w-4 h-4 mr-1.5" /> Try sample
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyze(text)}
                disabled={loading || !text.trim()}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-1.5" />
                )}
                Re-check
              </Button>
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
                        <circle
                          cx="18" cy="18" r="15" fill="none" stroke="url(#scoreGrad)" strokeWidth="3"
                          strokeDasharray={`${(overallScore / 100) * 94.25} 94.25`}
                          strokeLinecap="round"
                          className="transition-all duration-700"
                        />
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#f59e0b" : overallScore >= 40 ? "#f97316" : "#ef4444"} />
                            <stop offset="100%" stopColor={overallScore >= 80 ? "#14b8a6" : overallScore >= 60 ? "#eab308" : overallScore >= 40 ? "#ea580c" : "#e11d48"} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-sm font-bold ${getScoreColor(overallScore)}`}>
                          {overallScore || "—"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Writing Score</p>
                      <p className="text-xs text-muted-foreground">
                        {analysis ? `${visibleIssues.length} issues found` : "Start typing to analyze"}
                      </p>
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
                        <TooltipContent>
                          {issueCounts[sev]} {SEVERITY_STYLES[sev].label.toLowerCase()} issues
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {visibleIssues.length > 0 && (
                      <Button size="sm" variant="default" onClick={acceptAll} className="bg-emerald-600 hover:bg-emerald-700">
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
                      <TooltipContent>Paste from clipboard</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyText} disabled={!text}>
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
                      <TooltipContent>Download .txt</TooltipContent>
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
                  {/* Highlight overlay */}
                  <div
                    ref={highlightRef}
                    aria-hidden
                    className="absolute inset-0 px-4 py-4 overflow-auto pointer-events-auto whitespace-pre-wrap break-words text-base leading-7 font-mono"
                    style={{ wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {renderHighlightedText()}
                  </div>
                  {/* Actual textarea */}
                  <textarea
                    ref={editorRef}
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onScroll={handleScroll}
                    placeholder="Start typing or paste your text here... LinguaAI will analyze grammar, spelling, style, clarity, vocabulary, and tone in real time."
                    spellCheck={false}
                    className="absolute inset-0 px-4 py-4 w-full h-full resize-none bg-transparent text-transparent caret-emerald-600 outline-none whitespace-pre-wrap break-words text-base leading-7"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  />
                  {/* Loading indicator */}
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

              {/* Inline quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card className="border-slate-200/60">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Words</p>
                      <p className="text-sm font-semibold">{stats?.wordCount ?? 0}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/60">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Type className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Characters</p>
                      <p className="text-sm font-semibold">{text.length}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/60">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Reading time</p>
                      <p className="text-sm font-semibold">{stats?.readingTime ?? "0 sec"}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/60">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Readability</p>
                      <p className="text-sm font-semibold">{stats?.readabilityScore?.toFixed(0) ?? "—"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col min-h-0">
              <Card className="flex-1 min-h-0 flex flex-col">
                <Tabs defaultValue="issues" className="flex-1 flex flex-col min-h-0">
                  <CardHeader className="py-3 px-4 border-b">
                    <TabsList className="grid grid-cols-4 w-full h-9">
                      <TabsTrigger value="issues" className="text-xs">
                        Issues
                        {visibleIssues.length > 0 && (
                          <Badge className="ml-1.5 h-4 px-1 text-[10px] bg-emerald-600">{visibleIssues.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="vocab" className="text-xs">
                        Vocab
                        {vocab.length > 0 && (
                          <Badge className="ml-1.5 h-4 px-1 text-[10px] bg-emerald-600">{vocab.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="tone" className="text-xs">Tone</TabsTrigger>
                      <TabsTrigger value="stats" className="text-xs">Stats</TabsTrigger>
                    </TabsList>
                  </CardHeader>

                  <CardContent className="flex-1 p-0 min-h-0 overflow-hidden">
                    {/* Issues tab */}
                    <TabsContent value="issues" className="m-0 h-full data-[state=active]:flex flex-col">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Lightbulb className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">No analysis yet</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Start typing in the editor. LinguaAI will surface grammar, spelling, punctuation, style, and clarity issues here.
                              </p>
                            </div>
                          )}
                          {loading && !analysis && (
                            <div className="space-y-2 p-3">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                              ))}
                            </div>
                          )}
                          {analysis && visibleIssues.length === 0 && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <CircleCheck className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All clear!</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                No issues detected. Your writing looks great.
                              </p>
                            </div>
                          )}
                          <AnimatePresence>
                            {analysis?.issues.map((issue, idx) => {
                              if (dismissedIssues.has(idx) || acceptedFixes.has(idx)) return null;
                              const style = SEVERITY_STYLES[issue.severity];
                              const isActive = activeIssue === idx;
                              return (
                                <motion.div
                                  key={idx}
                                  layout
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, x: -20 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <Card
                                    className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                                      isActive ? "ring-2 ring-emerald-500 shadow-md" : "hover:border-emerald-300"
                                    }`}
                                    onClick={() => setActiveIssue(isActive ? null : idx)}
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className={style.badge}>
                                          {TYPE_LABELS[issue.type]}
                                        </Badge>
                                        <Badge variant="ghost" className="text-[10px] text-muted-foreground">
                                          {style.label}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="line-through text-red-600 dark:text-red-400">{issue.original}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">{issue.suggestion}</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground leading-relaxed">{issue.explanation}</p>
                                    </div>
                                    {isActive && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="flex items-center gap-2 mt-3 pt-3 border-t"
                                      >
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="h-7 bg-emerald-600 hover:bg-emerald-700"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            acceptFix(idx);
                                          }}
                                        >
                                          <Check className="w-3.5 h-3.5 mr-1" /> Accept
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-muted-foreground"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            dismissIssue(idx);
                                          }}
                                        >
                                          Dismiss
                                        </Button>
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

                    {/* Vocabulary tab */}
                    <TabsContent value="vocab" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <BookOpen className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Vocabulary suggestions</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Smarter word choices will appear here once you start writing.
                              </p>
                            </div>
                          )}
                          {analysis && vocab.length === 0 && (
                            <div className="text-center py-12 px-4">
                              <CircleCheck className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                              <p className="text-sm font-medium">Vocabulary is on point</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">No improvements needed.</p>
                            </div>
                          )}
                          {vocab.map((v, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                            >
                              <Card className="p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <BookOpen className="w-4 h-4 text-emerald-600" />
                                  <span className="text-sm font-medium line-through text-muted-foreground">{v.word}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {v.alternatives.map((alt, i) => (
                                    <Button
                                      key={i}
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => {
                                        const regex = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                                        const match = text.match(regex);
                                        if (match && match.index !== undefined) {
                                          const newText = text.slice(0, match.index) + alt + text.slice(match.index + match[0].length);
                                          setText(newText);
                                          toast.success(`Replaced "${v.word}" → "${alt}"`);
                                          setTimeout(() => analyze(newText), 400);
                                        }
                                      }}
                                    >
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

                    {/* Tone tab */}
                    <TabsContent value="tone" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-3">
                          {!analysis && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Smile className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Tone analysis</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Tone, formality, and sentiment will be detected automatically.
                              </p>
                            </div>
                          )}
                          {analysis && tone && (
                            <>
                              <Card className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Smile className="w-5 h-5 text-emerald-600" />
                                  <h3 className="text-sm font-semibold">Detected Tone</h3>
                                </div>
                                <div className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                                  {tone.tone}
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <Progress value={tone.confidence} className="h-2" />
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
                              <Card className="p-4">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-emerald-600" /> Corrected version
                                </h3>
                                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                  {analysis.correctedText}
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 w-full"
                                  onClick={() => {
                                    setText(analysis.correctedText);
                                    toast.success("Replaced with corrected version");
                                    setTimeout(() => analyze(analysis.correctedText), 400);
                                  }}
                                >
                                  Use this version
                                </Button>
                              </Card>
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Stats tab */}
                    <TabsContent value="stats" className="m-0 h-full data-[state=active]:block hidden">
                      <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                        <div className="p-3 space-y-2">
                          {!analysis && !loading && (
                            <div className="text-center py-12 px-4">
                              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-3">
                                <Gauge className="w-7 h-7 text-emerald-600" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">Writing statistics</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Detailed metrics will appear here as you write.
                              </p>
                            </div>
                          )}
                          {analysis && stats && (
                            <>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">Overall writing score</span>
                                  <span className={`text-sm font-bold ${getScoreColor(overallScore)}`}>
                                    {overallScore}/100
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${getScoreBg(overallScore)} transition-all duration-700`}
                                    style={{ width: `${overallScore}%` }}
                                  />
                                </div>
                              </Card>
                              <div className="grid grid-cols-2 gap-2">
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-0.5">Words</p>
                                  <p className="text-lg font-bold">{stats.wordCount}</p>
                                </Card>
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-0.5">Sentences</p>
                                  <p className="text-lg font-bold">{stats.sentenceCount}</p>
                                </Card>
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-0.5">Unique words</p>
                                  <p className="text-lg font-bold">{stats.uniqueWords}</p>
                                </Card>
                                <Card className="p-3">
                                  <p className="text-xs text-muted-foreground mb-0.5">Avg words/sentence</p>
                                  <p className="text-lg font-bold">{stats.averageWordsPerSentence}</p>
                                </Card>
                              </div>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-muted-foreground">Readability (Flesch)</span>
                                  <Badge variant="outline" className="text-xs">
                                    {getReadabilityLabel(stats.readabilityScore)}
                                  </Badge>
                                </div>
                                <div className="text-2xl font-bold text-emerald-600">{stats.readabilityScore.toFixed(0)}</div>
                                <Progress value={stats.readabilityScore} className="h-2 mt-2" />
                                <p className="text-xs text-muted-foreground mt-2">
                                  Higher scores = easier to read. 60+ is considered standard for general audiences.
                                </p>
                              </Card>
                              <Card className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-muted-foreground">Lexical diversity</span>
                                  <span className="text-sm font-bold">
                                    {(stats.lexicalDiversity * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <Progress value={stats.lexicalDiversity * 100} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-2">
                                  Ratio of unique words to total words. Higher means richer vocabulary.
                                </p>
                              </Card>
                              <Card className="p-3 flex items-center gap-3">
                                <Clock className="w-5 h-5 text-emerald-600" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Estimated reading time</p>
                                  <p className="text-sm font-semibold">{stats.readingTime}</p>
                                </div>
                              </Card>
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
            <span>
              LinguaAI · Powered by Z.ai · Real-time grammar, vocabulary &amp; tone analysis
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <CircleAlert className="w-3 h-3" /> Browser extension &amp; Android APK available in <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/download</code>
            </span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
