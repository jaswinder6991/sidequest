import { useEffect, useMemo, useState } from 'react';
import { discoveries, startingPoint, type Coordinates, type Discovery, type Intent } from './data';
import { enrichDiscovery, generateHistoricalVisual, getWalkingRoute, type CalaSource, type Route } from './lib/api';
import { falPrompt, visualFor } from './lib/creative';
import { createTourPlan, emptyMemory, estimateMinutes, metersBetween, orderByProximity, rankDiscoveries, remember, replanFrom, stopsForDuration, weights, type RankedDiscovery, type TourMemory } from './lib/discovery-engine';
import { TourMap } from './TourMap';

type Stage = 'start' | 'plan' | 'walk' | 'story' | 'complete';
const plural = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;
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
  const [ranked, setRanked] = useState<RankedDiscovery[]>([]);
  const [detour, setDetour] = useState<RankedDiscovery | null>(null);
  const [detourSettled, setDetourSettled] = useState(false);
  const [calaStories, setCalaStories] = useState<Record<string, { story: string; sources: CalaSource[] }>>({});
  const [historicalVisuals, setHistoricalVisuals] = useState<Record<string, string>>({});
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [heroMissing, setHeroMissing] = useState<Record<string, boolean>>({});
  const [visualError, setVisualError] = useState<string | null>(null);
  const [targetStops, setTargetStops] = useState(3);
  const [preview, setPreview] = useState<Discovery | null>(null);
  const [replanNote, setReplanNote] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const activeIndex = Math.max(0, tourPlan.findIndex(item => item.discovery.id === active.id));
  const routeFrom: Coordinates = activeIndex > 0 ? tourPlan[activeIndex - 1].discovery.coordinates : startingPoint;
  const plannedStops = useMemo(() => tourPlan.map(item => item.discovery), [tourPlan]);
  // Everything still on the table: not planned, not already walked.
  const offPlan = useMemo(() => discoveries.filter(d => !tourPlan.some(i => i.discovery.id === d.id) && !memory.seenIds.includes(d.id)), [tourPlan, memory]);

  useEffect(() => { if (stage === 'plan' || stage === 'walk') { setRoute(null); void getWalkingRoute(routeFrom, active.coordinates).then(setRoute); } }, [stage, routeFrom, active]);
  useEffect(() => { if (stage === 'story') { const cached = calaStories[active.id]; if (cached) { setCalaStory(cached.story); return; } setCalaStory(null); void enrichDiscovery(active, intent).then(result => { if (result) setCalaStories(current => ({ ...current, [active.id]: result })); setCalaStory(result?.story ?? null); }); } }, [stage, active, intent, calaStories]);
  // Narration must never follow the visitor onto the next screen.
  useEffect(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, [stage, active]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  // The interruption is the point: it arrives unasked, part-way into the second leg.
  useEffect(() => {
    if (stage !== 'walk' || detourSettled || activeIndex !== 1) return;
    const planned = new Set(tourPlan.map(item => item.discovery.id));
    const candidate = ranked.find(item => !planned.has(item.discovery.id) && !memory.seenIds.includes(item.discovery.id));
    if (!candidate) return;
    const timer = window.setTimeout(() => { setDetour(candidate); navigator.vibrate?.([18, 60, 26]); }, 5200);
    return () => window.clearTimeout(timer);
  }, [stage, activeIndex, detourSettled, tourPlan, ranked, memory]);

  const begin = () => {
    setPlanning(true);
    const { plan, ranked: allRanked } = createTourPlan(discoveries, startingPoint, intent, memory, duration);
    setExcluded([]);
    const choice = plan[0];
    setTourPlan(plan); setRanked(allRanked); setDetour(null); setDetourSettled(false); setTargetStops(stopsForDuration(duration)); setPreview(null); setReplanNote(null);
    if (choice) { setActive(choice.discovery); setSelectionReason(choice.explanation); }
    void Promise.all(plan.map(async item => { const result = await enrichDiscovery(item.discovery, intent); if (result) setCalaStories(current => ({ ...current, [item.discovery.id]: result })); }));
    window.setTimeout(() => { setPlanning(false); setStage('plan'); }, 700);
  };
  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(calaStories[active.id]?.story || calaStory || active.story);
    utterance.rate = .94; utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  };
  const revealThePast = async () => {
    // The pre-generated file is already on disk, so the reveal is instant and
    // needs no network. Only fall back to a live Fal call if the file is missing.
    if (revealedIds.includes(active.id) || generatingVisual) return;
    if (!heroMissing[active.id]) { setRevealedIds(current => [...current, active.id]); return; }
    setGeneratingVisual(true); setVisualError(null);
    const imageUrl = await generateHistoricalVisual(falPrompt(active));
    if (imageUrl) { setHistoricalVisuals(current => ({ ...current, [active.id]: imageUrl })); setRevealedIds(current => [...current, active.id]); }
    else setVisualError('No reconstruction for this one yet — run npm run visuals, or start the API server.');
    setGeneratingVisual(false);
  };

  // One primitive behind every way of leaving the plan: adding a place ADDS it. The walk
  // grows, nothing already chosen is silently evicted, and order stays geographic.
  const takePlace = (discovery: Discovery, note: (count: string) => string) => {
    if (tourPlan.some(item => item.discovery.id === discovery.id)) { setPreview(null); return; }
    const onOverview = stage === 'plan';
    const origin = onOverview ? startingPoint : routeFrom;
    const scored = rankDiscoveries([discovery], origin, intent, memory)[0];
    if (!scored) return;
    const walked = onOverview ? [] : tourPlan.slice(0, activeIndex);
    const ahead = onOverview ? tourPlan : tourPlan.slice(activeIndex);
    const nextAhead = onOverview
      ? orderByProximity([...ahead, scored], startingPoint)
      : [scored, ...orderByProximity(ahead, discovery.coordinates)];
    const nextPlan = [...walked, ...nextAhead];
    setTargetStops(count => count + 1);
    setTourPlan(nextPlan);
    setActive(nextAhead[0].discovery); setSelectionReason(nextAhead[0].explanation);
    setExcluded(current => current.filter(id => id !== discovery.id));
    setPreview(null); setDetour(null); setReplanNote(note(plural(nextPlan.length)));
    setStage(onOverview ? 'plan' : 'walk');
    void enrichDiscovery(discovery, intent).then(result => { if (result) setCalaStories(current => ({ ...current, [discovery.id]: result })); });
  };

  const acceptDetour = () => {
    if (!detour) return;
    setMemory(current => ({ ...current, acceptedDetours: current.acceptedDetours + 1 }));
    setDetourSettled(true);
    takePlace(detour.discovery, count => `Detour taken — now ${count}, re-ordered around it.`);
  };
  // Dropping a stop from the overview: drop it and shrink the walk.
  const removeStop = (discovery: Discovery) => {
    const kept = tourPlan.filter(item => item.discovery.id !== discovery.id);
    if (!kept.length) { setPreview(null); setReplanNote('That is the only story left on this walk.'); return; }
    const ordered = orderByProximity(kept, startingPoint);
    setTargetStops(count => Math.max(1, count - 1));
    setExcluded(current => [...current, discovery.id]);
    setTourPlan(ordered); setActive(ordered[0].discovery); setSelectionReason(ordered[0].explanation);
    setPreview(null); setReplanNote(`Removed ${discovery.location} — now ${plural(ordered.length)}.`);
  };

  // Skipping is the other half of route flexibility: drop this stop and re-plan ahead.
  const skipStop = () => {
    const visited = tourPlan.slice(0, activeIndex);
    const rest = replanFrom(discoveries.filter(d => d.id !== active.id), routeFrom, intent, memory, Math.max(1, targetStops - visited.length));
    if (!rest.length) { setStage('complete'); return; }
    setTourPlan([...visited, ...rest]);
    setActive(rest[0].discovery); setSelectionReason(rest[0].explanation);
    setReplanNote('Skipped — I found you something else nearby.');
  };
  const declineDetour = () => { setMemory(current => ({ ...current, declinedDetours: current.declinedDetours + 1 })); setDetour(null); setDetourSettled(true); };
  const dismissNote = () => setReplanNote(null);
  const continueWalk = () => {
    setMemory(current => remember(current, active));
    const next = tourPlan[activeIndex + 1];
    if (!next) { setStage('complete'); return; }
    setActive(next.discovery); setSelectionReason(next.explanation); setStage('walk');
  };
  const restart = () => {
    window.speechSynthesis?.cancel();
    setStage('start'); setMemory(emptyMemory()); setTourPlan([]); setRanked([]); setActive(discoveries[0]);
    setDetour(null); setDetourSettled(false); setRoute(null); setCalaStory(null); setVisualError(null); setRevealedIds([]); setWhyOpen(false); setSpeaking(false); setPreview(null); setReplanNote(null);
  };

  return <main className="app"><section className="phone-frame">
    <header className="app-header"><button className="bare" aria-label="Restart the walk" onClick={restart}>☰</button><span className="wordmark"><i>✦</i> SideQuest</span><button className="bare" aria-label="Profile">◌</button></header>
    {stage === 'start' && <Start {...{ intent, duration, planning, setIntent, setDuration, begin }} />}
    {stage === 'plan' && <RouteOverview stops={plannedStops} route={route} first={active} candidates={offPlan} onSelectCandidate={setPreview} note={replanNote} dismissNote={dismissNote} start={() => setStage('walk')} />}
    {stage === 'walk' && <Walk active={active} index={activeIndex} stops={plannedStops} route={route} from={routeFrom} candidates={offPlan} onSelectCandidate={setPreview} skip={skipStop} note={replanNote} dismissNote={dismissNote} speaking={speaking} speak={speak} arrive={() => setStage('story')} />}
    {stage === 'story' && <Story active={active} index={activeIndex} total={tourPlan.length} story={calaStories[active.id]?.story || calaStory || active.story} sources={calaStories[active.id]?.sources ?? []} visualUrl={historicalVisuals[active.id] ?? (heroMissing[active.id] ? undefined : visualFor(active))} revealed={revealedIds.includes(active.id)} onImageMissing={() => setHeroMissing(current => ({ ...current, [active.id]: true }))} generatingVisual={generatingVisual} visualError={visualError} revealThePast={revealThePast} speaking={speaking} speak={speak} why={() => setWhyOpen(true)} next={continueWalk} />}
    {stage === 'complete' && <Complete count={tourPlan.length} memory={memory} restart={restart} />}
    {preview && <PlacePreview discovery={preview} from={stage === 'plan' ? startingPoint : routeFrom} intent={intent} memory={memory} planning={stage === 'plan'} plannedIndex={tourPlan.findIndex(item => item.discovery.id === preview.id)} go={() => takePlace(preview, count => stage === 'plan' ? `Added ${preview.location} — now ${count}.` : `Heading to ${preview.location} — now ${count}.`)} remove={() => removeStop(preview)} close={() => setPreview(null)} />}
    {detour && <DetourPrompt detour={detour} from={routeFrom} accept={acceptDetour} decline={declineDetour} />}
    {whyOpen && <Why discovery={active} ranked={tourPlan[activeIndex]} reason={selectionReason} close={() => setWhyOpen(false)} />}
  </section><aside className="desktop-note"><p>HACKATHON BUILD · 01</p><h1>Make a city<br /><em>feel alive.</em></h1><p>A local friend who notices the story worth interrupting you for.</p><div><span></span> Gothic Quarter, Barcelona</div></aside></main>;
}

