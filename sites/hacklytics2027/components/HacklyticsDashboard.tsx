"use client";
import React, { useState, useEffect } from "react";
import { 
  FaFire, FaMapMarkedAlt, FaBrain, 
  FaRobot, FaPlay, FaVolumeUp
} from "react-icons/fa";
import { FiAward } from "react-icons/fi";

// Custom type definitions
interface TriviaQuestion {
  id: number;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 1,
    question: "Which clustering algorithm does NOT require pre-specifying the number of clusters?",
    options: ["K-Means", "DBSCAN", "Gaussian Mixture Models", "Spectral Clustering"],
    answer: 1,
    explanation: "DBSCAN (Density-Based Spatial Clustering of Applications with Noise) clusters based on density and finds clusters of arbitrary shapes without needing the number of clusters beforehand!"
  },
  {
    id: 2,
    question: "What is the primary loss function used for training binary classification neural networks?",
    options: ["Mean Squared Error", "Categorical Cross-Entropy", "Binary Cross-Entropy", "Huber Loss"],
    answer: 2,
    explanation: "Binary Cross-Entropy measures the performance of a classification model whose output is a probability value between 0 and 1."
  },
  {
    id: 3,
    question: "Which layer type is responsible for downsampling spatial dimensions in a Convolutional Neural Network (CNN)?",
    options: ["Dense Layer", "Dropout Layer", "MaxPooling Layer", "Activation Layer"],
    answer: 2,
    explanation: "MaxPooling layers downsample the input representation (image, hidden-state) by taking the maximum value over a window, reducing dimensionality and parameters."
  }
];

