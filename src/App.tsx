import { useEffect, useMemo, useState } from 'react';
import { discoveries, startingPoint, type Discovery, type Intent } from './data';
import { enrichDiscovery, generateHistoricalVisual, getWalkingRoute, type CalaSource, type Route } from './lib/api';
import { falPrompt } from './lib/creative';
import { createTourPlan, emptyMemory, remember, type RankedDiscovery, type TourMemory } from './lib/discovery-engine';
import { TourMap } from './TourMap';

type Stage = 'start' | 'plan' | 'walk' | 'story' | 'complete';
const moods: [string, Intent][] = [['🕵️', 'Discover something new'], ['🏛️', 'Go deeper on history'], ['🎨', 'Art & culture'], ['👻', 'Weird stories'], ['🍷', 'Local life'], ['🎲', 'Surprise me']];

export function App() {
  const [stage, setStage] = useState<Stage>('start');
  const [intent, setIntent] = useState<Intent>('Surprise me');
  const [duration, setDuration] = useState(30);
  const [active, setActive] = useState(discoveries[0]);
  const [route, setRoute] = useState<Route | null>(null);
  const [memory, setMemory] = useState<TourMemory>(emptyMemory);
  const [whyOpen, setWhyOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [calaStory, setCalaStory] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [selectionReason, setSelectionReason] = useState('A surprising first thread for this walk.');
  const [tourPlan, setTourPlan] = useState<RankedDiscovery[]>([]);
  const [calaStories, setCalaStories] = useState<Record<string, { story: string; sources: CalaSource[] }>>({});
  const [historicalVisuals, setHistoricalVisuals] = useState<Record<string, string>>({});
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const activeIndex = Math.max(0, tourPlan.findIndex(item => item.discovery.id === active.id));
  const routeFrom = activeIndex > 0 ? tourPlan[activeIndex - 1].discovery.coordinates : startingPoint;
  const plannedStops = useMemo(() => tourPlan.map(item => item.discovery), [tourPlan]);

  useEffect(() => { if (stage === 'plan' || stage === 'walk') { setRoute(null); void getWalkingRoute(routeFrom, active.coordinates).then(setRoute); } }, [stage, routeFrom, active]);
  useEffect(() => { if (stage === 'story') { const cached = calaStories[active.id]; if (cached) { setCalaStory(cached.story); return; } setCalaStory(null); void enrichDiscovery(active, intent).then(result => { if (result) setCalaStories(current => ({ ...current, [active.id]: result })); setCalaStory(result?.story ?? null); }); } }, [stage, active, intent, calaStories]);

  const begin = () => {
    setPlanning(true);
    const plan = createTourPlan(discoveries, startingPoint, intent, memory);
    const choice = plan[0];
    setTourPlan(plan);
    if (choice) { setActive(choice.discovery); setSelectionReason(choice.explanation); }
    void Promise.all(plan.map(async item => { const result = await enrichDiscovery(item.discovery, intent); if (result) setCalaStories(current => ({ ...current, [item.discovery.id]: result })); }));
    window.setTimeout(() => { setPlanning(false); setStage('plan'); }, 700);
  };
  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(calaStory || active.story);
    utterance.rate = .94; utterance.onend = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  };
  const revealThePast = async () => {
    if (historicalVisuals[active.id] || generatingVisual) return;
    setGeneratingVisual(true);
    const imageUrl = await generateHistoricalVisual(falPrompt(active));
    if (imageUrl) setHistoricalVisuals(current => ({ ...current, [active.id]: imageUrl }));
    setGeneratingVisual(false);
  };
  const continueWalk = () => {
    setMemory(current => remember(current, active));
    const next = tourPlan[activeIndex + 1];
    if (!next) { setStage('complete'); return; }
    setActive(next.discovery); setSelectionReason(next.explanation); setStage('walk');
  };

  return <main className="app"><section className="phone-frame">
    <header className="app-header"><button className="bare" aria-label="Menu">☰</button><span className="wordmark"><i>✦</i> SideQuest</span><button className="bare" aria-label="Profile">◌</button></header>
    {stage === 'start' && <Start {...{ intent, duration, planning, setIntent, setDuration, begin }} />}
    {stage === 'plan' && <RouteOverview stops={plannedStops} route={route} first={active} start={() => setStage('walk')} />}
    {stage === 'walk' && <Walk active={active} index={activeIndex} stops={plannedStops} route={route} from={routeFrom} speaking={speaking} speak={speak} arrive={() => setStage('story')} />}
    {stage === 'story' && <Story active={active} index={activeIndex} total={tourPlan.length} story={calaStories[active.id]?.story || calaStory || active.story} sources={calaStories[active.id]?.sources ?? []} visualUrl={historicalVisuals[active.id]} generatingVisual={generatingVisual} revealThePast={revealThePast} speaking={speaking} speak={speak} why={() => setWhyOpen(true)} next={continueWalk} />}
    {stage === 'complete' && <Complete count={tourPlan.length} restart={() => { setMemory(emptyMemory()); setStage('start'); }} />}
    {whyOpen && <Why discovery={active} reason={selectionReason} close={() => setWhyOpen(false)} />}
  </section><aside className="desktop-note"><p>HACKATHON BUILD · 01</p><h1>Make a city<br /><em>feel alive.</em></h1><p>A local friend who notices the story worth interrupting you for.</p><div><span></span> Gothic Quarter, Barcelona</div></aside></main>;
}