function PlaceVisual({ discovery, className }: { discovery: Discovery; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`${className} visual-fallback`} style={{ '--accent': discovery.color } as React.CSSProperties}><i className="arch a" /><i className="arch b" /><span>{discovery.location}</span></div>;
  return <img className={className} src={visualFor(discovery)} alt={`${discovery.location}, reconstructed`} loading="lazy" onError={() => setFailed(true)} />;
}

function Start({ intent, duration, planning, setIntent, setDuration, begin }: { intent: Intent; duration: number; planning: boolean; setIntent: (v: Intent) => void; setDuration: (v: number) => void; begin: () => void }) {
  return <section className="screen start-screen"><div><p className="eyebrow">BARCELONA · GOTHIC QUARTER</p><h2>Your city,<br /><em>unexpectedly.</em></h2><p className="intro">Tell me how you want to feel. I’ll find the stories worth walking for.</p><div className="duration-row" role="group" aria-label="Walk length">{[30, 60, 90].map(v => <button key={v} type="button" aria-pressed={duration === v} onClick={() => setDuration(v)} className={duration === v ? 'selected' : ''}>{v === 60 ? '1 hour' : `${v} min`}</button>)}</div><div className="mood-grid" role="group" aria-label="Mood">{moods.map(([emoji, label]) => <button key={label} type="button" aria-pressed={intent === label} onClick={() => setIntent(label)} className={intent === label ? 'mood active' : 'mood'}><span>{emoji}</span>{label}{label === 'Surprise me' && <b>↗</b>}</button>)}</div></div><button className="primary" disabled={planning} onClick={begin}>{planning ? 'Finding a story worth walking for…' : 'Alright, let’s wander'} <span>{planning ? '✦' : '→'}</span></button></section>;
}

