"use client";

import { useState, useEffect } from "react";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import type { Event, EventPrompt, UserEventResponse } from "@/lib/types";

export default function OrganizerDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [responses, setResponses] = useState<UserEventResponse[]>([]);
  
  // Creation state
  const [newEventCode, setNewEventCode] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newOrganizerName, setNewOrganizerName] = useState("");
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [createError, setCreateError] = useState("");
  
  // UI states
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSavingPrompts, setIsSavingPrompts] = useState(false);
  const [promptMsg, setPromptMsg] = useState({ type: "", text: "" });

  // Tabs & Insights state
  const [activeTab, setActiveTab] = useState<"prompts" | "responses" | "insights">("prompts");
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  // Fetch events
  const fetchEvents = async (selectFirst = false) => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch("/api/organizer/events");
      const data = await res.json();
      if (res.ok && data.events) {
        setEvents(data.events);
        if (selectFirst && data.events.length > 0) {
          handleSelectEvent(data.events[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load events", err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents(true);
  }, []);

  const handleSelectEvent = async (event: Event) => {
    setSelectedEvent(event);
    setIsLoadingDetails(true);
    setActiveTab("prompts");
    setPromptMsg({ type: "", text: "" });
    setInsightsError("");
    try {
      // Fetch prompts
      const promptsRes = await fetch(`/api/organizer/events/${event.id}/prompts`);
      const promptsData = await promptsRes.json();
      if (promptsRes.ok && promptsData.prompts) {
        const textPrompts = promptsData.prompts.map((p: EventPrompt) => p.prompt_text);
        setPrompts(textPrompts.length > 0 ? textPrompts : [""]);
      } else {
        setPrompts([""]);
      }

      // Fetch responses
      const respRes = await fetch(`/api/organizer/events/${event.id}/responses`);
      const respData = await respRes.json();
      if (respRes.ok && respData.responses) {
        setResponses(respData.responses);
      } else {
        setResponses([]);
      }
    } catch (err) {
      console.error("Error loading event details", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventCode || !newEventName || !newOrganizerName) {
      setCreateError("All fields are required.");
      return;
    }
    
    setCreateError("");
    setIsCreatingEvent(true);
    try {
      const res = await fetch("/api/organizer/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newEventCode,
          name: newEventName,
          organizerName: newOrganizerName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.event) {
        setNewEventCode("");
        setNewEventName("");
        setNewOrganizerName("");
        await fetchEvents();
        handleSelectEvent(data.event);
      } else {
        setCreateError(data.error || "Failed to create event");
      }
    } catch (err) {
      setCreateError("Failed to create event");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Prompts array mutation
  const handlePromptChange = (index: number, value: string) => {
    const updated = [...prompts];
    updated[index] = value;
    setPrompts(updated);
  };

  const handleAddPrompt = () => {
    setPrompts([...prompts, ""]);
  };

  const handleRemovePrompt = (index: number) => {
    const updated = prompts.filter((_, i) => i !== index);
    setPrompts(updated.length > 0 ? updated : [""]);
  };

  const handleSavePrompts = async () => {
    if (!selectedEvent) return;
    setIsSavingPrompts(true);
    setPromptMsg({ type: "", text: "" });

    // Clean up empty questions
    const cleanPrompts = prompts.map(p => p.trim()).filter(p => p.length > 0);

    try {
      const res = await fetch(`/api/organizer/events/${selectedEvent.id}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: cleanPrompts }),
      });
      if (res.ok) {
        setPromptMsg({ type: "success", text: "Prompts saved successfully!" });
        // Refresh prompts
        setPrompts(cleanPrompts.length > 0 ? cleanPrompts : [""]);
      } else {
        const data = await res.json();
        setPromptMsg({ type: "error", text: data.error || "Failed to save prompts" });
      }
    } catch (err) {
      setPromptMsg({ type: "error", text: "Error connecting to the server" });
    } finally {
      setIsSavingPrompts(false);
    }
  };

  // AI Insights Generation
  const handleGenerateInsights = async () => {
    if (!selectedEvent) return;
    setIsGeneratingInsights(true);
    setInsightsError("");
    try {
      const res = await fetch(`/api/organizer/events/${selectedEvent.id}/insights`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.insights) {
        setSelectedEvent({ ...selectedEvent, ai_insights: data.insights });
        setEvents(events.map(e => e.id === selectedEvent.id ? { ...e, ai_insights: data.insights } : e));
      } else {
        setInsightsError(data.error || "Failed to generate insights.");
      }
    } catch (err) {
      setInsightsError("Error connecting to server to generate insights.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Simple parser to render markdown details beautifully without dependencies
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("### ")) {
        return <h4 key={idx} className="text-sm font-semibold text-white mt-4 mb-2">{trimmed.slice(4)}</h4>;
      }
      if (trimmed.startsWith("## ")) {
        return <h3 key={idx} className="text-base font-bold text-[var(--success)] mt-6 mb-3 border-b border-[var(--border)] pb-1">{trimmed.slice(3)}</h3>;
      }
      if (trimmed.startsWith("# ")) {
        return <h2 key={idx} className="text-lg font-black text-white mt-6 mb-4">{trimmed.slice(2)}</h2>;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const content = trimmed.slice(2);
        return (
          <ul key={idx} className="list-disc pl-5 text-xs text-[var(--muted)] my-1">
            <li>{parseInlineFormatting(content)}</li>
          </ul>
        );
      }
      if (trimmed === "") return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-xs text-[var(--muted)] leading-relaxed my-2">{parseInlineFormatting(trimmed)}</p>;
    });
  };

  const parseInlineFormatting = (text: string) => {
    const parts = text.split(/\*\*([\s\S]+?)\*\*/g);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{part}</strong> : part);
  };

  return (
    <>
      <div className="page-bg" />
      <div className="page-content min-h-screen pb-16">
        <SiteHeader active="organizer" />

        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Organizer Panel</h1>
              <p className="text-[var(--muted)] text-sm">
                Define custom questions for your events that users answer via Telegram.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar: Event selector & Creation */}
            <div className="lg:col-span-4 space-y-6">
              {/* Event Selector Card */}
              <div className="card">
                <div className="card-header">Select Event</div>
                <div className="p-4 space-y-2">
                  {isLoadingEvents ? (
                    <div className="text-xs text-[var(--muted)] py-4 text-center">Loading events...</div>
                  ) : events.length === 0 ? (
                    <div className="text-xs text-[var(--muted)] py-4 text-center">No events found. Create one below!</div>
                  ) : (
                    <div className="space-y-1">
                      {events.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => handleSelectEvent(e)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between ${
                            selectedEvent?.id === e.id
                              ? "border-[var(--success)]/40 bg-[var(--success)]/5 text-white"
                              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-white hover:border-[var(--border-hover)]"
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="text-xs font-semibold">{e.name}</div>
                            <div className="text-[10px] opacity-70 mt-0.5">By {e.organizer_name}</div>
                          </div>
                          <span className="text-[10px] font-mono shrink-0 px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--success)] font-medium border border-[var(--border)]">
                            {e.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Create Event Card */}
              <div className="card">
                <div className="card-header">Create Event</div>
                <form onSubmit={handleCreateEvent} className="p-4 space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
                      Event Code (Unique)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. MINIHACK"
                      value={newEventCode}
                      onChange={(e) => setNewEventCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
                      Event Name
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. MiniHack Kenya 2026"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
                      Organizer Name
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Avalanche Community"
                      value={newOrganizerName}
                      onChange={(e) => setNewOrganizerName(e.target.value)}
                      required
                    />
                  </div>

                  {createError && (
                    <div className="text-xs text-[var(--error)] bg-[var(--error)]/5 border border-[var(--error)]/20 p-2.5 rounded-lg">
                      ⚠️ {createError}
                    </div>
                  )}

                  <Button type="submit" disabled={isCreatingEvent} className="w-full">
                    {isCreatingEvent ? "Creating..." : "Create Event"}
                  </Button>
                </form>
              </div>
            </div>

            {/* Main Section: Selected Event Details */}
            <div className="lg:col-span-8 space-y-6">
              {selectedEvent ? (
                <>
                  {/* Event Info Dashboard header */}
                  <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[var(--surface)] to-[var(--surface-2)]">
                    <div>
                      <span className="text-[10px] font-mono text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/20 px-2 py-0.5 rounded-full inline-block mb-1.5 font-semibold">
                        ACTIVE EVENT: {selectedEvent.code}
                      </span>
                      <h2 className="text-xl font-semibold text-white">{selectedEvent.name}</h2>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        Organized by <span className="text-white">{selectedEvent.organizer_name}</span> · Created on {new Date(selectedEvent.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface)] self-start sm:self-center shrink-0">
                      <p className="text-[9px] font-mono text-[var(--muted)] uppercase tracking-wider">Bot Join Command</p>
                      <p className="text-xs font-mono text-white mt-0.5 select-all font-semibold">
                        /join {selectedEvent.code}
                      </p>
                    </div>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex border-b border-[var(--border)] gap-2">
                    {[
                      { id: "prompts", label: "Custom Prompts Flow" },
                      { id: "responses", label: `Participant Responses (${responses.length})` },
                      { id: "insights", label: "AI Insights & Recommendations" }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`text-xs font-semibold px-4 py-2.5 border-b-2 transition-colors -mb-[2px] ${
                          activeTab === tab.id
                            ? "border-[var(--success)] text-white"
                            : "border-transparent text-[var(--muted)] hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {isLoadingDetails ? (
                    <div className="card p-8 text-center text-sm text-[var(--muted)]">
                      Loading event details...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 animate-fade-up">
                      {/* Tab 1: Custom Prompts Config */}
                      {activeTab === "prompts" && (
                        <div className="card">
                          <div className="card-header flex items-center justify-between">
                            <span>Define Prompt Flow</span>
                            <span className="text-[10px] font-normal text-[var(--muted)]">Bot asks these in order</span>
                          </div>
                          <div className="p-5 space-y-4">
                            <p className="text-xs text-[var(--muted)] leading-relaxed">
                              Define custom questions participants must respond to. When users type 
                              <span className="text-white font-mono"> /join {selectedEvent.code}</span> in the bot, the bot starts a conversation asking these.
                            </p>

                            <div className="space-y-3">
                              {prompts.map((promptText, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                  <span className="font-mono text-xs text-[#52525b] w-6 shrink-0 text-right">
                                    Q{idx + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g. What is your startup project name?"
                                    value={promptText}
                                    onChange={(e) => handlePromptChange(idx, e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePrompt(idx)}
                                    className="p-2 border border-[var(--border)] rounded-lg text-[#52525b] hover:text-[var(--error)] hover:border-[var(--error)]/30 bg-[var(--surface-2)] transition-colors shrink-0"
                                    title="Remove Prompt"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                              <button
                                type="button"
                                onClick={handleAddPrompt}
                                className="text-xs text-[var(--muted)] hover:text-white flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] rounded-lg hover:border-[var(--border-hover)] bg-[var(--surface-2)] transition-colors"
                              >
                                ＋ Add Question
                              </button>

                              <div className="flex items-center gap-3">
                                {promptMsg.text && (
                                  <span className={`text-xs ${promptMsg.type === "success" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                                    {promptMsg.text}
                                  </span>
                                )}
                                <Button
                                  onClick={handleSavePrompts}
                                  disabled={isSavingPrompts}
                                >
                                  {isSavingPrompts ? "Saving..." : "Save Prompts"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 2: Participant Responses Panel */}
                      {activeTab === "responses" && (
                        <div className="card">
                          <div className="card-header flex items-center justify-between">
                            <span>Participant Responses ({responses.length})</span>
                          </div>
                          <div className="p-5">
                            {responses.length === 0 ? (
                              <div className="text-center py-12 text-sm text-[var(--muted)] bg-[var(--surface-2)]/30 border border-dashed border-[var(--border)] rounded-xl">
                                <span className="text-2xl block mb-2">💬</span>
                                No responses yet.
                                <br />
                                <span className="text-xs opacity-75 mt-1 block">
                                  Instruct builders to run <span className="font-mono text-white">/join {selectedEvent.code}</span> in the bot!
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {responses.map((resp) => (
                                  <div
                                    key={resp.id}
                                    className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-2)] hover:border-[var(--border-hover)] transition-colors"
                                  >
                                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                                      <div>
                                        <h4 className="text-sm font-semibold text-white">{resp.user_name}</h4>
                                        {resp.user_username && (
                                          <p className="text-[10px] text-[var(--muted)]">@{resp.user_username}</p>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-[var(--muted)] font-mono">
                                        {new Date(resp.created_at).toLocaleDateString()}
                                      </span>
                                    </div>

                                    <div className="space-y-2.5">
                                      {Array.isArray(resp.responses) ? (
                                        resp.responses.map((qa, index) => (
                                          <div key={index} className="text-xs">
                                            <p className="text-[#71717a] font-medium mb-0.5">Q: {qa.prompt_text}</p>
                                            <p className="text-[var(--fg)] bg-[var(--surface)] p-2 rounded-lg border border-[var(--border)] leading-relaxed">
                                              {qa.response_text}
                                            </p>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-xs text-[var(--muted)]">No details available</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tab 3: AI Insights & Curated Match Recommendations */}
                      {activeTab === "insights" && (
                        <div className="card">
                          <div className="card-header flex items-center justify-between">
                            <span>AI Community Intelligence</span>
                            <span className="text-[10px] font-normal text-[var(--muted)]">Synthesized by Gemini</span>
                          </div>
                          <div className="p-5 space-y-6">
                            {selectedEvent.ai_insights ? (
                              <div className="space-y-4 text-xs leading-relaxed max-w-none">
                                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 overflow-hidden">
                                  {renderMarkdown(selectedEvent.ai_insights)}
                                </div>
                                <div className="flex justify-end pt-2">
                                  <Button 
                                    onClick={handleGenerateInsights} 
                                    disabled={isGeneratingInsights}
                                    variant="secondary"
                                    className="border-[var(--border)] hover:border-[var(--border-hover)]"
                                  >
                                    {isGeneratingInsights ? "Regenerating..." : "🔄 Regenerate Analysis"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-12 bg-[var(--surface-2)]/30 border border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center">
                                <span className="text-3xl mb-3">🧠</span>
                                <h3 className="text-sm font-medium text-white mb-1">Generate AI Event Insights</h3>
                                <p className="text-xs text-[var(--muted)] max-w-sm mb-6 leading-relaxed">
                                  Let Gemini analyze all participant event answers to identify common tech stacks, core hurdles, and recommend curated pairing pathways for matching.
                                </p>
                                
                                {insightsError && (
                                  <div className="text-xs text-[var(--error)] bg-[var(--error)]/5 border border-[var(--error)]/20 p-2.5 rounded-lg mb-4">
                                    ⚠️ {insightsError}
                                  </div>
                                )}

                                <Button 
                                  onClick={handleGenerateInsights} 
                                  disabled={isGeneratingInsights || responses.length === 0}
                                >
                                  {isGeneratingInsights ? "Analyzing Event Data..." : "Generate AI Insights"}
                                </Button>
                                {responses.length === 0 && (
                                  <span className="text-[10px] text-[var(--muted)] mt-2">
                                    Requires at least 1 registered participant.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="card p-12 text-center text-sm text-[var(--muted)] flex flex-col items-center justify-center min-h-[300px]">
                  <span className="text-4xl mb-4">🎟️</span>
                  <h3 className="text-base font-medium text-white mb-1">No Event Selected</h3>
                  <p className="text-xs max-w-sm">
                    Select an existing event from the sidebar or create a new one to manage prompts and view user responses.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
