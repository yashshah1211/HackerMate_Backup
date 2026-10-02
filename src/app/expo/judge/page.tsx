"use client";

import React, { useState, useEffect, useRef } from "react";
import { CHALLENGES, BUILDERS } from "./data";
import { scoreTeam } from "./scoring";
import { Builder, Challenge } from "./types";
import Logo from "@/components/Logo";
import { Check, X, RefreshCw, ChevronDown, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ExpoJudgePage() {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedBuilderIds, setSelectedBuilderIds] = useState<string[]>([]);

  // Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartMs, setTimerStartMs] = useState<number | null>(null);
  const [capturedTime, setCapturedTime] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Submission State
  const [participantName, setParticipantName] = useState("");
  const [manualTimeStr, setManualTimeStr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timerRunning && timerStartMs !== null) {
      timer = setInterval(() => {
        const now = Date.now();
        setNowMs(now);
        if (now - timerStartMs >= 30000) {
          setTimerRunning(false);
          setCapturedTime(30.0);
        }
      }, 100);
    }
    return () => clearInterval(timer);
  }, [timerRunning, timerStartMs]);

  const selectedChallenge = CHALLENGES.find((c) => c.id === selectedChallengeId) || null;
  const selectedBuilders = BUILDERS.filter((b) => selectedBuilderIds.includes(b.id));

  const handleSelectChallenge = (id: string) => {
    setSelectedChallengeId(id);
  };

  const handleSelectBuilder = (id: string) => {
    if (selectedBuilderIds.includes(id)) {
      setSelectedBuilderIds(selectedBuilderIds.filter((bId) => bId !== id));
    } else if (selectedBuilderIds.length < 4) {
      const newSelections = [...selectedBuilderIds, id];
      setSelectedBuilderIds(newSelections);

      // Stop timer and capture elapsed time on 4th selection
      if (newSelections.length === 4 && timerRunning && timerStartMs !== null) {
        setTimerRunning(false);
        setCapturedTime(Math.min(30, (Date.now() - timerStartMs) / 1000));
      }
    }
  };

  const handleStartTimer = () => {
    setTimerStartMs(Date.now());
    setNowMs(Date.now());
    setTimerRunning(true);
    setCapturedTime(null);
  };

  const handleResetTimer = () => {
    setTimerRunning(false);
    setTimerStartMs(null);
    setCapturedTime(null);
    setNowMs(null);
  };

  const handleReset = () => {
    setSelectedChallengeId(null);
    setSelectedBuilderIds([]);
    handleResetTimer();
    setParticipantName("");
    setManualTimeStr("");
    setSubmitSuccess(false);
    setSubmitError(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isComplete = selectedChallenge !== null && selectedBuilderIds.length === 4;
  const result = isComplete ? scoreTeam(selectedChallenge, selectedBuilders) : null;

  // Auto-scroll when complete
  useEffect(() => {
    if (isComplete && resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [isComplete]);

  // Submission Logic
  const validName = participantName.trim();
  const parsedTime = capturedTime !== null ? capturedTime : parseFloat(manualTimeStr);
  const validTime = !isNaN(parsedTime) && parsedTime > 0 && parsedTime <= 300;
  const canSubmit = validName.length > 0 && validTime && !isSubmitting && !submitSuccess && selectedChallengeId !== null && selectedBuilderIds.length === 4 && result !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(false);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    const payload = {
      display_name: validName.slice(0, 30),
      score: result.total,
      time_seconds: parsedTime,
      challenge_id: selectedChallengeId!,
      builder_ids: selectedBuilderIds,
      created_by: userId
    };

    try {
      localStorage.setItem("hackermate-expo-unsent-score-v1", JSON.stringify(payload));
    } catch (e) { }

    const { error } = await supabase
      .from("expo_leaderboard_entries")
      .insert(payload);

    if (error) {
      console.error("Submission failed:", error);
      setSubmitError(true);
    } else {
      setSubmitSuccess(true);
      try {
        localStorage.removeItem("hackermate-expo-unsent-score-v1");
      } catch (e) { }
    }
    setIsSubmitting(false);
  };

  // Timer UI Formatting
  const displaySeconds = timerRunning && timerStartMs !== null && nowMs !== null
    ? Math.max(0, 30 - Math.floor((nowMs - timerStartMs) / 1000))
    : capturedTime !== null && capturedTime >= 30 ? 0 : null;
  const isTimeUp = (capturedTime !== null && capturedTime >= 30) || (displaySeconds === 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 font-sans pb-32">
      <div className="max-w-[1100px] mx-auto space-y-6">

        {/* Compact Header & Utility Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <Logo className="w-[100px] md:w-[130px] h-auto text-lime-400" />
            <div className="hidden sm:block w-px h-8 bg-neutral-800"></div>
            <div>
              <h1 className="font-bold text-lg leading-none">Expo Judge</h1>
              <p className="text-neutral-400 text-xs uppercase tracking-widest mt-1">30-second team challenge</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-neutral-950 px-4 py-2 rounded-lg border border-neutral-800">
            <span className="text-sm font-bold text-neutral-400 uppercase tracking-wider">Timer</span>
            <span className={`text-xl font-mono font-bold w-16 text-center tabular-nums ${isTimeUp ? "text-red-500" : "text-white"}`}>
              {displaySeconds !== null ? (displaySeconds === 0 ? "TIME" : `00:${displaySeconds.toString().padStart(2, "0")}`) : "00:30"}
            </span>
            {timerStartMs !== null ? (
              <button onClick={handleResetTimer} className="text-sm bg-neutral-800 hover:bg-neutral-700 px-3 py-1 rounded font-medium">Reset</button>
            ) : (
              <button onClick={handleStartTimer} className="text-sm bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 px-3 py-1 rounded font-medium">Start</button>
            )}
          </div>
        </div>

        {/* Challenge Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Challenge</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CHALLENGES.map((c) => {
              const isSelected = selectedChallengeId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectChallenge(c.id)}
                  className={`px-3 py-3 rounded-lg text-left border-2 transition-colors flex items-center justify-between ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800"
                  }`}
                >
                  <div className="font-bold text-sm leading-tight">{c.name}</div>
                  {isSelected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          {selectedChallenge && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-sm flex flex-col md:flex-row gap-3 md:items-center justify-between">
              <div className="text-neutral-300 max-w-xl">{selectedChallenge.prompt}</div>
              <div className="flex flex-col gap-1 text-xs shrink-0">
                <div><span className="font-bold text-neutral-500 mr-2 uppercase">Required</span> <span className="text-emerald-400 font-medium">{selectedChallenge.required.join(" · ")}</span></div>
                <div><span className="font-bold text-neutral-500 mr-2 uppercase">Bonus</span> <span className="text-indigo-400 font-medium">{selectedChallenge.bonus.join(" · ")}</span></div>
              </div>
            </div>
          )}
        </section>

        {/* Builder Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Builders</h2>
            <div className={`text-sm font-bold px-3 py-1 rounded border ${selectedBuilderIds.length === 4 ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
              {selectedBuilderIds.length} / 4 selected
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {BUILDERS.map((b) => {
              const selectionIndex = selectedBuilderIds.indexOf(b.id);
              const isSelected = selectionIndex > -1;
              const isDisabled = !isSelected && selectedBuilderIds.length >= 4;

              return (
                <button
                  key={b.id}
                  onClick={() => handleSelectBuilder(b.id)}
                  disabled={isDisabled}
                  className={`relative p-3 min-h-[85px] rounded-lg text-left border-2 transition-all flex flex-col justify-center ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 opacity-100"
                      : isDisabled
                      ? "border-neutral-800/50 bg-neutral-900/50 opacity-40 cursor-not-allowed"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800 opacity-100"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="font-bold text-base text-white">{b.name}</div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-xs font-bold shrink-0">
                        {selectionIndex + 1}
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium text-emerald-400 truncate w-full">{b.role}</div>
                  <div className="text-[11px] text-neutral-400 truncate w-full mt-1">
                    {b.skills.join(" · ")}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Immediately Visible Score Panel */}
        <div ref={resultRef} className="pt-4 pb-12">
          {isComplete && result ? (
            <div className="space-y-6">
              <div className="bg-neutral-900 border-2 border-neutral-700 rounded-xl p-5 shadow-xl flex flex-col md:flex-row gap-6 md:items-stretch">

                <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 rounded-lg p-6 border border-neutral-800">
                  <h2 className="text-neutral-500 font-bold tracking-widest uppercase text-sm mb-2">Team Score</h2>
                  <div className="flex items-end gap-1 mb-2">
                    <span className="text-7xl font-black text-white tabular-nums leading-none tracking-tight">{result.total}</span>
                    <span className="text-2xl text-neutral-600 font-bold mb-1">/100</span>
                  </div>

                  {result.total >= 90 ? (
                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-4 py-1.5 rounded-full font-bold text-xl mt-2 border border-emerald-500/20">
                      WIN <Check className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="text-neutral-400 font-medium text-lg mt-2">
                      Good attempt
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-3 justify-center">
                  <div className="flex justify-between items-center bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                    <span className="text-neutral-300 font-medium">Challenge coverage</span>
                    <span className="font-bold text-white tabular-nums text-lg">{result.coverageScore} <span className="text-neutral-600 text-sm">/ 60</span></span>
                  </div>
                  <div className="flex justify-between items-center bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                    <span className="text-neutral-300 font-medium">Complementarity</span>
                    <span className="font-bold text-white tabular-nums text-lg">{result.complementarityScore} <span className="text-neutral-600 text-sm">/ 20</span></span>
                  </div>
                  <div className="flex justify-between items-center bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                    <span className="text-neutral-300 font-medium">Bonus fit</span>
                    <span className="font-bold text-white tabular-nums text-lg">{result.bonusScore} <span className="text-neutral-600 text-sm">/ 20</span></span>
                  </div>
                </div>
              </div>

              {/* Leaderboard Submission Form */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-neutral-400 mb-1.5">Participant / Team</label>
                    <input
                      type="text"
                      value={participantName}
                      onChange={(e) => setParticipantName(e.target.value)}
                      maxLength={30}
                      disabled={submitSuccess || isSubmitting}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 font-medium disabled:opacity-50"
                      placeholder="e.g. Gamma Team"
                    />
                  </div>

                  {timerStartMs === null && capturedTime === null && (
                    <div className="w-full sm:w-48">
                      <label className="block text-sm font-bold text-neutral-400 mb-1.5">Manual Time (sec)</label>
                      <input
                        type="number"
                        value={manualTimeStr}
                        onChange={(e) => setManualTimeStr(e.target.value)}
                        step="0.1"
                        min="0.1"
                        max="300"
                        disabled={submitSuccess || isSubmitting}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                        placeholder="e.g. 18.5"
                      />
                    </div>
                  )}

                  {capturedTime !== null && (
                    <div className="w-full sm:w-48">
                      <label className="block text-sm font-bold text-neutral-400 mb-1.5">Time</label>
                      <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-emerald-400 font-mono font-bold flex items-center">
                        {capturedTime.toFixed(1)}s
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-4 items-center justify-between">
                  {submitSuccess ? (
                    <div className="flex-1 flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-4 py-3 rounded-lg border border-emerald-500/20 w-full">
                      <Check className="w-5 h-5" />
                      Added to leaderboard
                    </div>
                  ) : submitError ? (
                    <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-red-500/10 px-4 py-3 rounded-lg border border-red-500/20 w-full">
                      <div className="text-red-400 text-sm font-medium">
                        <span className="font-bold block">Couldn't sync leaderboard.</span>
                        Your score is still here.
                      </div>
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !canSubmit}
                        className="px-4 py-2 bg-red-500 hover:bg-red-400 text-neutral-950 font-bold rounded-lg text-sm shrink-0 disabled:opacity-50"
                      >
                        {isSubmitting ? "Retrying..." : "Retry submission"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="w-full sm:w-auto px-8 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20 disabled:shadow-none"
                    >
                      <Send className="w-4 h-4" />
                      {isSubmitting ? "Submitting..." : "Submit to leaderboard"}
                    </button>
                  )}
                </div>
              </div>

              <details className="group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <summary className="p-4 font-bold text-neutral-300 cursor-pointer select-none flex justify-between items-center hover:bg-neutral-800 transition-colors">
                  Why this score
                  <ChevronDown className="w-5 h-5 text-neutral-500 group-open:rotate-180 transition-transform" />
                </summary>

                <div className="p-4 pt-0 border-t border-neutral-800/50 space-y-5 bg-neutral-950/50">
                  <div className="space-y-2 mt-4">
                    <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Core Coverage</h4>
                    <div className="space-y-1">
                      {result.requiredResults.map(req => (
                        <div key={req.capability} className="flex items-start gap-2 text-sm">
                          {req.covered ? <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />}
                          <div>
                            <span className={req.covered ? "text-neutral-200" : "text-neutral-500"}>{req.capability}</span>
                            <span className="text-neutral-600 mx-2">—</span>
                            <span className="text-neutral-400">{req.covered ? req.builders.join(", ") : "not covered"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Complementarity</h4>
                    <div className="space-y-1">
                      {result.complementarityResults.map(comp => (
                        <div key={comp.builder} className="flex items-start gap-2 text-sm">
                          {comp.covered ? <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />}
                          <div>
                            <span className={comp.covered ? "text-neutral-200" : "text-neutral-500"}>{comp.builder} needs {comp.needs}</span>
                            <span className="text-neutral-600 mx-2">→</span>
                            <span className="text-neutral-400">{comp.covered ? comp.coveredBy.join(", ") : "not covered"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Bonus</h4>
                    <div className="space-y-1">
                      {result.bonusResults.map(bon => (
                        <div key={bon.capability} className="flex items-start gap-2 text-sm">
                          {bon.covered ? <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />}
                          <div>
                            <span className={bon.covered ? "text-neutral-200" : "text-neutral-500"}>{bon.capability}</span>
                            <span className="text-neutral-600 mx-2">—</span>
                            <span className="text-neutral-400">{bon.covered ? bon.builders.join(", ") : "not covered"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                >
                  <RefreshCw className="w-5 h-5" />
                  Reset Round
                </button>

                <button
                  onClick={() => {
                    const names = selectedBuilders.map(b => b.name).join(", ");
                    const text = `${selectedChallenge.name} — ${result.total}/100\n${names}`;
                    navigator.clipboard.writeText(text);
                  }}
                  className="sm:w-1/3 py-4 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl transition-colors border border-neutral-700"
                >
                  Copy result
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-xl text-center text-neutral-500 font-medium">
              Select {selectedChallenge ? "4 builders" : "1 challenge and 4 builders"} to calculate score.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
