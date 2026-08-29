import { useEffect, useMemo, useState } from 'react';
import { discoveries, startingPoint, type Discovery } from './data';
import { enrichDiscovery, getWalkingRoute, type Route } from './lib/api';
import { emptyMemory, rankDiscoveries, type TourMemory } from './lib/discovery-engine';
import { TourMap } from './TourMap';

type Stage = 'start' | 'walk' | 'story' | 'detour';
const moods = [['🕵️', 'Discover something new'], ['🏛️', 'Go deeper on history'], ['🎨', 'Art & culture'], ['👻', 'Weird stories'], ['🍷', 'Local life'], ['🎲', 'Surprise me']];

export function App() {
  const [stage, setStage] = useState<Stage>('start');
  const [intent, setIntent] = useState('Surprise me');
  const [duration, setDuration] = useState(30);
  const [active, setActive] = useState(discoveries[0]);
  const [route, setRoute] = useState<Route | null>(null);
  const [memory, setMemory] = useState<TourMemory>(emptyMemory);
  const [whyOpen, setWhyOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [calaStory, setCalaStory] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [selectionReason, setSelectionReason] = useState('A surprising first thread for this walk.');
  const destination = useMemo(() => stage === 'detour' ? discoveries[1] : active, [stage, active]);

  useEffect(() => { if (stage === 'walk') { setRoute(null); void getWalkingRoute(startingPoint, destination.coordinates).then(setRoute); } }, [stage, destination]);
  useEffect(() => { if (stage === 'story') { setCalaStory(null); void enrichDiscovery(active, intent).then(setCalaStory); } }, [stage, active, intent]);

  const begin = () => {
    setPlanning(true);
    const choice = rankDiscoveries(discoveries, startingPoint, intent, memory)[0];
    if (choice) { setActive(choice.discovery); setSelectionReason(choice.explanation); }
    window.setTimeout(() => { setPlanning(false); setStage('walk'); }, 700);
  };
  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(calaStory || active.story);
    utterance.rate = .94; utterance.onend = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  };
  const acceptDetour = () => {
    setMemory(current => ({ ...current, seenIds: [...current.seenIds, active.id], coveredThemes: [...new Set([...current.coveredThemes, ...active.themes])], acceptedDetours: current.acceptedDetours + 1 }));
    setActive(discoveries[1]); setStage('walk');
  };

  return <main className="app"><section className="phone-frame">
    <header className="app-header"><button className="bare" aria-label="Menu">☰</button><span className="wordmark"><i>✦</i> SideQuest</span><button className="bare" aria-label="Profile">◌</button></header>
    {stage === 'start' && <Start {...{ intent, duration, planning, setIntent, setDuration, begin }} />}
    {stage === 'walk' && <Walk active={active} route={route} speaking={speaking} speak={speak} arrive={() => setStage('story')} />}
    {stage === 'story' && <Story active={active} story={calaStory || active.story} speaking={speaking} speak={speak} why={() => setWhyOpen(true)} next={() => setStage('detour')} />}
    {stage === 'detour' && <Detour discovery={discoveries[1]} reason={selectionReason} accept={acceptDetour} skip={() => { setMemory(current => ({ ...current, declinedDetours: current.declinedDetours + 1 })); setStage('walk'); }} />}
    {whyOpen && <Why discovery={active} reason={selectionReason} close={() => setWhyOpen(false)} />}
  </section><aside className="desktop-note"><p>HACKATHON BUILD · 01</p><h1>Make a city<br /><em>feel alive.</em></h1><p>A local friend who notices the story worth interrupting you for.</p><div><span></span> Gothic Quarter, Barcelona</div></aside></main>;
}