function RouteOverview({ stops, route, first, candidates, onSelectCandidate, note, dismissNote, start }: { stops: Discovery[]; route: Route | null; first: Discovery; candidates: Discovery[]; onSelectCandidate: (d: Discovery) => void; note: string | null; dismissNote: () => void; start: () => void }) {
  const estimate = estimateMinutes(stops, startingPoint);
  const stories = `${stops.length} ${stops.length === 1 ? 'STORY' : 'STORIES'}`;
  return <section className="screen route-overview"><TourMap from={startingPoint} to={first.coordinates} route={route?.coordinates} stops={stops} candidates={candidates} onSelectCandidate={onSelectCandidate} activeIndex={0} bottomInset={.55} full /><div className="route-sheet">{note && <button className="replan-note inline" onClick={dismissNote}>✦ {note}</button>}<p className="eyebrow">YOUR WALK · {stories} · ≈{estimate} MIN</p><h2>Follow one thread<br /><em>through the quarter.</em></h2><p className="route-intro">Ordered so you never double back. Tap any ✦ on the map to see the place and decide for yourself.</p><ol className="itinerary">{stops.map((stop, index) => <li key={stop.id} className={index === 0 ? 'next' : ''}><button type="button" className="itinerary-row" onClick={() => onSelectCandidate(stop)}><b>{index + 1}</b><PlaceVisual discovery={stop} className="itinerary-thumb" /><div><strong>{stop.location}</strong><span>{index === 0 ? `${stop.minutes} min · Start here` : stop.subtitle}</span></div><i>{index === 0 ? '→' : '›'}</i></button></li>)}</ol><button className="primary" onClick={start}>Start at {first.location} <span>→</span></button></div></section>;
}