function Start({ intent, duration, planning, setIntent, setDuration, begin }: { intent: Intent; duration: number; planning: boolean; setIntent: (v: Intent) => void; setDuration: (v: number) => void; begin: () => void }) {
  return <section className="screen start-screen"><div><p className="eyebrow">BARCELONA · GOTHIC QUARTER</p><h2>Your city,<br /><em>unexpectedly.</em></h2><p className="intro">Tell me how you want to feel. I’ll find the stories worth walking for.</p><div className="duration-row">{[30, 60, 90].map(v => <button key={v} onClick={() => setDuration(v)} className={duration === v ? 'selected' : ''}>{v === 60 ? '1 hour' : `${v} min`}</button>)}</div><div className="mood-grid">{moods.map(([emoji, label]) => <button key={label} onClick={() => setIntent(label)} className={intent === label ? 'mood active' : 'mood'}><span>{emoji}</span>{label}{label === 'Surprise me' && <b>↗</b>}</button>)}</div></div><button className="primary" disabled={planning} onClick={begin}>{planning ? 'Finding a story worth walking for…' : 'Alright, let’s wander'} <span>{planning ? '✦' : '→'}</span></button></section>;
}

function RouteOverview({ stops, route, first, start }: { stops: Discovery[]; route: Route | null; first: Discovery; start: () => void }) {
  return <section className="screen route-overview"><TourMap from={startingPoint} to={first.coordinates} route={route?.coordinates} stops={stops} activeIndex={0} full /><div className="route-sheet"><p className="eyebrow">YOUR WALK · {stops.length} CONNECTED STORIES</p><h2>Follow one thread<br /><em>through the quarter.</em></h2><p className="route-intro">No detours to negotiate. These are the three places that make sense together.</p><ol className="itinerary">{stops.map((stop, index) => <li key={stop.id} className={index === 0 ? 'next' : ''}><b>{index + 1}</b><div><strong>{stop.location}</strong><span>{index === 0 ? `${stop.minutes} min · Start here` : stop.subtitle}</span></div>{index === 0 && <i>→</i>}</li>)}</ol><button className="primary" onClick={start}>Start at {first.location} <span>→</span></button></div></section>;
}