function Start({ intent, duration, planning, setIntent, setDuration, begin }: { intent: string; duration: number; planning: boolean; setIntent: (v: string) => void; setDuration: (v: number) => void; begin: () => void }) {
  return <section className="screen start-screen"><div><p className="eyebrow">BARCELONA · GOTHIC QUARTER</p><h2>Your city,<br /><em>unexpectedly.</em></h2><p className="intro">Tell me how you want to feel. I’ll find the stories worth walking for.</p><div className="duration-row">{[30, 60, 90].map(v => <button key={v} onClick={() => setDuration(v)} className={duration === v ? 'selected' : ''}>{v === 60 ? '1 hour' : `${v} min`}</button>)}</div><div className="mood-grid">{moods.map(([emoji, label]) => <button key={label} onClick={() => setIntent(label)} className={intent === label ? 'mood active' : 'mood'}><span>{emoji}</span>{label}{label === 'Surprise me' && <b>↗</b>}</button>)}</div></div><button className="primary" disabled={planning} onClick={begin}>{planning ? 'Finding a story worth walking for…' : 'Alright, let’s wander'} <span>{planning ? '✦' : '→'}</span></button></section>;
}
function Walk({ active, route, speaking, speak, arrive }: { active: Discovery; route: Route | null; speaking: boolean; speak: () => void; arrive: () => void }) {
  const minutes = route?.duration ? Math.max(1, Math.round(route.duration / 60)) : 2;
  return <section className="screen walk-screen"><TourMap from={startingPoint} to={active.coordinates} route={route?.coordinates} /><div className="map-overlay"><span>YOU ARE HERE</span><strong>{active.location.toUpperCase()}<small>{minutes} MIN AWAY</small></strong></div><div className="walk-panel"><p className="eyebrow">YOUR FIRST WANDER</p><h2>Don’t worry about navigating.</h2><p>You’re {minutes} minutes from a story most people pass without seeing. I’ll tell you when we’re there.</p><div className="progress"><i></i><i></i><i></i><i></i></div><button className={speaking ? 'voice playing' : 'voice'} onClick={speak}><span>{speaking ? '◼' : '▶'}</span><div><small>YOUR LOCAL FRIEND</small><strong>{speaking ? 'Speaking…' : 'Hear the preview'}</strong></div><b>▂▄▆▄▂</b></button><button className="primary" onClick={arrive}>I’m here <span>→</span></button></div></section>;
}
function Story({ active, story, speaking, speak, why, next }: { active: Discovery; story: string; speaking: boolean; speak: () => void; why: () => void; next: () => void }) {
  return <section className="screen story-screen"><div className="hero-art" style={{ '--accent': active.color } as React.CSSProperties}><div className="arch a"></div><div className="arch b"></div><p>{active.location.toUpperCase()}</p><span>THEN · NOW</span></div><article className="story"><p className="eyebrow">DISCOVERY 01 · {active.minutes} MINUTES</p><h2>{active.hook}</h2><h3>{active.subtitle}</h3><p>{story}</p><button className="listen-link" onClick={speak}>{speaking ? 'Playing story…' : 'Listen to the story'} <span>▶</span></button></article><div className="story-actions"><button className="secondary" onClick={why}>Why this?</button><button className="primary compact" onClick={next}>Keep walking <span>→</span></button></div></section>;
}
function Detour({ discovery, reason, accept, skip }: { discovery: Discovery; reason: string; accept: () => void; skip: () => void }) {
  return <section className="screen detour-screen"><div className="detour-map"><TourMap from={discoveries[0].coordinates} to={discovery.coordinates} compact /></div><div className="detour-content"><div className="spark">✦</div><p className="eyebrow">A BETTER IDEA</p><h2>Wait. I found something better.</h2><p className="detour-intro">There’s a story 70m behind you that connects directly to the one we just heard.</p><article className="reason-card"><span>WHY I’M INTERRUPTING</span><h3>{discovery.title}</h3><p>{reason}</p><dl><div><dt>DISTANCE</dt><dd>70m</dd></div><div><dt>EXTRA TIME</dt><dd>4 min</dd></div><div><dt>WHY NOW</dt><dd>Perfect connection</dd></div></dl></article><p className="quiet">Most people walk past it. You’re already close.</p><button className="primary" onClick={accept}>Take me there <span>→</span></button><button className="skip" onClick={skip}>Stay on course</button></div></section>;
}
function Why({ discovery, reason, close }: { discovery: Discovery; reason: string; close: () => void }) {
  return <div className="sheet-backdrop" onClick={close}><section className="why-sheet" onClick={e => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">WHY I’M SUGGESTING THIS</p><h2>It is close, surprising, and changes how you see the street.</h2><p>{discovery.why}</p><p className="engine-reason">{reason}</p><div className="scores">{Object.entries(discovery.score).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div></section></div>;
}