function Walk({ active, index, stops, route, from, candidates, onSelectCandidate, skip, note, dismissNote, speaking, speak, arrive }: { active: Discovery; index: number; stops: Discovery[]; route: Route | null; from: Coordinates; candidates: Discovery[]; onSelectCandidate: (d: Discovery) => void; skip: () => void; note: string | null; dismissNote: () => void; speaking: boolean; speak: () => void; arrive: () => void }) {
  const minutes = route?.duration ? Math.max(1, Math.round(route.duration / 60)) : active.minutes;
  return <section className="screen navigator-screen"><TourMap from={from} to={active.coordinates} route={route?.coordinates} stops={stops} candidates={candidates} onSelectCandidate={onSelectCandidate} activeIndex={index} bottomInset={.34} full /><div className="navigator-top"><span>WALK {index + 1} OF {stops.length}</span><strong>{active.location}</strong>{note && <button className="replan-note" onClick={dismissNote}>✦ {note}</button>}</div><div className="navigator-panel"><div className="walk-progress">{stops.map((stop, stopIndex) => <i key={stop.id} className={stopIndex <= index ? 'done' : ''} />)}</div><p className="eyebrow">NEXT STOP · {minutes} MINUTES AWAY</p><h2>{active.hook}</h2><p>{route?.instruction ? `First move: ${route.instruction}` : 'Follow the orange line; your next story is waiting at the marker.'}</p><div className="navigator-actions"><button className={speaking ? 'voice mini playing' : 'voice mini'} onClick={speak}><span>{speaking ? '◼' : '▶'}</span><strong>{speaking ? 'Stop' : 'Preview'}</strong></button><button className="primary compact" onClick={arrive}>I’m here <span>→</span></button></div><button className="skip-stop" onClick={skip}>Not feeling this one — find me something else</button></div></section>;
}