function Walk({ active, index, stops, route, from, speaking, speak, arrive }: { active: Discovery; index: number; stops: Discovery[]; route: Route | null; from: Discovery['coordinates']; speaking: boolean; speak: () => void; arrive: () => void }) {
  const minutes = route?.duration ? Math.max(1, Math.round(route.duration / 60)) : active.minutes;
  return <section className="screen navigator-screen"><TourMap from={from} to={active.coordinates} route={route?.coordinates} stops={stops} activeIndex={index} full /><div className="navigator-top"><span>WALK {index + 1} OF {stops.length}</span><strong>{active.location}</strong></div><div className="navigator-panel"><div className="walk-progress">{stops.map((stop, stopIndex) => <i key={stop.id} className={stopIndex <= index ? 'done' : ''} />)}</div><p className="eyebrow">NEXT STOP · {minutes} MINUTES AWAY</p><h2>{active.hook}</h2><p>{route?.instruction ? `First move: ${route.instruction}` : 'Follow the orange line; your next story is waiting at the marker.'}</p><div className="navigator-actions"><button className={speaking ? 'voice mini playing' : 'voice mini'} onClick={speak}><span>{speaking ? '◼' : '▶'}</span><strong>Preview</strong></button><button className="primary compact" onClick={arrive}>I’m here <span>→</span></button></div></div></section>;
}

function Story({ active, index, total, story, sources, visualUrl, generatingVisual, revealThePast, speaking, speak, why, next }: { active: Discovery; index: number; total: number; story: string; sources: CalaSource[]; visualUrl?: string; generatingVisual: boolean; revealThePast: () => void; speaking: boolean; speak: () => void; why: () => void; next: () => void }) {
  const isLast = index === total - 1;
  return <section className="screen story-screen"><div className={visualUrl ? 'hero-art reconstructed' : 'hero-art'} style={{ '--accent': active.color } as React.CSSProperties}>{visualUrl && <img className="historical-visual" src={visualUrl} alt={`Cinematic historical reconstruction of ${active.location}`} />}<div className="arch a"></div><div className="arch b"></div><p>{active.location.toUpperCase()}</p><span>{visualUrl ? 'RECONSTRUCTED · THEN' : 'THEN · NOW'}</span></div><article className="story"><p className="eyebrow">STOP {index + 1} OF {total} · {active.minutes} MINUTES</p><h2>{active.hook}</h2><h3>{active.subtitle}</h3><p>{story}</p><div className="story-tools"><button className="listen-link" onClick={speak}>{speaking ? 'Playing story…' : 'Listen to the story'} <span>▶</span></button><button className="reveal-link" disabled={generatingVisual || Boolean(visualUrl)} onClick={revealThePast}>{generatingVisual ? 'Reconstructing the past…' : visualUrl ? 'Historical scene revealed' : '✦ Reveal the past'}</button></div>{sources.length > 0 && <details className="source-note"><summary><span>Sources</span> Cala Knowledge · {sources.length} supporting notes <b>⌄</b></summary><ol>{sources.slice(0, 3).map((source, sourceIndex) => <li key={`${sourceIndex}-${source.content}`}>{source.content}</li>)}</ol></details>}</article><div className="story-actions"><button className="secondary" onClick={why}>Why this?</button><button className="primary compact" onClick={next}>{isLast ? 'Finish this walk' : 'Next story'} <span>→</span></button></div></section>;
}

function Complete({ count, restart }: { count: number; restart: () => void }) {
  return <section className="screen complete-screen"><div className="complete-orbit">✦</div><p className="eyebrow">WALK COMPLETE · {count} STORIES UNLOCKED</p><h2>You didn’t just<br /><em>see</em> the city.</h2><p>You followed one of its threads. The next walk can be a completely different one.</p><button className="primary" onClick={restart}>Choose another mood <span>→</span></button></section>;
}

function Why({ discovery, reason, close }: { discovery: Discovery; reason: string; close: () => void }) {
  return <div className="sheet-backdrop" onClick={close}><section className="why-sheet" onClick={e => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">WHY THIS IS ON YOUR WALK</p><h2>It is close, surprising, and changes how you see the street.</h2><p>{discovery.why}</p><p className="engine-reason">{reason}</p><div className="scores">{Object.entries(discovery.score).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div></section></div>;
}