export default function HacklyticsDashboard() {
  const [activeTab, setActiveTab] = useState<"map" | "quiz" | "advisor">("map");
  
  // Gamification state
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  
  // Audio status (Sick-Sense Audio Briefing style)
  const [isPlayingBriefing, setIsPlayingBriefing] = useState(false);
  
  // Advisor agent state
  const [activeAgent, setActiveAgent] = useState<"scout" | "analyst" | "advisor">("advisor");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "agent" | "user", text: string }>>([
    { 
      sender: "agent", 
      text: "Hello Hacker! I am your AI Advisor Agent. Ready to optimize your Hacklytics 2027 experience. Ask me anything about tracks, schedules, or strategies!" 
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Load stats from localStorage on mount
  useEffect(() => {
    const savedStreak = localStorage.getItem("hacker_streak");
    const savedScore = localStorage.getItem("hacker_score");
    const savedAchievements = localStorage.getItem("hacker_achievements");

    if (savedStreak) setStreak(parseInt(savedStreak));
    if (savedScore) setScore(parseInt(savedScore));
    if (savedAchievements) setUnlockedAchievements(JSON.parse(savedAchievements));
  }, []);

  // Sync state helpers
  const saveStreak = (val: number) => {
    setStreak(val);
    localStorage.setItem("hacker_streak", val.toString());
  };

  const saveScore = (val: number) => {
    setScore(val);
    localStorage.setItem("hacker_score", val.toString());
  };

  const triggerAchievement = (id: string) => {
    if (!unlockedAchievements.includes(id)) {
      const updated = [...unlockedAchievements, id];
      setUnlockedAchievements(updated);
      localStorage.setItem("hacker_achievements", JSON.stringify(updated));
    }
  };

  // Handle Map Interaction
  const handleMapHover = () => {
    triggerAchievement("scout_consult");
  };

  // Handle Trivia submission
  const handleOptionClick = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
  };

  const handleTriviaSubmit = () => {
    if (selectedOption === null || isAnswered) return;
    setIsAnswered(true);

    const question = TRIVIA_QUESTIONS[currentQuizIndex];
    if (selectedOption === question.answer) {
      saveScore(score + 10);
      saveStreak(streak + 1);
      triggerAchievement("first_quiz");
      if (streak + 1 >= 3) {
        triggerAchievement("streak_3");
      }
    } else {
      saveStreak(0);
    }
  };

  const handleNextQuiz = () => {
    setSelectedOption(null);
    setIsAnswered(false);
    setCurrentQuizIndex((prev) => (prev + 1) % TRIVIA_QUESTIONS.length);
  };

  // Audio Briefing player (TTS synthesis)
  const speakBriefing = () => {
    if (!window.speechSynthesis) {
      alert("Text-to-speech not supported on this browser!");
      return;
    }

    if (isPlayingBriefing) {
      window.speechSynthesis.cancel();
      setIsPlayingBriefing(false);
      return;
    }

    const text = "Active scout agents report: Sickness outbreak risk in Klaus Advanced Computing is extremely low, but hacker density is surging. Analyst metrics project over one thousand hackers incoming. Advisory recommendations: Ensure your team has a data storyteller, and keep drinking plenty of water during the 36-hour sprint. Stay safe and happy hacking!";
    setIsPlayingBriefing(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      setIsPlayingBriefing(false);
    };
    utterance.onerror = () => {
      setIsPlayingBriefing(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  // AI Agent message dispatcher
  const handleAgentChat = (questionKey: string) => {
    triggerAchievement("agent_chat");
    let userMsg = "";
    let replyMsg = "";

    if (questionKey === "prizes") {
      userMsg = "What are the prizes for Hacklytics 2027?";
      replyMsg = "Analyst Agent Output:\nWe have over $15,000 in total prizes! Grand prize takes $3,000. Track winners get custom gear. Special sponsor categories like Florida Blue and State Farm have $1,500 prizes.";
    } else if (questionKey === "register") {
      userMsg = "How do I secure my registration?";
      replyMsg = "Scout Agent Output:\nInterest form is live! Click the 'Register Now' button at the top to secure your spot. Official invites go out in December. Keep your notifications active.";
    } else if (questionKey === "tracks") {
      userMsg = "What tracks are available?";
      replyMsg = "Advisor Agent Output:\nWe have four distinct tracks: Healthcare & Healthtech, FinTech & Finance, Sports Analytics, and General Data Science. Florida Blue is sponsoring the Healthtech track!";
    } else if (questionKey === "stats") {
      userMsg = "Give me the live hacker analysis.";
      replyMsg = "Analyst Agent Output:\nCrawl data shows high density clusters. Current projection: 1,024 hackers, 38 universities, 45% beginner hackers, 55% advanced. Major disciplines: Computer Science, Data Science, Industrial Engineering.";
    }

    setChatMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setChatMessages((prev) => [...prev, { sender: "agent", text: replyMsg }]);
    }, 1000);
  };

  return (
    <div className="w-full mt-24 glass-panel p-6 md:p-8 xl:p-10 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
      {/* Decorative neon borders */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-bloom-pink via-bloom-purple to-bloom-cyan"></div>
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/10 mb-8">
        <div>
          <span className="text-xs text-bloom-cyan uppercase font-mono tracking-widest font-bold">
            Live Action Dashboard
          </span>
          <h2 className="text-2xl md:text-4xl font-sans font-bold text-white tracking-tight uppercase mt-2">
            Hacker Command Center
          </h2>
        </div>
        
        {/* Gamified Header Stats */}
        <div className="flex items-center gap-6 bg-white/5 px-6 py-3 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2">
            <FaFire className={`w-6 h-6 ${streak > 0 ? "text-bloom-pink animate-pulse" : "text-gray-500"}`} />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-mono">STREAK</span>
              <span className="text-lg font-bold font-mono text-white leading-none">{streak} Days</span>
            </div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <FiAward className="w-6 h-6 text-bloom-lime" />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-mono">SCORE</span>
              <span className="text-lg font-bold font-mono text-white leading-none">{score} XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Side: Vertical Tabs Selector */}
        <div className="flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0">
          {[
            { id: "map", label: "Outbreak Heatmap", icon: <FaMapMarkedAlt />, color: "border-bloom-cyan text-bloom-cyan" },
            { id: "quiz", label: "Trivia & Quizzes", icon: <FaBrain />, color: "border-bloom-lime text-bloom-lime" },
            { id: "advisor", label: "Multi-Agent AI", icon: <FaRobot />, color: "border-bloom-purple text-bloom-purple" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 min-w-[160px] lg:w-full flex items-center gap-4 px-5 py-4 rounded-xl font-mono text-sm uppercase tracking-wider transition-all duration-300 border ${
                activeTab === tab.id 
                  ? `bg-white/5 border-l-4 ${tab.color} font-bold shadow-[0_0_20px_rgba(255,255,255,0.05)]` 
                  : "border-white/5 text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Right Side: Active Tab Viewport */}
        <div className="lg:col-span-3 min-h-[400px] bg-black/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col">
          
          {/* 1. OUTBREAK HEATMAP */}
          {activeTab === "map" && (
            <div className="flex-1 flex flex-col justify-between" onMouseEnter={handleMapHover}>
              <div>
                <h3 className="text-lg font-mono font-bold text-bloom-cyan flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-bloom-cyan animate-ping"></span>
                  LIVE HACKER GEOGRAPHIC DISTRIBUTION
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-mono uppercase">
                  Mapbox sensor telemetry simulated. Click map markers to expand local hubs.
                </p>
              </div>

              {/* Glowing SVG Map Representation */}
              <div className="relative my-6 bg-slate-950/80 rounded-xl border border-white/5 overflow-hidden h-[240px] flex items-center justify-center">
                {/* Simulated Grid lines */}
                <div className="absolute inset-0 bg-noise opacity-20 pointer-events-none"></div>
                <div className="absolute inset-0" style={{
                  backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)",
                  backgroundSize: "20px 20px"
                }}></div>

                {/* Cybernetic world outline or abstract shape */}
                <svg viewBox="0 0 800 350" className="w-full h-full opacity-40">
                  <path d="M150,150 Q200,80 300,100 T500,200 T700,120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
                  <path d="M100,220 Q250,280 400,200 T650,260" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
                </svg>

                {/* Glowing Outbreak/Hacker Density clusters */}
                {[
                  { cx: "25%", cy: "45%", label: "Atlanta Cluster", count: "482 Hackers", color: "fill-bloom-cyan drop-shadow-[0_0_12px_var(--bloom-cyan)]", pulseColor: "bg-bloom-cyan" },
                  { cx: "65%", cy: "30%", label: "East Coast Hub", count: "189 Hackers", color: "fill-bloom-pink drop-shadow-[0_0_12px_var(--bloom-pink)]", pulseColor: "bg-bloom-pink" },
                  { cx: "15%", cy: "60%", label: "West Coast Hub", count: "124 Hackers", color: "fill-bloom-lime drop-shadow-[0_0_12px_var(--bloom-lime)]", pulseColor: "bg-bloom-lime" },
                  { cx: "45%", cy: "75%", label: "Midwest Node", count: "72 Hackers", color: "fill-bloom-purple drop-shadow-[0_0_12px_var(--bloom-purple)]", pulseColor: "bg-bloom-purple" }
                ].map((node, i) => (
                  <div
                    key={i}
                    className="absolute group/marker cursor-pointer"
                    style={{ left: node.cx, top: node.cy }}
                  >
                    {/* Ring Pulse */}
                    <div className={`absolute w-8 h-8 -left-4 -top-4 rounded-full ${node.pulseColor}/20 animate-ping`}></div>
                    
                    {/* Glowing Marker */}
                    <svg width="14" height="14" viewBox="0 0 14 14" className="absolute -left-[7px] -top-[7px]">
                      <circle cx="7" cy="7" r="6" className={node.color} />
                    </svg>

                    {/* Popup label */}
                    <div className="absolute left-4 -top-8 bg-slate-900 border border-white/10 px-3 py-1.5 rounded-lg opacity-0 group-hover/marker:opacity-100 transition-opacity duration-300 pointer-events-none z-30 whitespace-nowrap">
                      <p className="text-white text-xs font-mono font-bold">{node.label}</p>
                      <p className="text-[10px] text-bloom-cyan font-mono mt-0.5">{node.count}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sick-Sense Audio Briefing Button */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white/5 rounded-xl border border-white/5 mt-auto">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-bloom-cyan/15 rounded-lg border border-bloom-cyan/30">
                    <FaVolumeUp className="w-5 h-5 text-bloom-cyan animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-white text-xs font-mono font-bold">AI AUDIO HEALTH & STATUS BRIEFING</h4>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      Synthesize current environmental telemetry and crowd trends.
                    </p>
                  </div>
                </div>

                <button
                  onClick={speakBriefing}
                  className={`w-full md:w-auto px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-widest font-bold border transition-all duration-300 flex items-center justify-center gap-2 ${
                    isPlayingBriefing 
                      ? "border-bloom-pink text-bloom-pink bg-bloom-pink/10 shadow-[0_0_15px_rgba(255,0,127,0.2)]" 
                      : "border-bloom-cyan text-bloom-cyan hover:bg-bloom-cyan/10 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                  }`}
                >
                  <FaPlay className="w-3 h-3" />
                  <span>{isPlayingBriefing ? "Stop Briefing" : "Play Briefing"}</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. TRIVIA & QUIZZES */}
          {activeTab === "quiz" && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-mono font-bold text-bloom-lime flex items-center gap-2">
                  <FaBrain className="w-5 h-5" />
                  DATA SCIENCE TRIVIA CHALLENGE
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-mono uppercase">
                  Verify your core knowledge. Answering correctly boosts your XP score and streak!
                </p>
              </div>

              <div className="my-6 bg-slate-900/60 p-6 rounded-xl border border-white/5">
                <p className="text-white text-sm md:text-base font-mono mb-6 leading-relaxed">
                  <span className="text-bloom-lime font-bold font-mono mr-2">Q:</span>
                  {TRIVIA_QUESTIONS[currentQuizIndex].question}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {TRIVIA_QUESTIONS[currentQuizIndex].options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleOptionClick(idx)}
                      disabled={isAnswered}
                      className={`w-full p-4 rounded-xl text-left font-mono text-xs md:text-sm transition-all duration-300 border ${
                        selectedOption === idx 
                          ? isAnswered 
                            ? idx === TRIVIA_QUESTIONS[currentQuizIndex].answer
                              ? "bg-bloom-lime/10 border-bloom-lime text-bloom-lime shadow-[0_0_15px_rgba(204,255,0,0.15)]"
                              : "bg-bloom-pink/10 border-bloom-pink text-bloom-pink"
                            : "bg-white/10 border-white/30 text-white"
                          : isAnswered && idx === TRIVIA_QUESTIONS[currentQuizIndex].answer
                            ? "bg-bloom-lime/10 border-bloom-lime text-bloom-lime"
                            : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:border-white/10"
                      }`}
                    >
                      <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span>
                      {option}
                    </button>
                  ))}
                </div>

                {isAnswered && (
                  <div className="mt-6 p-4 rounded-lg bg-white/5 border-l-4 border-bloom-lime">
                    <p className="text-xs font-mono text-gray-300 leading-relaxed">
                      <strong className="text-white uppercase font-bold mr-2">EXPLANATION:</strong>
                      {TRIVIA_QUESTIONS[currentQuizIndex].explanation}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-gray-400 font-mono">
                  XP +10 FOR CORRECT ANSWER
                </span>
                
                {!isAnswered ? (
                  <button
                    onClick={handleTriviaSubmit}
                    disabled={selectedOption === null}
                    className="px-6 py-2.5 rounded-xl bg-bloom-lime text-black font-mono text-xs uppercase tracking-widest font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuiz}
                    className="px-6 py-2.5 rounded-xl border border-bloom-lime text-bloom-lime font-mono text-xs uppercase tracking-widest font-bold hover:bg-bloom-lime/10 transition-colors"
                  >
                    Next Question
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4. MULTI-AGENT AI SYSTEM */}
          {activeTab === "advisor" && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-mono font-bold text-bloom-purple flex items-center gap-2">
                  <FaRobot className="w-5 h-5" />
                  MULTI-AGENT COORDINATOR
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-mono uppercase">
                  Select agent profile below to query specialized telemetry.
                </p>
              </div>

              {/* Agent Selector */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { id: "scout", label: "Scout Agent", desc: "Data Crawler", color: "border-bloom-cyan text-bloom-cyan" },
                  { id: "analyst", label: "Analyst Agent", desc: "Insight Synthesizer", color: "border-bloom-pink text-bloom-pink" },
                  { id: "advisor", label: "Advisor Agent", desc: "Strategy Engine", color: "border-bloom-purple text-bloom-purple" }
                ].map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setActiveAgent(agent.id as typeof activeAgent)}
                    className={`p-2.5 rounded-lg border text-center transition-all duration-300 ${
                      activeAgent === agent.id
                        ? `bg-white/5 border-l-4 ${agent.color} shadow-md`
                        : "border-white/5 text-gray-400 hover:text-white"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider font-mono font-bold">{agent.label}</p>
                    <p className="text-[8px] text-gray-400 font-mono mt-0.5">{agent.desc}</p>
                  </button>
                ))}
              </div>

              {/* Chat Log */}
              <div className="my-4 bg-slate-950/80 p-4 rounded-xl border border-white/5 h-[160px] overflow-y-auto flex flex-col gap-3 font-mono text-xs">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] p-3 rounded-lg border leading-relaxed whitespace-pre-wrap ${
                      msg.sender === "user"
                        ? "bg-white/5 border-white/10 text-white"
                        : activeAgent === "scout"
                          ? "bg-bloom-cyan/5 border-bloom-cyan/20 text-bloom-cyan"
                          : activeAgent === "analyst"
                            ? "bg-bloom-pink/5 border-bloom-pink/20 text-bloom-pink"
                            : "bg-bloom-purple/5 border-bloom-purple/20 text-bloom-purple"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-3 rounded-lg text-gray-400 animate-pulse">
                      Analyzing data sources...
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Questions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-auto">
                {[
                  { key: "tracks", label: "Event Tracks", desc: "Florida Blue & Tech" },
                  { key: "prizes", label: "Prizes Details", desc: "$15k Pool Overview" },
                  { key: "stats", label: "Demographics", desc: "Hacker Metrics" },
                  { key: "register", label: "How to Join", desc: "Interest Form" }
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleAgentChat(item.key)}
                    className="p-2.5 rounded-lg bg-white/5 border border-white/5 hover:border-bloom-purple/50 text-left transition-all duration-300"
                  >
                    <p className="text-[10px] text-white font-bold font-mono uppercase leading-tight">{item.label}</p>
                    <p className="text-[8px] text-gray-400 font-mono mt-1 leading-tight">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