function PlacePreview({ discovery, from, intent, memory, planning, plannedIndex, go, remove, close }: { discovery: Discovery; from: Coordinates; intent: Intent; memory: TourMemory; planning: boolean; plannedIndex: number; go: () => void; remove: () => void; close: () => void }) {
  const scored = rankDiscoveries([discovery], from, intent, memory)[0];
  const onWalk = plannedIndex >= 0;
  return <div className="sheet-backdrop" onClick={close}><section className="preview-sheet" onClick={e => e.stopPropagation()}><button className="close" onClick={close}>×</button><PlaceVisual discovery={discovery} className="preview-visual" /><div className="preview-body"><p className="eyebrow">{onWalk ? `STOP ${plannedIndex + 1} ON YOUR WALK` : 'OFF YOUR ROUTE'}</p><h2>{discovery.title}</h2><p className="preview-sub">{discovery.subtitle}</p><p className="preview-story">{discovery.story}</p><dl><div><dt>DISTANCE</dt><dd>{Math.round(metersBetween(from, discovery.coordinates))}m</dd></div><div><dt>EXTRA TIME</dt><dd>{estimateMinutes([discovery], from)} min</dd></div><div><dt>SCORE</dt><dd>{scored?.total ?? discovery.score.relevance}/100</dd></div></dl>{onWalk ? <>{planning ? <button className="secondary danger" onClick={remove}>Remove from my walk</button> : <p className="on-route-note">This one is already on your walk.</p>}</> : <><button className="primary" onClick={go}>{planning ? 'Add to my walk' : 'Go here next'} <span>→</span></button><button className="skip" onClick={close}>Keep my route</button></>}</div></section></div>;
}

function DetourPrompt({ detour, from, accept, decline }: { detour: RankedDiscovery; from: Coordinates; accept: () => void; decline: () => void }) {
  const distance = Math.round(metersBetween(from, detour.discovery.coordinates));
  const extra = estimateMinutes([detour.discovery], from);
  return <div className="sheet-backdrop"><section className="detour-sheet"><div className="spark">✦</div><p className="eyebrow">A BETTER IDEA</p><h2>Wait. I found something better.</h2><p className="detour-intro">{detour.discovery.hook}</p><PlaceVisual discovery={detour.discovery} className="detour-visual" /><article className="reason-card"><span>WHY I’M INTERRUPTING</span><h3>{detour.discovery.title}</h3><p>{detour.explanation.split(' · ').slice(1).join(' · ')}</p><dl><div><dt>DISTANCE</dt><dd>{distance}m</dd></div><div><dt>EXTRA TIME</dt><dd>{extra} min</dd></div><div><dt>SCORE</dt><dd>{detour.total}/100</dd></div></dl></article><p className="quiet">Most people walk past it. You’re already close.</p><button className="primary" onClick={accept}>Take me there <span>→</span></button><button className="skip" onClick={decline}>Stay on course</button></section></div>;
}

function Story({ active, index, total, story, sources, visualUrl, revealed, onImageMissing, generatingVisual, visualError, revealThePast, speaking, speak, why, next }: { active: Discovery; index: number; total: number; story: string; sources: CalaSource[]; visualUrl?: string; revealed: boolean; onImageMissing: () => void; generatingVisual: boolean; visualError: string | null; revealThePast: () => void; speaking: boolean; speak: () => void; why: () => void; next: () => void }) {
  const isLast = index === total - 1;
  return <section className="screen story-screen"><div className={revealed ? 'hero-art reconstructed' : 'hero-art'} style={{ '--accent': active.color } as React.CSSProperties}>{visualUrl && <img className={revealed ? 'historical-visual revealed' : 'historical-visual'} src={visualUrl} alt={`Historical reconstruction of ${active.location}`} onError={onImageMissing} />}<div className="arch a"></div><div className="arch b"></div><p>{active.location.toUpperCase()}</p><span>{revealed ? 'AI RECONSTRUCTION' : 'THEN · NOW'}</span></div><article className="story"><p className="eyebrow">STOP {index + 1} OF {total} · {active.minutes} MINUTES</p><h2>{active.hook}</h2><h3>{active.subtitle}</h3><p>{story}</p><div className="story-tools"><button className="listen-link" onClick={speak}>{speaking ? 'Stop the story' : 'Listen to the story'} <span>{speaking ? '◼' : '▶'}</span></button><button className="reveal-link" disabled={generatingVisual || revealed} onClick={revealThePast}>{generatingVisual ? 'Reconstructing the past…' : revealed ? 'Historical scene revealed' : '✦ Reveal the past'}</button></div>{visualError && <p className="visual-error" role="status">{visualError}</p>}{sources.length > 0 && <details className="source-note"><summary><span>Sources</span> Cala Knowledge · {sources.length} supporting notes <b>⌄</b></summary><ol>{sources.slice(0, 3).map((source, sourceIndex) => <li key={`${sourceIndex}-${source.content}`}>{source.content}</li>)}</ol></details>}</article><div className="story-actions"><button className="secondary" onClick={why}>Why this?</button><button className="primary compact" onClick={next}>{isLast ? 'Finish this walk' : 'Next story'} <span>→</span></button></div></section>;
}

function Complete({ count, memory, restart }: { count: number; memory: TourMemory; restart: () => void }) {
  return <section className="screen complete-screen"><div className="complete-orbit">✦</div><p className="eyebrow">WALK COMPLETE · {count} STORIES UNLOCKED</p><h2>You didn’t just<br /><em>see</em> the city.</h2><p>You followed one of its threads. The next walk can be a completely different one.</p><dl className="recap"><div><dt>THREADS</dt><dd>{memory.coveredThemes.slice(0, 3).join(' · ') || 'a first thread'}</dd></div><div><dt>DETOURS</dt><dd>{memory.acceptedDetours} taken · {memory.declinedDetours} declined</dd></div></dl><button className="primary" onClick={restart}>Choose another mood <span>→</span></button></section>;
}

function Why({ discovery, ranked, reason, close }: { discovery: Discovery; ranked?: RankedDiscovery; reason: string; close: () => void }) {
  const signals = ranked?.signals;
  return <div className="sheet-backdrop" onClick={close}><section className="why-sheet" onClick={e => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">WHY THIS IS ON YOUR WALK</p><h2>It is close, surprising, and changes how you see the street.</h2><p>{discovery.why}</p><p className="engine-reason">{reason}</p>{signals ? <><div className="scores">{(['relevance', 'novelty', 'proximity', 'visual'] as const).map(key => <div key={key}><span>{key} · {Math.round(weights[key] * 100)}%</span><b>{signals[key]}</b><i><em style={{ width: `${Math.min(100, signals[key])}%` }} /></i></div>)}</div><p className="score-total">Weighted total <b>{ranked!.total}</b> / 100</p></> : <div className="scores">{Object.entries(discovery.score).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div>}</section></div>;
}
