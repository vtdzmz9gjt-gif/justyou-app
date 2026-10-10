"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import SparseSky from "./SparseSky";
import { ArrowIcon, EyeIcon, SparkIcon, UnlockIcon } from "./icons";
import WinCelebration from "./WinCelebration";
import WeeklyRecap from "./WeeklyRecap";
import TreeOfLife, { type TreeState } from "./TreeOfLife";
import FamilyConstellation, { type FamilyState } from "./FamilyConstellation";
import { NODES as TREE_NODES, type SephirahKey } from "@/lib/tree";

// three.js needs a real canvas/WebGL context -- both client-only, no SSR.
const ElementOrb = dynamic(() => import("./ElementOrb"), { ssr: false });
const AvatarReveal = dynamic(() => import("./AvatarReveal"), { ssr: false });
const AlivenessCompass = dynamic(() => import("./AlivenessCompass"), { ssr: false });
const FirstLight = dynamic(() => import("./FirstLight"), { ssr: false });

// `id` is only present for messages fetched from the server -- a message
// appended optimistically on send (before the round-trip completes) has
// none yet, which the visible-boundary filter below treats as "always
// visible" (undefined is never <= a real boundary id).
type ChatMessage = { id?: number; role: "user" | "assistant"; content: string };
type Depth = "light" | "medium" | "deep";

// The elemental orb -- a per-session mechanic, deliberately separate from
// the five long-arc shape families. Resets every session (see
// VISIBLE_FROM_KEY below), never persists, never connects to stage/shape.
type Element = "fire" | "earth" | "air" | "water";
type ElementTally = Record<Element, number>;
const EMPTY_TALLY: ElementTally = { fire: 0, earth: 0, air: 0, water: 0 };
type AvatarRevealData = {
  dominant: Element;
  dominantPct: number;
  weakest: Element;
  weakestPct: number;
  reflection: string;
};

const USER_ID_KEY = "the_return_user_id";
const ONBOARDED_KEY = "the_return_onboarded";
const LANG_KEY = "the_return_lang";
// Shown once, ever, the first time the orb appears for this person.
// sessionStorage, not localStorage -- shown once per fresh app open, not
// once ever and not on every re-render while scrolling the same visit.
const LAST_COMMITMENT_SEEN_KEY = "the_return_last_commitment_seen";
// The server message id to hide the visible transcript up to and including
// -- set by "start fresh." The AI still gets the full history on every
// turn regardless; this only changes what's shown. Also the real boundary
// the per-session elemental orb resets against (sent to the server as
// sinceMessageId so its tally query can scope to "this session").
// Named _id (not the older, count-based `the_return_visible_from`) since
// a real DB id is what the server-side tally query needs -- a stale
// count-based value from before this just gets ignored as "show
// everything," which is a safe default, not a broken one.
const VISIBLE_FROM_KEY = "the_return_visible_from_id";
// The ISO timestamp of the most recent Sunday-7pm-local boundary the
// weekly recap has already been shown for -- computed fresh from the
// visitor's own browser clock every time (see weeklyRecapBoundary below),
// never stored server-side, so it's always correct for their actual
// timezone with no setup.
const WEEKLY_RECAP_SHOWN_KEY = "the_return_weekly_recap_shown";

// --- Stage colors, matching the arc discussed for the ambient background ---
const STAGE_COLORS: Record<string, { glow: string; pulse: string }> = {
  mystery: { glow: "#5F5E5A", pulse: "#444441" },
  safety: { glow: "#5DCAA5", pulse: "#1D9E75" },
  recognition: { glow: "#EF9F27", pulse: "#BA7517" },
  courage: { glow: "#F0997B", pulse: "#D85A30" },
  return: { glow: "#AFA9EC", pulse: "#7F77DD" },
};

// --- Mood colors, shown before any stage has been signaled ---
const MOOD_COLORS: Record<string, { glow: string; pulse: string; speed: string }> = {
  Calm: { glow: "#5DCAA5", pulse: "#1D9E75", speed: "6s" },
  Anxious: { glow: "#F0997B", pulse: "#D85A30", speed: "2.2s" },
  Angry: { glow: "#F09595", pulse: "#E24B4A", speed: "1.8s" },
  Numb: { glow: "#B4B2A9", pulse: "#888780", speed: "7s" },
  Tired: { glow: "#AFA9EC", pulse: "#7F77DD", speed: "5.5s" },
  Hopeful: { glow: "#EF9F27", pulse: "#BA7517", speed: "4s" },
  Stuck: { glow: "#85B7EB", pulse: "#378ADD", speed: "5s" },
  Overwhelmed: { glow: "#F2816B", pulse: "#D8431F", speed: "1.6s" },
  Restless: { glow: "#F2B24A", pulse: "#D88A1A", speed: "2s" },
  Content: { glow: "#8FCB6B", pulse: "#5B9E3A", speed: "6.5s" },
  Lonely: { glow: "#8E9FE0", pulse: "#5C6FC4", speed: "6s" },
  Frustrated: { glow: "#E8755F", pulse: "#C23E27", speed: "2s" },
  Curious: { glow: "#F2D24A", pulse: "#C4A017", speed: "3s" },
  Heavy: { glow: "#8A82A0", pulse: "#5C5470", speed: "7.5s" },
  Drained: { glow: "#A3A099", pulse: "#716E66", speed: "7s" },
  Grateful: { glow: "#E8C06B", pulse: "#BA8F2E", speed: "5s" },
  Nervous: { glow: "#F0C066", pulse: "#D89A2A", speed: "2.4s" },
};

const MOOD_KEYS = [
  "Calm",
  "Anxious",
  "Angry",
  "Numb",
  "Tired",
  "Hopeful",
  "Stuck",
  "Overwhelmed",
  "Restless",
  "Content",
  "Lonely",
  "Frustrated",
  "Curious",
  "Heavy",
  "Drained",
  "Grateful",
  "Nervous",
];

// --- Narrative depth, signaled invisibly by the model (see signal_depth in
// lib/anthropic.ts). Drives the ambient glow color -- never shown as a
// quiz, never announced.
const STAGE_ORDER = ["mystery", "safety", "recognition", "courage", "return"] as const;

// The threshold moment: a few seconds of near-black stillness with one
// quiet line, on every app open (not just first-time) -- the very first
// thing anyone reads, before onboarding or the opening question. Auto-
// advances after a beat, or on tap/click/keypress for anyone who doesn't
// want to wait it out.
function ThresholdOverlay({
  line,
  ariaLabel,
  onDone,
}: {
  line: string;
  ariaLabel: string;
  onDone: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const proceededRef = useRef(false);

  function proceed() {
    if (proceededRef.current) return;
    proceededRef.current = true;
    setClosing(true);
    setTimeout(onDone, 500);
  }

  useEffect(() => {
    const t = setTimeout(proceed, 3800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`threshold-overlay${closing ? " threshold-closing" : ""}`}
      onClick={proceed}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") proceed();
      }}
    >
      <p className="threshold-line">{line}</p>
    </div>
  );
}

// --- Translations for the static UI text (mood labels, hints, placeholders) ---
// English carries the full 5 rotating opening questions; every other language
// carries one, since translating five poetic variants per language is its
// own project — easy to expand later following the same shape.
type Strings = {
  brand: string;
  questions: string[];
  moodCaption: string;
  moods: string[];
  placeholderStart: string;
  placeholderContinue: string;
  settingsText: string;
  saveLabel: string;
  savedLabel: string;
  emailPlaceholder: string;
  youLabel: string;
  returnLabel: string;
  depthQuestion: string;
  depthOptions: string[];
  // The fixed line shown once during the threshold moment (a few seconds
  // of near-black stillness on every app open, before anything else --
  // spec section 12/13). Only composed fresh for the launch languages
  // (never machine-translated -- see spec section 13); every other
  // language falls back to English, see THRESHOLD_FALLBACK below.
  thresholdLine?: string;
  // Button label for the on-demand pattern review. Not yet translated for
  // every language -- falls back to English, see PATTERN_REVIEW_FALLBACK
  // below.
  patternReviewLabel?: string;
  // Reassurance shown in place of the plain typing dots once a reply has
  // been pending unusually long (the tool-use loop can make several silent
  // calls before actually replying). Not yet translated for every
  // language -- falls back to English, see STILL_HERE_FALLBACK below.
  stillHereLabel?: string;
  // Quiet returning-visitor callback to the last commitment, shown once per
  // fresh app open -- "{action}" is replaced with what they committed to.
  // Not yet translated for every language -- falls back to English, see
  // LAST_COMMITMENT_FALLBACK below.
  lastCommitmentLabel?: string;
  lastCommitmentLandedLabel?: string;
  // Quiet, always-available topbar control that clears the visible
  // transcript and restores the opening experience -- the AI still keeps
  // full history/memory regardless. Not yet translated for every
  // language -- falls back to English, see START_FRESH_FALLBACK below.
  startFreshLabel?: string;
  winHeadline?: string;
  weeklyRecapHeadline?: string;
  // A person's own chosen time to talk, most days -- never a hard rule,
  // just so a future check-in can land somewhere that's actually theirs.
  // Not yet translated for every language -- falls back to English, see
  // CHECKIN_FALLBACK below.
  checkInPromptText?: string;
  // Shared chrome text used across every overlay (Tree, Family, Avatar
  // Reveal, Win, Weekly Recap) and a few standalone controls -- kept here
  // rather than duplicated per-component since it's the same vocabulary
  // everywhere it appears.
  closeLabel: string;
  continueLabel: string;
  treeTabLabel: string;
  familyTabLabel: string;
  treeEntryLabel: string;
  chooseTimeLabel: string;
  chooseLanguageAriaLabel: string;
  continueAriaLabel: string;
  checkInSettingsAriaLabel: string;
  sendAriaLabel: string;
  // Nouns for the four elements, shown in the Avatar Reveal legend --
  // distinct from `moods`, which are emotional states, not elements.
  elementLabels: { fire: string; earth: string; air: string; water: string };
  // Avatar Reveal headline template -- "{element}" and "{pct}" are
  // substituted with the translated element noun and the percentage.
  avatarHeadlineTemplate: string;
  // The longer privacy note, for the settings panel -- same facts as the
  // short onboarding version (see ONBOARDING_STRINGS' privacy1/privacy2),
  // just with a bit more detail for anyone who wants to revisit it later.
  privacyLong1: string;
  privacyLong2: string;
};


const THRESHOLD_FALLBACK = {
  thresholdLine:
    "You know exactly who you're not. You've just never asked who's left. This is where you meet the rest of it.",
};

const PATTERN_REVIEW_FALLBACK = {
  patternReviewLabel: "See the pattern",
};

const STILL_HERE_FALLBACK = {
  stillHereLabel: "Still here — this one's taking a little longer.",
};

const LAST_COMMITMENT_FALLBACK = {
  lastCommitmentLabel: "Last time: {action}.",
  lastCommitmentLandedLabel: "Last time: {action} — and you did it.",
};

const START_FRESH_FALLBACK = {
  startFreshLabel: "start fresh",
};

const WIN_FALLBACK = {
  winHeadline: "You did it.",
};

const WEEKLY_RECAP_FALLBACK = {
  weeklyRecapHeadline: "This week.",
};

const CHECKIN_FALLBACK = {
  checkInPromptText:
    "When's usually a good time for you? I'll check in warmly around then — never a hard rule, just less random than a stranger's guess.",
};

// English-only for now, unlike the rest of this file's fully translated
// strings -- subscriptions are new enough that translating all 22
// languages up front isn't worth blocking this on.
const SUBSCRIPTION_FALLBACK = {
  limitMessage:
    "You've used your 3 free conversations this month. Subscribe for unlimited, or come back next month.",
  subscribeLabel: "Subscribe — $9.99/month",
  manageLabel: "Manage subscription",
  restoreLabel: "Restore my subscription",
  restorePlaceholder: "Your billing email",
  restoreSentLabel: "If that email has an active subscription, we've sent a link to restore it.",
  checkoutErrorLabel: "Couldn't start checkout. Try again in a moment.",
};

// A plain dropdown list of half-hour slots, rather than a native <input
// type="time"> -- that native picker is unreliable across browsers (some
// show a value while still failing the browser's own "field is empty"
// validation), while a <select> just works everywhere. Value is always
// 24h "HH:MM" to match the server's expected format; label is a friendly
// 12h string.
const CHECKIN_TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const value = `${String(hour24).padStart(2, "0")}:${minute}`;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 < 12 ? "AM" : "PM";
  return { value, label: `${hour12}:${minute} ${period}` };
});

const STRINGS: Record<string, Strings> = {
  en: {
    brand: "Just You",
    questions: [
      "What are you ready to stop performing?",
      "Who were you before you learned to perform?",
      "What are you pretending not to want?",
      "What would you say if no one was grading you?",
      "What's the thing you're most tired of proving?",
      "How are you, really?",
      "What's today been like?",
      "What's on your mind?",
      "Where's your head at right now?",
      "What's been taking up space in you lately?",
      "What are you carrying today?",
      "How's your week been, actually?",
      "What's true for you right now?",
      "What's been sitting with you?",
      "What do you need right now?",
      "What's weighing on you today?",
      "What kind of day is this turning into?",
      "What's your energy like right now?",
      "What's the first thing you'd tell a friend about today?",
      "What's been loud in your head lately?",
      "How's your body feeling right now?",
      "What's one thing from today that's stayed with you?",
      "What do you wish someone would ask you right now?",
      "What's the honest answer to 'how are you'?",
      "What's been quietly bothering you?",
    ],
    moodCaption: "And how are you feeling right now?",
    moods: [
      "Calm",
      "Anxious",
      "Angry",
      "Numb",
      "Tired",
      "Hopeful",
      "Stuck",
      "Overwhelmed",
      "Restless",
      "Content",
      "Lonely",
      "Frustrated",
      "Curious",
      "Heavy",
      "Drained",
      "Grateful",
      "Nervous",
    ],
    placeholderStart: "Answer, or say anything.",
    placeholderContinue: "Say what's true.",
    settingsText: "Leave an email and if a commitment comes due, you'll hear from Just You before you have to come back on your own.",
    saveLabel: "Save",
    savedLabel: "You're set.",
    emailPlaceholder: "you@example.com",
    youLabel: "you",
    returnLabel: "just you",
    depthQuestion: "How much do you want to get into today?",
    depthOptions: ["Just looking around", "A little", "I've got something on my mind"],
    thresholdLine:
      "You know exactly who you're not. You've just never asked who's left. This is where you meet the rest of it.",
    patternReviewLabel: "See the pattern",
    stillHereLabel: "Still here — this one's taking a little longer.",
    lastCommitmentLabel: "Last time: {action}.",
    lastCommitmentLandedLabel: "Last time: {action} — and you did it.",
    startFreshLabel: "start fresh",
    winHeadline: "You did it.",
    weeklyRecapHeadline: "This week.",
    checkInPromptText:
      "When's usually a good time for you? I'll check in warmly around then — never a hard rule, just less random than a stranger's guess.",
    closeLabel: "close",
    continueLabel: "continue",
    treeTabLabel: "Your Tree",
    familyTabLabel: "Your Family",
    treeEntryLabel: "Your Tree",
    chooseTimeLabel: "Choose a time",
    chooseLanguageAriaLabel: "Choose language",
    continueAriaLabel: "Continue",
    checkInSettingsAriaLabel: "Check-in settings",
    sendAriaLabel: "Send",
    elementLabels: { fire: "Fire", earth: "Earth", air: "Air", water: "Water" },
    avatarHeadlineTemplate: "{element} — {pct}% tonight.",
    privacyLong1: "Your conversations are stored securely, tied to a private, anonymous ID generated on this device — never your name or a public account. That's what lets the app remember you between conversations and notice real patterns over time, instead of starting over every time you open it.",
    privacyLong2: "Your data is never sold, never shared with advertisers or other third parties, and never used to train AI models — Just You's or anyone else's. Everything is encrypted both in transit and at rest. Conversations are never read, reviewed, or shared with anyone, including us — they exist only so the app can respond to you with real context.",
  },
  es: {
    brand: "Just You",
    questions: [
      "¿Qué estás listo para dejar de aparentar?",
      "¿Quién eras antes de aprender a aparentar?",
      "¿Qué finges no querer?",
      "¿Qué dirías si nadie te estuviera juzgando?",
      "¿Qué es lo que ya estás más cansado de demostrar?",
      "¿Cómo estás, de verdad?",
      "¿Cómo ha sido tu día?",
      "¿Qué tienes en mente?",
      "¿Dónde tienes la cabeza ahora mismo?",
      "¿Qué ha estado ocupando espacio en ti últimamente?",
      "¿Qué estás cargando hoy?",
      "¿Cómo ha sido tu semana, en realidad?",
      "¿Qué es verdad para ti ahora mismo?",
      "¿Qué se ha estado quedando contigo?",
      "¿Qué necesitas ahora mismo?",
      "¿Qué te está pesando hoy?",
      "¿En qué se está convirtiendo este día?",
      "¿Cómo es tu energía ahora mismo?",
      "¿Qué es lo primero que le contarías a un amigo sobre hoy?",
      "¿Qué ha estado sonando fuerte en tu cabeza últimamente?",
      "¿Cómo se siente tu cuerpo ahora mismo?",
      "¿Qué es algo de hoy que se te ha quedado grabado?",
      "¿Qué desearías que alguien te preguntara ahora mismo?",
      "¿Cuál es la respuesta honesta a '¿cómo estás?'?",
      "¿Qué te ha estado molestando en silencio?",
    ],
    moodCaption: "¿Y cómo te sientes ahora mismo?",
    moods: [
      "Tranquilo", "Ansioso", "Enfadado", "Entumecido", "Cansado", "Esperanzado", "Atascado",
      "Abrumado",
      "Inquieto",
      "Satisfecho",
      "Solo",
      "Frustrado",
      "Curioso",
      "Agobiado",
      "Agotado",
      "Agradecido",
      "Nervioso",
    ],
    placeholderStart: "Responde, o di cualquier cosa.",
    placeholderContinue: "Di lo que es verdad.",
    settingsText: "Deja un correo y si un compromiso vence, sabrás de Just You antes de tener que volver por tu cuenta.",
    saveLabel: "Guardar",
    savedLabel: "Listo.",
    emailPlaceholder: "tu@ejemplo.com",
    youLabel: "tú",
    returnLabel: "just you",
    depthQuestion: "¿Qué tan a fondo quieres ir hoy?",
    depthOptions: ["Solo mirando", "Un poco", "Tengo algo en mente"],
    thresholdLine:
      "Sabes exactamente quién no eres. Solo nunca has preguntado quién queda. Aquí conoces al resto.",
    patternReviewLabel: "Ver el patrón",
    stillHereLabel: "Sigo aquí — esta está tardando un poco más.",
    lastCommitmentLabel: "La última vez: {action}.",
    lastCommitmentLandedLabel: "La última vez: {action} — y lo hiciste.",
    startFreshLabel: "empezar de nuevo",
    winHeadline: "Lo lograste.",
    weeklyRecapHeadline: "Esta semana.",
    checkInPromptText:
      "¿Cuál suele ser un buen momento para ti? Te escribiré con calidez por esas fechas — nunca una regla fija, solo menos al azar que la suposición de un desconocido.",
    closeLabel: "cerrar",
    continueLabel: "continuar",
    treeTabLabel: "Tu árbol",
    familyTabLabel: "Tu familia",
    treeEntryLabel: "Tu árbol",
    chooseTimeLabel: "Elige una hora",
    chooseLanguageAriaLabel: "Elegir idioma",
    continueAriaLabel: "Continuar",
    checkInSettingsAriaLabel: "Ajustes de seguimiento",
    sendAriaLabel: "Enviar",
    elementLabels: { fire: "Fuego", earth: "Tierra", air: "Aire", water: "Agua" },
    avatarHeadlineTemplate: "{element} — {pct}% esta noche.",
    privacyLong1: "Tus conversaciones se guardan de forma segura, vinculadas a un ID privado y anónimo generado en este dispositivo — nunca tu nombre ni una cuenta pública. Eso es lo que permite que la app te recuerde entre conversaciones y note patrones reales con el tiempo, en vez de empezar de cero cada vez que la abres.",
    privacyLong2: "Tus datos nunca se venden, nunca se comparten con anunciantes u otros terceros, y nunca se usan para entrenar modelos de IA — ni de Just You ni de nadie más. Todo está cifrado tanto en tránsito como en reposo. Las conversaciones nunca son leídas, revisadas ni compartidas con nadie, ni siquiera con nosotros — existen solo para que la app pueda responderte con contexto real.",
  },
  fr: {
    brand: "Just You",
    questions: [
      "Qu'es-tu prêt à arrêter de jouer ?",
      "Qui étais-tu avant d'apprendre à jouer un rôle ?",
      "Qu'est-ce que tu fais semblant de ne pas vouloir ?",
      "Que dirais-tu si personne ne te jugeait ?",
      "Qu'est-ce que tu es le plus fatigué de prouver ?",
      "Comment vas-tu, vraiment ?",
      "C'était comment, aujourd'hui ?",
      "À quoi penses-tu ?",
      "Où est ta tête en ce moment ?",
      "Qu'est-ce qui prend de la place en toi ces derniers temps ?",
      "Qu'est-ce que tu portes aujourd'hui ?",
      "Comment s'est vraiment passée ta semaine ?",
      "Qu'est-ce qui est vrai pour toi en ce moment ?",
      "Qu'est-ce qui reste avec toi ces derniers temps ?",
      "De quoi as-tu besoin en ce moment ?",
      "Qu'est-ce qui pèse sur toi aujourd'hui ?",
      "En quoi cette journée est-elle en train de se transformer ?",
      "Comment est ton énergie en ce moment ?",
      "Quelle serait la première chose que tu dirais à un ami à propos d'aujourd'hui ?",
      "Qu'est-ce qui a été bruyant dans ta tête ces derniers temps ?",
      "Comment se sent ton corps en ce moment ?",
      "Qu'est-ce qui, aujourd'hui, est resté avec toi ?",
      "Qu'aimerais-tu que quelqu'un te demande en ce moment ?",
      "Quelle est la réponse honnête à « comment vas-tu » ?",
      "Qu'est-ce qui te dérange, discrètement ?",
    ],
    moodCaption: "Et comment te sens-tu en ce moment ?",
    moods: [
      "Calme", "Anxieux", "En colère", "Engourdi", "Fatigué", "Plein d'espoir", "Bloqué",
      "Débordé",
      "Agité",
      "Satisfait",
      "Seul",
      "Frustré",
      "Curieux",
      "Accablé",
      "Épuisé",
      "Reconnaissant",
      "Nerveux",
    ],
    placeholderStart: "Réponds, ou dis n'importe quoi.",
    placeholderContinue: "Dis ce qui est vrai.",
    settingsText: "Laisse un e-mail et si un engagement arrive à échéance, Just You te contactera avant que tu aies à revenir seul.",
    saveLabel: "Enregistrer",
    savedLabel: "C'est fait.",
    emailPlaceholder: "toi@exemple.com",
    youLabel: "toi",
    returnLabel: "just you",
    depthQuestion: "Tu veux aller jusqu'où aujourd'hui ?",
    depthOptions: ["Je regarde juste", "Un peu", "J'ai quelque chose en tête"],
    thresholdLine:
      "Tu sais exactement qui tu n'es pas. Tu n'as juste jamais demandé qui reste. C'est ici que tu le rencontres.",
    patternReviewLabel: "Voir le schéma",
    stillHereLabel: "Toujours là — celle-ci prend un peu plus de temps.",
    lastCommitmentLabel: "La dernière fois : {action}.",
    lastCommitmentLandedLabel: "La dernière fois : {action} — et tu l'as fait.",
    startFreshLabel: "recommencer",
    winHeadline: "Tu l'as fait.",
    weeklyRecapHeadline: "Cette semaine.",
    checkInPromptText:
      "Quel est généralement un bon moment pour toi ? Je prendrai des nouvelles avec douceur vers cette heure-là — jamais une règle stricte, juste moins aléatoire que la supposition d'un inconnu.",
    closeLabel: "fermer",
    continueLabel: "continuer",
    treeTabLabel: "Ton arbre",
    familyTabLabel: "Ta famille",
    treeEntryLabel: "Ton arbre",
    chooseTimeLabel: "Choisis une heure",
    chooseLanguageAriaLabel: "Choisir la langue",
    continueAriaLabel: "Continuer",
    checkInSettingsAriaLabel: "Paramètres de suivi",
    sendAriaLabel: "Envoyer",
    elementLabels: { fire: "Feu", earth: "Terre", air: "Air", water: "Eau" },
    avatarHeadlineTemplate: "{element} — {pct}% ce soir.",
    privacyLong1: "Tes conversations sont stockées de façon sécurisée, rattachées à un identifiant privé et anonyme généré sur cet appareil — jamais ton nom ni un compte public. C'est ce qui permet à l'appli de se souvenir de toi d'une conversation à l'autre et de remarquer de vrais schémas dans le temps, au lieu de repartir de zéro à chaque ouverture.",
    privacyLong2: "Tes données ne sont jamais vendues, jamais partagées avec des annonceurs ou d'autres tiers, et jamais utilisées pour entraîner des modèles d'IA — ni ceux de Just You, ni ceux de qui que ce soit d'autre. Tout est chiffré à la fois en transit et au repos. Les conversations ne sont jamais lues, examinées ni partagées avec qui que ce soit, nous y compris — elles n'existent que pour que l'appli puisse te répondre avec un vrai contexte.",
  },
  de: {
    brand: "Just You",
    questions: [
      "Was bist du bereit, nicht mehr vorzuspielen?",
      "Wer warst du, bevor du gelernt hast, eine Rolle zu spielen?",
      "Was gibst du vor, nicht zu wollen?",
      "Was würdest du sagen, wenn dich niemand bewerten würde?",
      "Was zu beweisen bist du am meisten leid?",
      "Wie geht es dir wirklich?",
      "Wie war dein Tag bisher?",
      "Was beschäftigt dich gerade?",
      "Wo ist dein Kopf gerade?",
      "Was hat in letzter Zeit viel Raum in dir eingenommen?",
      "Was trägst du heute mit dir herum?",
      "Wie war deine Woche wirklich?",
      "Was stimmt gerade für dich?",
      "Was ist in letzter Zeit bei dir geblieben?",
      "Was brauchst du gerade?",
      "Was lastet heute auf dir?",
      "Zu was für einem Tag wird das hier gerade?",
      "Wie ist deine Energie gerade?",
      "Was wäre das Erste, das du einem Freund über heute erzählen würdest?",
      "Was war in letzter Zeit laut in deinem Kopf?",
      "Wie fühlt sich dein Körper gerade an?",
      "Was von heute ist bei dir hängengeblieben?",
      "Was wünschtest du dir, würde dich gerade jemand fragen?",
      "Was ist die ehrliche Antwort auf 'wie geht's dir'?",
      "Was hat dich still beschäftigt?",
    ],
    moodCaption: "Und wie fühlst du dich gerade?",
    moods: [
      "Ruhig", "Ängstlich", "Wütend", "Taub", "Müde", "Hoffnungsvoll", "Feststeckend",
      "Überfordert",
      "Unruhig",
      "Zufrieden",
      "Einsam",
      "Frustriert",
      "Neugierig",
      "Schwer",
      "Erschöpft",
      "Dankbar",
      "Nervös",
    ],
    placeholderStart: "Antworte, oder sag irgendetwas.",
    placeholderContinue: "Sag, was wahr ist.",
    settingsText: "Hinterlasse eine E-Mail — wenn eine Verpflichtung fällig wird, meldet sich Just You, bevor du selbst zurückkommen musst.",
    saveLabel: "Speichern",
    savedLabel: "Erledigt.",
    emailPlaceholder: "du@beispiel.de",
    youLabel: "du",
    returnLabel: "just you",
    depthQuestion: "Wie tief willst du heute gehen?",
    depthOptions: ["Ich schaue nur", "Ein bisschen", "Ich habe etwas im Kopf"],
    thresholdLine:
      "Du weißt genau, wer du nicht bist. Wer noch übrig ist, hast du nie gefragt. Hier triffst du ihn.",
    patternReviewLabel: "Das Muster sehen",
    stillHereLabel: "Noch da — das hier dauert etwas länger.",
    lastCommitmentLabel: "Letztes Mal: {action}.",
    lastCommitmentLandedLabel: "Letztes Mal: {action} — und du hast es geschafft.",
    startFreshLabel: "neu anfangen",
    winHeadline: "Du hast es geschafft.",
    weeklyRecapHeadline: "Diese Woche.",
    checkInPromptText:
      "Wann passt es dir normalerweise am besten? Ich melde mich dann herzlich — nie eine feste Regel, nur weniger zufällig als die Vermutung eines Fremden.",
    closeLabel: "schließen",
    continueLabel: "weiter",
    treeTabLabel: "Dein Baum",
    familyTabLabel: "Deine Familie",
    treeEntryLabel: "Dein Baum",
    chooseTimeLabel: "Wähle eine Uhrzeit",
    chooseLanguageAriaLabel: "Sprache wählen",
    continueAriaLabel: "Weiter",
    checkInSettingsAriaLabel: "Check-in-Einstellungen",
    sendAriaLabel: "Senden",
    elementLabels: { fire: "Feuer", earth: "Erde", air: "Luft", water: "Wasser" },
    avatarHeadlineTemplate: "{element} — {pct}% heute Abend.",
    privacyLong1: "Deine Gespräche werden sicher gespeichert, verknüpft mit einer privaten, anonymen ID, die auf diesem Gerät erzeugt wird — nie mit deinem Namen oder einem öffentlichen Konto. Nur so kann die App sich zwischen Gesprächen an dich erinnern und echte Muster über die Zeit erkennen, statt jedes Mal beim Öffnen von vorne anzufangen.",
    privacyLong2: "Deine Daten werden nie verkauft, nie an Werbetreibende oder andere Dritte weitergegeben und nie zum Trainieren von KI-Modellen verwendet — weder von Just You noch von irgendjemand anderem. Alles ist sowohl bei der Übertragung als auch bei der Speicherung verschlüsselt. Gespräche werden von niemandem gelesen, überprüft oder weitergegeben, auch nicht von uns — sie existieren nur, damit die App dir mit echtem Kontext antworten kann.",
  },
  pt: {
    brand: "Just You",
    questions: [
      "O que você está pronto para parar de fingir?",
      "Quem você era antes de aprender a fingir?",
      "O que você finge não querer?",
      "O que você diria se ninguém estivesse te julgando?",
      "O que você está mais cansado de provar?",
      "Como você está, de verdade?",
      "Como foi o seu dia hoje?",
      "O que está passando pela sua cabeça?",
      "Onde está sua cabeça agora?",
      "O que tem ocupado espaço em você ultimamente?",
      "O que você está carregando hoje?",
      "Como foi sua semana, na real?",
      "O que é verdade para você agora?",
      "O que tem ficado com você ultimamente?",
      "Do que você precisa agora?",
      "O que está pesando em você hoje?",
      "Em que tipo de dia isso está se transformando?",
      "Como está sua energia agora?",
      "Qual seria a primeira coisa que você contaria a um amigo sobre hoje?",
      "O que tem estado alto na sua cabeça ultimamente?",
      "Como seu corpo está se sentindo agora?",
      "Qual coisa de hoje ficou com você?",
      "O que você gostaria que alguém te perguntasse agora?",
      "Qual é a resposta honesta para 'como você está'?",
      "O que tem te incomodado silenciosamente?",
    ],
    moodCaption: "E como você está se sentindo agora?",
    moods: [
      "Calmo", "Ansioso", "Irritado", "Anestesiado", "Cansado", "Esperançoso", "Travado",
      "Sobrecarregado",
      "Inquieto",
      "Satisfeito",
      "Sozinho",
      "Frustrado",
      "Curioso",
      "Pesado",
      "Esgotado",
      "Grato",
      "Nervoso",
    ],
    placeholderStart: "Responda, ou diga qualquer coisa.",
    placeholderContinue: "Diga o que é verdade.",
    settingsText: "Deixe um e-mail e, se um compromisso vencer, você terá notícias de Just You antes de precisar voltar sozinho.",
    saveLabel: "Salvar",
    savedLabel: "Pronto.",
    emailPlaceholder: "voce@exemplo.com",
    youLabel: "você",
    returnLabel: "just you",
    depthQuestion: "O quanto você quer se aprofundar hoje?",
    depthOptions: ["Só olhando", "Um pouco", "Tenho algo em mente"],
    thresholdLine:
      "Você sabe exatamente quem não é. Só nunca perguntou quem sobrou. É aqui que você o encontra.",
    patternReviewLabel: "Ver o padrão",
    stillHereLabel: "Ainda aqui — essa está demorando um pouco mais.",
    lastCommitmentLabel: "Da última vez: {action}.",
    lastCommitmentLandedLabel: "Da última vez: {action} — e você fez isso.",
    startFreshLabel: "recomeçar",
    winHeadline: "Você conseguiu.",
    weeklyRecapHeadline: "Esta semana.",
    checkInPromptText:
      "Qual costuma ser um bom horário para você? Vou entrar em contato com carinho por essa hora — nunca uma regra fixa, só menos aleatório do que o palpite de um estranho.",
    closeLabel: "fechar",
    continueLabel: "continuar",
    treeTabLabel: "Sua árvore",
    familyTabLabel: "Sua família",
    treeEntryLabel: "Sua árvore",
    chooseTimeLabel: "Escolha um horário",
    chooseLanguageAriaLabel: "Escolher idioma",
    continueAriaLabel: "Continuar",
    checkInSettingsAriaLabel: "Configurações de check-in",
    sendAriaLabel: "Enviar",
    elementLabels: { fire: "Fogo", earth: "Terra", air: "Ar", water: "Água" },
    avatarHeadlineTemplate: "{element} — {pct}% esta noite.",
    privacyLong1: "Suas conversas são armazenadas com segurança, vinculadas a um ID privado e anônimo gerado neste dispositivo — nunca seu nome ou uma conta pública. É isso que permite que o app se lembre de você entre conversas e note padrões reais ao longo do tempo, em vez de recomeçar do zero toda vez que você o abre.",
    privacyLong2: "Seus dados nunca são vendidos, nunca são compartilhados com anunciantes ou outros terceiros, e nunca são usados para treinar modelos de IA — nem do Just You, nem de mais ninguém. Tudo é criptografado tanto em trânsito quanto em repouso. As conversas nunca são lidas, revisadas ou compartilhadas com ninguém, nem mesmo conosco — elas existem apenas para que o app possa responder a você com contexto real.",
  },
  it: {
    brand: "Just You",
    questions: [
      "Cosa sei pronto a smettere di recitare?",
      "Chi eri prima di imparare a recitare?",
      "Cosa fingi di non volere?",
      "Cosa diresti se nessuno ti stesse giudicando?",
      "Cosa sei più stanco di dover dimostrare?",
      "Come stai, davvero?",
      "Com'è stata la tua giornata?",
      "A cosa stai pensando?",
      "Dove hai la testa in questo momento?",
      "Cosa ha occupato spazio dentro di te ultimamente?",
      "Cosa stai portando con te oggi?",
      "Com'è stata davvero la tua settimana?",
      "Cosa è vero per te in questo momento?",
      "Cosa ti è rimasto dentro ultimamente?",
      "Di cosa hai bisogno in questo momento?",
      "Cosa ti pesa oggi?",
      "In che tipo di giornata si sta trasformando questa?",
      "Com'è la tua energia in questo momento?",
      "Qual è la prima cosa che diresti a un amico di oggi?",
      "Cosa è stato rumoroso nella tua testa ultimamente?",
      "Come si sente il tuo corpo in questo momento?",
      "Cosa di oggi ti è rimasto addosso?",
      "Cosa vorresti che qualcuno ti chiedesse in questo momento?",
      "Qual è la risposta onesta a 'come stai'?",
      "Cosa ti ha disturbato in silenzio?",
    ],
    moodCaption: "E come ti senti adesso?",
    moods: [
      "Calmo", "Ansioso", "Arrabbiato", "Intorpidito", "Stanco", "Speranzoso", "Bloccato",
      "Sopraffatto",
      "Irrequieto",
      "Appagato",
      "Solo",
      "Frustrato",
      "Curioso",
      "Appesantito",
      "Esausto",
      "Grato",
      "Nervoso",
    ],
    placeholderStart: "Rispondi, o di' qualsiasi cosa.",
    placeholderContinue: "Di' ciò che è vero.",
    settingsText: "Lascia un'email — se un impegno scade, Just You ti scriverà prima che tu debba tornare da solo.",
    saveLabel: "Salva",
    savedLabel: "Fatto.",
    emailPlaceholder: "tu@esempio.it",
    youLabel: "tu",
    returnLabel: "just you",
    depthQuestion: "Quanto vuoi approfondire oggi?",
    depthOptions: ["Sto solo guardando", "Un po'", "Ho qualcosa in mente"],
    thresholdLine:
      "Sai benissimo chi non sei. Ma chi sei davvero, non l'hai mai incontrato. Qui lo incontri.",
    patternReviewLabel: "Vedi lo schema",
    stillHereLabel: "Sono ancora qui — questa sta impiegando un po' più tempo.",
    lastCommitmentLabel: "L'ultima volta: {action}.",
    lastCommitmentLandedLabel: "L'ultima volta: {action} — e l'hai fatto.",
    startFreshLabel: "ricomincia",
    winHeadline: "Ce l'hai fatta.",
    weeklyRecapHeadline: "Questa settimana.",
    checkInPromptText:
      "Qual è di solito un buon momento per te? Ti scriverò con calore verso quell'ora — mai una regola fissa, solo meno casuale dell'ipotesi di uno sconosciuto.",
    closeLabel: "chiudi",
    continueLabel: "continua",
    treeTabLabel: "Il tuo albero",
    familyTabLabel: "La tua famiglia",
    treeEntryLabel: "Il tuo albero",
    chooseTimeLabel: "Scegli un orario",
    chooseLanguageAriaLabel: "Scegli lingua",
    continueAriaLabel: "Continua",
    checkInSettingsAriaLabel: "Impostazioni check-in",
    sendAriaLabel: "Invia",
    elementLabels: { fire: "Fuoco", earth: "Terra", air: "Aria", water: "Acqua" },
    avatarHeadlineTemplate: "{element} — {pct}% stasera.",
    privacyLong1: "Le tue conversazioni vengono archiviate in modo sicuro, collegate a un ID privato e anonimo generato su questo dispositivo — mai il tuo nome o un account pubblico. È questo che permette all'app di ricordarti tra una conversazione e l'altra e di notare schemi reali nel tempo, invece di ricominciare da zero ogni volta che la apri.",
    privacyLong2: "I tuoi dati non vengono mai venduti, mai condivisi con inserzionisti o altre terze parti, e mai usati per addestrare modelli di IA — né di Just You né di chiunque altro. Tutto è crittografato sia in transito che a riposo. Le conversazioni non vengono mai lette, esaminate o condivise con nessuno, nemmeno con noi — esistono solo perché l'app possa risponderti con un contesto reale.",
  },
  he: {
    brand: "Just You",
    questions: [
      "מה אתה מוכן להפסיק להעמיד פנים?",
      "מי היית לפני שלמדת להעמיד פנים?",
      "מה אתה מעמיד פנים שאתה לא רוצה?",
      "מה היית אומר אם אף אחד לא היה שופט אותך?",
      "ממה אתה הכי עייף להוכיח?",
      "איך אתה באמת?",
      "איך היה היום שלך?",
      "מה מעסיק אותך?",
      "איפה הראש שלך עכשיו?",
      "מה תפס מקום בתוכך לאחרונה?",
      "מה אתה נושא היום?",
      "איך באמת היה השבוע שלך?",
      "מה נכון עבורך עכשיו?",
      "מה נשאר איתך לאחרונה?",
      "מה אתה צריך עכשיו?",
      "מה מכביד עליך היום?",
      "לאיזה מין יום זה הופך?",
      "איך האנרגיה שלך עכשיו?",
      "מה הדבר הראשון שהיית מספר לחבר על היום?",
      "מה היה רועש בראש שלך לאחרונה?",
      "איך הגוף שלך מרגיש עכשיו?",
      "מה מהיום נשאר איתך?",
      "מה היית רוצה שמישהו ישאל אותך עכשיו?",
      "מה התשובה הכנה ל'מה שלומך'?",
      "מה מטריד אותך בשקט?",
    ],
    moodCaption: "ואיך אתה מרגיש עכשיו?",
    moods: [
      "רגוע", "חרד", "כועס", "קהה", "עייף", "מקווה", "תקוע",
      "המום",
      "חסר מנוחה",
      "שבע רצון",
      "בודד",
      "מתוסכל",
      "סקרן",
      "כבד",
      "מותש",
      "אסיר תודה",
      "עצבני",
    ],
    placeholderStart: "תענה, או תגיד משהו.",
    placeholderContinue: "תגיד מה שנכון.",
    settingsText: "השאר אימייל — אם התחייבות מגיעה למועד, תשמע מ-Just You לפני שתצטרך לחזור בעצמך.",
    saveLabel: "שמור",
    savedLabel: "סגור.",
    emailPlaceholder: "you@example.com",
    youLabel: "אתה",
    returnLabel: "just you",
    depthQuestion: "כמה עמוק אתה רוצה להיכנס היום?",
    depthOptions: ["רק מסתכל", "קצת", "יש לי משהו בראש"],
    thresholdLine: "אתה יודע בדיוק מי אתה לא. אבל מעולם לא שאלת מי נשאר. כאן אתה פוגש את זה.",
    patternReviewLabel: "לראות את התבנית",
    stillHereLabel: "עדיין כאן — זה לוקח קצת יותר זמן.",
    lastCommitmentLabel: "בפעם הקודמת: {action}.",
    lastCommitmentLandedLabel: "בפעם הקודמת: {action} — ועשית את זה.",
    startFreshLabel: "להתחיל מחדש",
    winHeadline: "עשית את זה.",
    weeklyRecapHeadline: "השבוע.",
    checkInPromptText:
      "מתי בדרך כלל נוח לך? אתקשר אליך בחום בסביבות השעה הזו — לעולם לא כלל נוקשה, רק פחות אקראי מניחוש של זר.",
    closeLabel: "סגור",
    continueLabel: "המשך",
    treeTabLabel: "העץ שלך",
    familyTabLabel: "המשפחה שלך",
    treeEntryLabel: "העץ שלך",
    chooseTimeLabel: "בחר שעה",
    chooseLanguageAriaLabel: "בחר שפה",
    continueAriaLabel: "המשך",
    checkInSettingsAriaLabel: "הגדרות בדיקה",
    sendAriaLabel: "שלח",
    elementLabels: { fire: "אש", earth: "אדמה", air: "אוויר", water: "מים" },
    avatarHeadlineTemplate: "{element} — {pct}% הערב.",
    privacyLong1: "השיחות שלך נשמרות בצורה מאובטחת, מקושרות למזהה פרטי ואנונימי שנוצר במכשיר הזה — לעולם לא השם שלך או חשבון ציבורי. זה מה שמאפשר לאפליקציה לזכור אותך בין שיחות ולהבחין בדפוסים אמיתיים לאורך זמן, במקום להתחיל מחדש בכל פעם שאתה פותח אותה.",
    privacyLong2: "המידע שלך לעולם לא נמכר, לעולם לא משותף עם מפרסמים או גורמים שלישיים אחרים, ולעולם לא משמש לאימון מודלים של בינה מלאכותית — לא של Just You ולא של אף אחד אחר. הכול מוצפן הן בזמן העברה והן באחסון. שיחות לעולם לא נקראות, נבדקות או משותפות עם אף אחד, כולל אנחנו — הן קיימות רק כדי שהאפליקציה תוכל להגיב אליך עם הקשר אמיתי.",
  },
  ar: {
    brand: "Just You",
    questions: [
      "ما الذي أنت مستعد للتوقف عن التظاهر به؟",
      "من كنت قبل أن تتعلم التظاهر؟",
      "ما الذي تتظاهر بأنك لا تريده؟",
      "ماذا كنت لتقول لو لم يكن أحد يحكم عليك؟",
      "ما الذي سئمت أكثر من إثباته؟",
      "كيف حالك، حقًا؟",
      "كيف كان يومك؟",
      "بم تفكر؟",
      "أين عقلك الآن؟",
      "ما الذي أخذ حيزًا منك مؤخرًا؟",
      "ما الذي تحمله اليوم؟",
      "كيف كان أسبوعك فعلًا؟",
      "ما الحقيقي بالنسبة لك الآن؟",
      "ما الذي بقي معك مؤخرًا؟",
      "ما الذي تحتاجه الآن؟",
      "ما الذي يثقل عليك اليوم؟",
      "إلى أي نوع من الأيام يتحول هذا اليوم؟",
      "كيف هي طاقتك الآن؟",
      "ما أول شيء كنت لتخبر به صديقًا عن اليوم؟",
      "ما الذي كان صاخبًا في رأسك مؤخرًا؟",
      "كيف يشعر جسدك الآن؟",
      "ما الشيء من اليوم الذي بقي معك؟",
      "ما الذي تتمنى لو سألك أحد عنه الآن؟",
      "ما الإجابة الصادقة عن 'كيف حالك'؟",
      "ما الذي يزعجك بهدوء؟",
    ],
    moodCaption: "وكيف تشعر الآن؟",
    moods: [
      "هادئ", "قلق", "غاضب", "خدر", "متعب", "متفائل", "عالق",
      "مرهق",
      "قلق لا يهدأ",
      "راضٍ",
      "وحيد",
      "محبط",
      "فضولي",
      "مثقل",
      "منهك",
      "ممتن",
      "متوتر",
    ],
    placeholderStart: "أجب، أو قل أي شيء.",
    placeholderContinue: "قل ما هو حقيقي.",
    settingsText: "اترك بريدًا إلكترونيًا — وإذا حان موعد التزام، ستسمع من Just You قبل أن تضطر للعودة بنفسك.",
    saveLabel: "حفظ",
    savedLabel: "تم.",
    emailPlaceholder: "you@example.com",
    youLabel: "أنت",
    returnLabel: "just you",
    depthQuestion: "كم تريد أن تتعمق اليوم؟",
    depthOptions: ["فقط أتصفح", "قليلاً", "لدي شيء في بالي"],
    thresholdLine: "أنت تعرف بالضبط من لست. لكنك لم تسأل قط من تبقى. هنا تقابله.",
    patternReviewLabel: "رؤية النمط",
    stillHereLabel: "ما زلت هنا — هذه تستغرق وقتًا أطول قليلاً.",
    lastCommitmentLabel: "آخر مرة: {action}.",
    lastCommitmentLandedLabel: "آخر مرة: {action} — وقد فعلتها.",
    startFreshLabel: "ابدأ من جديد",
    winHeadline: "لقد فعلتها.",
    weeklyRecapHeadline: "هذا الأسبوع.",
    checkInPromptText:
      "متى يكون الوقت المناسب لك عادةً؟ سأتواصل معك بدفء في ذلك الوقت تقريبًا — ليست قاعدة صارمة أبدًا، فقط أقل عشوائية من تخمين شخص غريب.",
    closeLabel: "إغلاق",
    continueLabel: "متابعة",
    treeTabLabel: "شجرتك",
    familyTabLabel: "عائلتك",
    treeEntryLabel: "شجرتك",
    chooseTimeLabel: "اختر وقتًا",
    chooseLanguageAriaLabel: "اختر اللغة",
    continueAriaLabel: "متابعة",
    checkInSettingsAriaLabel: "إعدادات المتابعة",
    sendAriaLabel: "إرسال",
    elementLabels: { fire: "نار", earth: "أرض", air: "هواء", water: "ماء" },
    avatarHeadlineTemplate: "{element} — {pct}% الليلة.",
    privacyLong1: "يتم تخزين محادثاتك بأمان، مرتبطة بمعرف خاص ومجهول يُنشأ على هذا الجهاز — وليس اسمك أو حسابًا عامًا أبدًا. هذا ما يتيح للتطبيق تذكرك بين المحادثات وملاحظة أنماط حقيقية بمرور الوقت، بدلاً من البدء من الصفر في كل مرة تفتحه فيها.",
    privacyLong2: "لا تُباع بياناتك أبدًا، ولا تُشارك أبدًا مع المعلنين أو أطراف ثالثة أخرى، ولا تُستخدم أبدًا لتدريب نماذج الذكاء الاصطناعي — سواء الخاصة بـ Just You أو بأي جهة أخرى. كل شيء مشفر أثناء النقل وفي حالة التخزين. لا تُقرأ المحادثات أو تُراجع أو تُشارك مع أي شخص أبدًا، بما في ذلك نحن — فهي موجودة فقط حتى يتمكن التطبيق من الرد عليك بسياق حقيقي.",
  },
  hi: {
    brand: "Just You",
    questions: [
      "तुम अब क्या दिखावा करना बंद करने को तैयार हो?",
      "दिखावा करना सीखने से पहले तुम कौन थे?",
      "तुम किस चीज़ का दिखावा कर रहे हो कि नहीं चाहते?",
      "अगर कोई तुम्हें आंक नहीं रहा होता तो तुम क्या कहते?",
      "किस चीज़ को साबित करते-करते तुम सबसे ज़्यादा थक चुके हो?",
      "तुम सच में कैसे हो?",
      "आज का दिन कैसा रहा?",
      "तुम्हारे मन में क्या है?",
      "अभी तुम्हारा ध्यान कहाँ है?",
      "हाल ही में तुम्हारे अंदर क्या जगह घेरे हुए है?",
      "आज तुम क्या ढो रहे हो?",
      "सच में, तुम्हारा हफ्ता कैसा रहा?",
      "अभी तुम्हारे लिए क्या सच है?",
      "हाल ही में क्या चीज़ तुम्हारे साथ टिकी हुई है?",
      "अभी तुम्हें क्या चाहिए?",
      "आज तुम पर क्या बोझ है?",
      "यह दिन किस तरह का दिन बनता जा रहा है?",
      "अभी तुम्हारी ऊर्जा कैसी है?",
      "आज के बारे में किसी दोस्त को तुम सबसे पहले क्या बताओगे?",
      "हाल ही में तुम्हारे दिमाग में क्या शोर मचा रहा है?",
      "अभी तुम्हारा शरीर कैसा महसूस कर रहा है?",
      "आज की कौन सी बात तुम्हारे साथ रह गई?",
      "तुम चाहते हो कि अभी कोई तुमसे क्या पूछे?",
      "'तुम कैसे हो' का ईमानदार जवाब क्या है?",
      "चुपचाप तुम्हें क्या परेशान कर रहा है?",
    ],
    moodCaption: "और अभी तुम्हें कैसा महसूस हो रहा है?",
    moods: [
      "शांत", "चिंतित", "क्रोधित", "सुन्न", "थका हुआ", "आशान्वित", "अटका हुआ",
      "अभिभूत",
      "बेचैन",
      "संतुष्ट",
      "अकेला",
      "निराश",
      "जिज्ञासु",
      "भारी",
      "थका हुआ",
      "आभारी",
      "घबराया हुआ",
    ],
    placeholderStart: "जवाब दो, या कुछ भी कहो।",
    placeholderContinue: "जो सच है वह कहो।",
    settingsText: "एक ईमेल छोड़ें — अगर कोई प्रतिबद्धता देय हो, तो Just You से आपको खुद वापस आने से पहले सुनने को मिलेगा।",
    saveLabel: "सेव करें",
    savedLabel: "हो गया।",
    emailPlaceholder: "you@example.com",
    youLabel: "तुम",
    returnLabel: "just you",
    depthQuestion: "आज तुम कितना गहराई में जाना चाहते हो?",
    depthOptions: ["बस देख रहा हूँ", "थोड़ा सा", "मेरे मन में कुछ है"],
    thresholdLine:
      "तुम ठीक-ठीक जानते हो कि तुम क्या नहीं हो। बस तुमने कभी नहीं पूछा कि बाकी कौन बचा है। यहाँ तुम उससे मिलते हो।",
    patternReviewLabel: "पैटर्न देखें",
    stillHereLabel: "अभी भी यहाँ हूँ — इसमें थोड़ा ज़्यादा समय लग रहा है।",
    lastCommitmentLabel: "पिछली बार: {action}।",
    lastCommitmentLandedLabel: "पिछली बार: {action} — और तुमने कर दिखाया।",
    startFreshLabel: "नई शुरुआत करें",
    winHeadline: "तुमने कर दिखाया।",
    weeklyRecapHeadline: "इस हफ्ते।",
    checkInPromptText:
      "आमतौर पर तुम्हारे लिए कौन सा समय अच्छा रहता है? मैं उसी समय के आसपास प्यार से जांच करूँगा — कभी भी सख्त नियम नहीं, बस किसी अजनबी के अंदाज़े से कम अनियमित।",
    closeLabel: "बंद करें",
    continueLabel: "जारी रखें",
    treeTabLabel: "तुम्हारा वृक्ष",
    familyTabLabel: "तुम्हारा परिवार",
    treeEntryLabel: "तुम्हारा वृक्ष",
    chooseTimeLabel: "एक समय चुनें",
    chooseLanguageAriaLabel: "भाषा चुनें",
    continueAriaLabel: "जारी रखें",
    checkInSettingsAriaLabel: "चेक-इन सेटिंग्स",
    sendAriaLabel: "भेजें",
    elementLabels: { fire: "अग्नि", earth: "पृथ्वी", air: "वायु", water: "जल" },
    avatarHeadlineTemplate: "{element} — आज रात {pct}%.",
    privacyLong1: "तुम्हारी बातचीत सुरक्षित रूप से संग्रहीत की जाती है, इस डिवाइस पर बनाई गई एक निजी, गुमनाम ID से जुड़ी हुई — कभी भी तुम्हारे नाम या किसी सार्वजनिक अकाउंट से नहीं। यही वह चीज़ है जो ऐप को बातचीत के बीच तुम्हें याद रखने और समय के साथ असली पैटर्न पहचानने देती है, बजाय हर बार खोलने पर शुरुआत से शुरू करने के।",
    privacyLong2: "तुम्हारा डेटा कभी नहीं बेचा जाता, कभी भी विज्ञापनदाताओं या अन्य तीसरे पक्षों के साथ साझा नहीं किया जाता, और कभी भी AI मॉडल को प्रशिक्षित करने के लिए इस्तेमाल नहीं किया जाता — न तो Just You के लिए, न ही किसी और के लिए। सब कुछ ट्रांज़िट और स्टोरेज दोनों में एन्क्रिप्टेड है। बातचीत को कभी भी किसी के द्वारा, यहां तक कि हमारे द्वारा भी, पढ़ा, समीक्षा या साझा नहीं किया जाता — ये केवल इसलिए मौजूद हैं ताकि ऐप तुम्हें असली संदर्भ के साथ जवाब दे सके।",
  },
  zh: {
    brand: "Just You",
    questions: [
      "你准备好不再伪装什么了？",
      "在你学会伪装之前，你是什么样子的？",
      "你假装不想要的是什么？",
      "如果没有人在评判你，你会说什么？",
      "你最厌倦证明的是什么？",
      "你真的还好吗？",
      "今天过得怎么样？",
      "你在想什么？",
      "你现在的思绪在哪里？",
      "最近有什么一直占据着你？",
      "你今天在承受着什么？",
      "你这一周过得到底怎么样？",
      "对你来说现在什么是真实的？",
      "最近有什么一直萦绕在你心里？",
      "你现在需要什么？",
      "今天有什么让你感到沉重？",
      "这一天正在变成什么样的一天？",
      "你现在的精力状态怎么样？",
      "关于今天，你会先告诉朋友什么？",
      "最近你脑子里有什么一直很吵？",
      "你的身体现在感觉怎么样？",
      "今天有什么事一直留在你心里？",
      "你希望现在有人问你什么？",
      "对'你好吗'这个问题，诚实的答案是什么？",
      "有什么一直在悄悄困扰着你？",
    ],
    moodCaption: "那你现在感觉怎么样？",
    moods: [
      "平静", "焦虑", "愤怒", "麻木", "疲惫", "有希望", "卡住了",
      "不知所措",
      "烦躁不安",
      "满足",
      "孤独",
      "沮丧",
      "好奇",
      "沉重",
      "精疲力尽",
      "感激",
      "紧张",
    ],
    placeholderStart: "回答，或者说点什么。",
    placeholderContinue: "说出真实的想法。",
    settingsText: "留下邮箱——如果有承诺到期，Just You 会在你需要自己回来之前联系你。",
    saveLabel: "保存",
    savedLabel: "已完成。",
    emailPlaceholder: "you@example.com",
    youLabel: "你",
    returnLabel: "just you",
    depthQuestion: "今天你想深入到什么程度？",
    depthOptions: ["只是看看", "一点点", "我心里有件事"],
    thresholdLine: "你清楚地知道自己不是谁。只是你从未问过，剩下的是谁。在这里，你会遇见他。",
    patternReviewLabel: "查看模式",
    stillHereLabel: "还在——这次要多花一点时间。",
    lastCommitmentLabel: "上次：{action}。",
    lastCommitmentLandedLabel: "上次：{action}——你做到了。",
    startFreshLabel: "重新开始",
    winHeadline: "你做到了。",
    weeklyRecapHeadline: "这一周。",
    checkInPromptText:
      "通常什么时间对你来说比较合适？我会在那个时候温暖地问候你——这从来不是硬性规定，只是比陌生人的猜测更靠谱一点。",
    closeLabel: "关闭",
    continueLabel: "继续",
    treeTabLabel: "你的树",
    familyTabLabel: "你的家庭",
    treeEntryLabel: "你的树",
    chooseTimeLabel: "选择一个时间",
    chooseLanguageAriaLabel: "选择语言",
    continueAriaLabel: "继续",
    checkInSettingsAriaLabel: "签到设置",
    sendAriaLabel: "发送",
    elementLabels: { fire: "火", earth: "土", air: "风", water: "水" },
    avatarHeadlineTemplate: "{element} — 今晚 {pct}%。",
    privacyLong1: "你的对话会被安全存储，并与在此设备上生成的一个私密、匿名ID相关联——绝不会关联你的姓名或公开账户。这也是应用能在不同对话之间记住你、并随着时间发现真实模式，而不是每次打开都从零开始的原因。",
    privacyLong2: "你的数据绝不会被出售，绝不会与广告商或其他第三方共享，也绝不会用于训练任何AI模型——无论是Just You的还是其他任何人的。所有数据在传输和存储过程中均已加密。对话内容绝不会被任何人阅读、审查或分享，包括我们自己——它们的存在只是为了让应用能够基于真实的语境回应你。",
  },
  ja: {
    brand: "Just You",
    questions: [
      "もう演じるのをやめてもいいことは何ですか？",
      "演じることを覚える前、あなたは誰だった？",
      "欲しくないふりをしているものは何？",
      "誰にも評価されないとしたら、何を言う？",
      "証明することに一番疲れているのは何？",
      "本当はどう？",
      "今日はどんな一日だった？",
      "何を考えている？",
      "今、頭の中はどこにある？",
      "最近、心の中で場所を占めているものは何？",
      "今日、何を抱えている？",
      "実際のところ、今週はどうだった？",
      "今のあなたにとって本当のことは何？",
      "最近、ずっと心に残っていることは何？",
      "今、何が必要？",
      "今日、何が重くのしかかっている？",
      "今日はどんな一日になりつつある？",
      "今のエネルギーはどんな感じ？",
      "今日のことで友達に最初に話すとしたら何？",
      "最近、頭の中でうるさかったことは何？",
      "今、体はどんな感じ？",
      "今日のことで、心に残っていることは何？",
      "今、誰かに何を聞いてほしい？",
      "「元気？」への正直な答えは何？",
      "静かに気になっていることは何？",
    ],
    moodCaption: "それで、今はどんな気分？",
    moods: [
      "穏やか", "不安", "怒り", "無感覚", "疲れた", "希望がある", "行き詰まっている",
      "圧倒されている",
      "落ち着かない",
      "満たされている",
      "孤独",
      "苛立っている",
      "興味津々",
      "重い",
      "疲れ果てた",
      "感謝している",
      "緊張している",
    ],
    placeholderStart: "答えるか、何か言ってみて。",
    placeholderContinue: "本当のことを言って。",
    settingsText: "メールを残しておくと、約束の期限が来たとき、自分から戻る前にJust You から連絡します。",
    saveLabel: "保存",
    savedLabel: "完了。",
    emailPlaceholder: "you@example.com",
    youLabel: "あなた",
    returnLabel: "just you",
    depthQuestion: "今日はどのくらい深く話したいですか？",
    depthOptions: ["ただ見ているだけ", "少しだけ", "気になることがある"],
    thresholdLine:
      "自分が何者でないかは、はっきりわかっている。でも、残ったものが誰なのかは、一度も聞いたことがない。ここで、それに出会う。",
    patternReviewLabel: "パターンを見る",
    stillHereLabel: "まだここにいます — 少し時間がかかっています。",
    lastCommitmentLabel: "前回：{action}。",
    lastCommitmentLandedLabel: "前回：{action} — そして、やり遂げました。",
    startFreshLabel: "最初からやり直す",
    winHeadline: "やり遂げた。",
    weeklyRecapHeadline: "今週。",
    checkInPromptText:
      "普段、都合がいい時間帯はいつですか？その時間帯に温かく様子を伺います — 厳密なルールではなく、見知らぬ人の当て推量よりはましというだけです。",
    closeLabel: "閉じる",
    continueLabel: "続ける",
    treeTabLabel: "あなたの木",
    familyTabLabel: "あなたの家族",
    treeEntryLabel: "あなたの木",
    chooseTimeLabel: "時間を選んでください",
    chooseLanguageAriaLabel: "言語を選択",
    continueAriaLabel: "続ける",
    checkInSettingsAriaLabel: "チェックイン設定",
    sendAriaLabel: "送信",
    elementLabels: { fire: "火", earth: "地", air: "風", water: "水" },
    avatarHeadlineTemplate: "{element} — 今夜 {pct}%。",
    privacyLong1: "あなたの会話は安全に保存され、このデバイス上で生成される非公開の匿名IDに紐づけられます——あなたの名前や公開アカウントに紐づくことは決してありません。だからこそ、アプリは会話をまたいであなたを覚えていられ、開くたびにゼロから始めるのではなく、時間をかけて本当のパターンに気づくことができます。",
    privacyLong2: "あなたのデータが売られることは決してなく、広告主や他の第三者と共有されることも決してなく、Just Youであれ他の誰であれ、AIモデルの学習に使われることも決してありません。すべて通信中も保存中も暗号化されています。会話が誰かに——私たちも含めて——読まれたり、確認されたり、共有されたりすることは決してありません。会話が存在するのは、アプリが本当の文脈をもってあなたに応答するためだけです。",
  },
  ru: {
    brand: "Just You",
    questions: [
      "Что ты готов перестать изображать?",
      "Кем ты был до того, как научился изображать?",
      "Чего ты притворяешься, что не хочешь?",
      "Что бы ты сказал, если бы тебя никто не оценивал?",
      "Что тебе больше всего надоело доказывать?",
      "Как ты на самом деле?",
      "Каким был сегодняшний день?",
      "О чём ты думаешь?",
      "Где сейчас твои мысли?",
      "Что в последнее время занимает в тебе много места?",
      "Что ты несёшь на себе сегодня?",
      "Какой на самом деле была твоя неделя?",
      "Что сейчас правда для тебя?",
      "Что в последнее время осталось с тобой?",
      "Что тебе нужно прямо сейчас?",
      "Что тебя сегодня тяготит?",
      "Во что превращается этот день?",
      "Какая у тебя сейчас энергия?",
      "Что было бы первым, что ты рассказал бы другу о сегодняшнем дне?",
      "Что в последнее время было громким в твоей голове?",
      "Как сейчас чувствует себя твоё тело?",
      "Что из сегодняшнего дня осталось с тобой?",
      "О чём бы ты хотел, чтобы тебя сейчас спросили?",
      "Какой честный ответ на 'как дела'?",
      "Что тебя тихо беспокоит?",
    ],
    moodCaption: "А как ты себя чувствуешь прямо сейчас?",
    moods: [
      "Спокойный", "Тревожный", "Злой", "Онемевший", "Уставший", "С надеждой", "Застрявший",
      "Подавленный",
      "Неспокойный",
      "Довольный",
      "Одинокий",
      "Раздражённый",
      "Любопытный",
      "Отяжелевший",
      "Истощённый",
      "Благодарный",
      "Взволнованный",
    ],
    placeholderStart: "Ответь или скажи что угодно.",
    placeholderContinue: "Скажи то, что правда.",
    settingsText: "Оставь email — если срок обязательства подойдёт, Just You напишет тебе раньше, чем придётся возвращаться самому.",
    saveLabel: "Сохранить",
    savedLabel: "Готово.",
    emailPlaceholder: "you@example.com",
    youLabel: "ты",
    returnLabel: "just you",
    depthQuestion: "Насколько глубоко ты хочешь зайти сегодня?",
    depthOptions: ["Просто смотрю", "Немного", "У меня кое-что на уме"],
    thresholdLine:
      "Ты точно знаешь, кем не являешься. Просто никогда не спрашивал, кто остался. Здесь ты с ним встретишься.",
    patternReviewLabel: "Посмотреть узор",
    stillHereLabel: "Я всё ещё здесь — это занимает немного больше времени.",
    lastCommitmentLabel: "В прошлый раз: {action}.",
    lastCommitmentLandedLabel: "В прошлый раз: {action} — и ты это сделал.",
    startFreshLabel: "начать заново",
    winHeadline: "Ты сделал это.",
    weeklyRecapHeadline: "На этой неделе.",
    checkInPromptText:
      "Когда тебе обычно удобно? Я тепло напишу примерно в это время — никогда не жёсткое правило, просто не так наугад, как у постороннего.",
    closeLabel: "закрыть",
    continueLabel: "продолжить",
    treeTabLabel: "Твоё дерево",
    familyTabLabel: "Твоя семья",
    treeEntryLabel: "Твоё дерево",
    chooseTimeLabel: "Выбери время",
    chooseLanguageAriaLabel: "Выбрать язык",
    continueAriaLabel: "Продолжить",
    checkInSettingsAriaLabel: "Настройки напоминаний",
    sendAriaLabel: "Отправить",
    elementLabels: { fire: "Огонь", earth: "Земля", air: "Воздух", water: "Вода" },
    avatarHeadlineTemplate: "{element} — {pct}% сегодня вечером.",
    privacyLong1: "Твои разговоры хранятся в безопасности, привязанные к приватному, анонимному ID, созданному на этом устройстве — никогда не к твоему имени или публичному аккаунту. Именно это позволяет приложению помнить тебя между разговорами и замечать настоящие закономерности со временем, а не начинать с нуля каждый раз, когда ты его открываешь.",
    privacyLong2: "Твои данные никогда не продаются, никогда не передаются рекламодателям или другим третьим лицам и никогда не используются для обучения ИИ-моделей — ни Just You, ни чьих-либо ещё. Всё зашифровано как при передаче, так и при хранении. Разговоры никто и никогда не читает, не просматривает и не передаёт, включая нас самих — они существуют только для того, чтобы приложение могло отвечать тебе с реальным контекстом.",
  },
  sq: {
    brand: "Just You",
    questions: [
      "Çfarë je gati të mos shtiresh më?",
      "Kush ishe para se të mësoje të shtiresh?",
      "Çfarë shtiresh se nuk do?",
      "Çfarë do të thoshe nëse askush nuk po të gjykonte?",
      "Nga çfarë je më i lodhur duke e provuar?",
      "Si je, me të vërtetë?",
      "Si ishte dita jote sot?",
      "Çfarë ke në mendje?",
      "Ku e ke mendjen tani?",
      "Çfarë ka zënë vend brenda teje kohët e fundit?",
      "Çfarë po mban sot?",
      "Si ishte vërtet java jote?",
      "Çfarë është e vërtetë për ty tani?",
      "Çfarë ka qëndruar me ty kohët e fundit?",
      "Çfarë të nevojitet tani?",
      "Çfarë po të rëndon sot?",
      "Në çfarë lloj dite po shndërrohet kjo?",
      "Si është energjia jote tani?",
      "Cila do të ishte gjëja e parë që do t'i thoshe një shoku për sot?",
      "Çfarë ka qenë e zhurmshme në mendjen tënde kohët e fundit?",
      "Si ndihet trupi yt tani?",
      "Çfarë nga sot ka mbetur me ty?",
      "Çfarë do të doje të të pyeste dikush tani?",
      "Cila është përgjigja e sinqertë ndaj 'si je'?",
      "Çfarë po të shqetëson në heshtje?",
    ],
    moodCaption: "Dhe si ndihesh tani?",
    moods: [
      "I qetë", "I shqetësuar", "I zemëruar", "I shurdhuar", "I lodhur", "Shpresëplotë", "I bllokuar",
      "I mbingarkuar",
      "I shqetësuar",
      "I kënaqur",
      "Vetmitar",
      "I frustruar",
      "Kurioz",
      "I rënduar",
      "I shterur",
      "Mirënjohës",
      "Nervoz",
    ],
    placeholderStart: "Përgjigju, ose thuaj çfarëdo.",
    placeholderContinue: "Thuaj çfarë është e vërtetë.",
    settingsText: "Lër një email — nëse një angazhim vjen në afat, Just You do të të kontaktojë para se të duhet të kthehesh vetë.",
    saveLabel: "Ruaj",
    savedLabel: "U bë.",
    emailPlaceholder: "ti@shembull.com",
    youLabel: "ti",
    returnLabel: "just you",
    depthQuestion: "Sa thellë dëshiron të shkosh sot?",
    depthOptions: ["Vetëm po shikoj", "Pak", "Kam diçka në mendje"],
    thresholdLine: "E njeh mirë atë që s'je. Po atë që je — s'e ke takuar kurrë. Këtu e takon.",
    patternReviewLabel: "Shiko modelin",
    stillHereLabel: "Ende këtu — kjo po merr pak më shumë kohë.",
    lastCommitmentLabel: "Herën e fundit: {action}.",
    lastCommitmentLandedLabel: "Herën e fundit: {action} — dhe e bëre.",
    startFreshLabel: "fillo nga e para",
    winHeadline: "E bëre.",
    weeklyRecapHeadline: "Këtë javë.",
    checkInPromptText:
      "Cila është zakonisht një kohë e mirë për ty? Do të kontaktoj me ngrohtësi rreth asaj kohe — kurrë një rregull i ngurtë, thjesht më pak i rastësishëm se hamendja e një të huaji.",
    closeLabel: "mbyll",
    continueLabel: "vazhdo",
    treeTabLabel: "Pema jote",
    familyTabLabel: "Familja jote",
    treeEntryLabel: "Pema jote",
    chooseTimeLabel: "Zgjidh një orë",
    chooseLanguageAriaLabel: "Zgjidh gjuhën",
    continueAriaLabel: "Vazhdo",
    checkInSettingsAriaLabel: "Cilësimet e kontaktit",
    sendAriaLabel: "Dërgo",
    elementLabels: { fire: "Zjarri", earth: "Toka", air: "Ajri", water: "Uji" },
    avatarHeadlineTemplate: "{element} — {pct}% sonte.",
    privacyLong1: "Bisedat e tua ruhen në mënyrë të sigurt, të lidhura me një ID private dhe anonime të krijuar në këtë pajisje — kurrë me emrin tënd apo një llogari publike. Kjo është ajo që i mundëson aplikacionit të të mbajë mend nga një bisedë në tjetrën dhe të vërejë modele të vërteta me kalimin e kohës, në vend që të fillojë nga e para çdo herë që e hap.",
    privacyLong2: "Të dhënat e tua nuk shiten kurrë, nuk ndahen kurrë me reklamues apo palë të treta të tjera, dhe nuk përdoren kurrë për të trajnuar modele IA — as të Just You, as të askujt tjetër. Gjithçka është e koduar si gjatë transmetimit ashtu edhe kur ruhet. Bisedat nuk lexohen, shqyrtohen apo ndahen kurrë me askënd, përfshirë ne — ato ekzistojnë vetëm që aplikacioni të mund të të përgjigjet me kontekst të vërtetë.",
  },
  el: {
    brand: "Just You",
    questions: [
      "Τι είσαι έτοιμος να σταματήσεις να προσποιείσαι;",
      "Ποιος ήσουν πριν μάθεις να προσποιείσαι;",
      "Τι προσποιείσαι ότι δεν θέλεις;",
      "Τι θα έλεγες αν κανείς δεν σε έκρινε;",
      "Τι είσαι πιο κουρασμένος να αποδεικνύεις;",
      "Πώς είσαι, πραγματικά;",
      "Πώς ήταν η μέρα σου σήμερα;",
      "Τι έχεις στο μυαλό σου;",
      "Πού είναι το μυαλό σου αυτή τη στιγμή;",
      "Τι καταλαμβάνει χώρο μέσα σου τελευταία;",
      "Τι κουβαλάς σήμερα;",
      "Πώς ήταν πραγματικά η εβδομάδα σου;",
      "Τι είναι αλήθεια για σένα αυτή τη στιγμή;",
      "Τι έχει μείνει μαζί σου τελευταία;",
      "Τι χρειάζεσαι αυτή τη στιγμή;",
      "Τι σε βαραίνει σήμερα;",
      "Σε τι είδους μέρα εξελίσσεται αυτή;",
      "Πώς είναι η ενέργειά σου αυτή τη στιγμή;",
      "Ποιο θα ήταν το πρώτο πράγμα που θα έλεγες σε έναν φίλο για σήμερα;",
      "Τι ήταν θορυβώδες στο μυαλό σου τελευταία;",
      "Πώς νιώθει το σώμα σου αυτή τη στιγμή;",
      "Τι από σήμερα έχει μείνει μαζί σου;",
      "Τι θα ήθελες να σε ρωτήσει κάποιος αυτή τη στιγμή;",
      "Ποια είναι η ειλικρινής απάντηση στο 'πώς είσαι';",
      "Τι σε ενοχλεί σιωπηλά;",
    ],
    moodCaption: "Και πώς νιώθεις τώρα;",
    moods: [
      "Ήρεμος", "Ανήσυχος", "Θυμωμένος", "Μουδιασμένος", "Κουρασμένος", "Με ελπίδα", "Κολλημένος",
      "Κατακλυσμένος",
      "Ανήσυχος",
      "Ικανοποιημένος",
      "Μοναχικός",
      "Απογοητευμένος",
      "Περίεργος",
      "Βαρύς",
      "Εξαντλημένος",
      "Ευγνώμων",
      "Νευρικός",
    ],
    placeholderStart: "Απάντησε, ή πες οτιδήποτε.",
    placeholderContinue: "Πες αυτό που είναι αλήθεια.",
    settingsText: "Άφησε ένα email — αν μια δέσμευση λήξει, θα ακούσεις από το Just You πριν χρειαστεί να επιστρέψεις μόνος σου.",
    saveLabel: "Αποθήκευση",
    savedLabel: "Έγινε.",
    emailPlaceholder: "esy@example.com",
    youLabel: "εσύ",
    returnLabel: "just you",
    depthQuestion: "Πόσο βαθιά θέλεις να πας σήμερα;",
    depthOptions: ["Απλώς κοιτάζω", "Λίγο", "Έχω κάτι στο μυαλό μου"],
    thresholdLine:
      "Ξέρεις καλά ποιος δεν είσαι. Ποιος έμεινε, όμως, δεν τον έχεις ρωτήσει ποτέ. Εδώ τον γνωρίζεις.",
    patternReviewLabel: "Δες το μοτίβο",
    stillHereLabel: "Ακόμα εδώ — αυτό παίρνει λίγο παραπάνω χρόνο.",
    lastCommitmentLabel: "Την τελευταία φορά: {action}.",
    lastCommitmentLandedLabel: "Την τελευταία φορά: {action} — και το έκανες.",
    startFreshLabel: "ξεκίνα από την αρχή",
    winHeadline: "Το έκανες.",
    weeklyRecapHeadline: "Αυτή την εβδομάδα.",
    checkInPromptText:
      "Ποια ώρα σου βολεύει συνήθως; Θα επικοινωνήσω με ζεστασιά γύρω σε αυτή την ώρα — ποτέ αυστηρός κανόνας, απλώς λιγότερο τυχαίο από τη μαντεψιά ενός αγνώστου.",
    closeLabel: "κλείσιμο",
    continueLabel: "συνέχεια",
    treeTabLabel: "Το δέντρο σου",
    familyTabLabel: "Η οικογένειά σου",
    treeEntryLabel: "Το δέντρο σου",
    chooseTimeLabel: "Επίλεξε μια ώρα",
    chooseLanguageAriaLabel: "Επιλογή γλώσσας",
    continueAriaLabel: "Συνέχεια",
    checkInSettingsAriaLabel: "Ρυθμίσεις επικοινωνίας",
    sendAriaLabel: "Αποστολή",
    elementLabels: { fire: "Φωτιά", earth: "Γη", air: "Αέρας", water: "Νερό" },
    avatarHeadlineTemplate: "{element} — {pct}% απόψε.",
    privacyLong1: "Οι συνομιλίες σου αποθηκεύονται με ασφάλεια, συνδεδεμένες με ένα ιδιωτικό, ανώνυμο αναγνωριστικό που δημιουργείται σε αυτή τη συσκευή — ποτέ με το όνομά σου ή έναν δημόσιο λογαριασμό. Αυτό είναι που επιτρέπει στην εφαρμογή να σε θυμάται από τη μία συνομιλία στην άλλη και να παρατηρεί πραγματικά μοτίβα με τον καιρό, αντί να ξεκινά από την αρχή κάθε φορά που την ανοίγεις.",
    privacyLong2: "Τα δεδομένα σου δεν πωλούνται ποτέ, δεν κοινοποιούνται ποτέ σε διαφημιστές ή άλλα τρίτα μέρη, και δεν χρησιμοποιούνται ποτέ για την εκπαίδευση μοντέλων ΤΝ — ούτε του Just You ούτε κανενός άλλου. Όλα είναι κρυπτογραφημένα τόσο κατά τη μεταφορά όσο και κατά την αποθήκευση. Οι συνομιλίες δεν διαβάζονται, δεν εξετάζονται ούτε κοινοποιούνται ποτέ σε κανέναν, ούτε καν σε εμάς — υπάρχουν μόνο για να μπορεί η εφαρμογή να σου απαντά με πραγματικό πλαίσιο.",
  },
  hy: {
    brand: "Just You",
    questions: [
      "Ի՞նչ ես պատրաստ դադարել ձևացնել։",
      "Ո՞վ էիր դու, նախքան ձևացնել սովորելը։",
      "Ի՞նչ ես ձևացնում, թե չես ուզում։",
      "Ի՞նչ կասեիր, եթե ոչ ոք քեզ չգնահատեր։",
      "Ի՞նչն ես ամենից շատ հոգնել ապացուցելուց։",
      "Ինչպե՞ս ես իրականում։",
      "Ինչպիսի՞ն էր այսօրվա օրդ։",
      "Ի՞նչի մասին ես մտածում։",
      "Որտե՞ղ է մտքերդ հիմա։",
      "Ի՞նչն է վերջերս տեղ զբաղեցրել քո մեջ։",
      "Ի՞նչ ես կրում այսօր։",
      "Ինչպե՞ս անցավ իրականում քո շաբաթը։",
      "Ի՞նչն է ճշմարիտ քեզ համար հիմա։",
      "Ի՞նչն է վերջերս մնացել քեզ հետ։",
      "Ի՞նչի կարիք ունես հիմա։",
      "Ի՞նչն է այսօր ծանրացնում քեզ։",
      "Ի՞նչպիսի օր է դառնում այս օրը։",
      "Ինչպիսի՞ն է էներգիադ հիմա։",
      "Ո՞րն է առաջին բանը, որ կասեիր ընկերոջդ այսօրվա մասին։",
      "Ի՞նչն է վերջերս աղմկոտ եղել մտքումդ։",
      "Ինչպե՞ս է զգում մարմինդ հիմա։",
      "Այսօրվա ո՞ր բանը մնաց քեզ հետ։",
      "Ի՞նչ կուզենայիր, որ հիմա ինչ-որ մեկը հարցներ քեզ։",
      "Ո՞րն է անկեղծ պատասխանը 'ինչպե՞ս ես' հարցին։",
      "Ի՞նչն է լուռ անհանգստացնում քեզ։",
    ],
    moodCaption: "Իսկ ինչպե՞ս ես զգում հիմա։",
    moods: [
      "Հանգիստ", "Անհանգիստ", "Զայրացած", "Թմրած", "Հոգնած", "Հուսադրված", "Խրված",
      "Ճնշված",
      "Անհանգիստ",
      "Գոհ",
      "Միայնակ",
      "Հիասթափված",
      "Հետաքրքրված",
      "Ծանրացած",
      "Հյուծված",
      "Երախտապարտ",
      "Նյարդային",
    ],
    placeholderStart: "Պատասխանիր, կամ ասա ինչ-որ բան։",
    placeholderContinue: "Ասա, ինչն է ճշմարիտ։",
    settingsText: "Թող էլ. փոստ — եթե պարտավորության ժամկետը լրանա, Just You կգրի քեզ նախքան ինքդ վերադառնալը։",
    saveLabel: "Պահպանել",
    savedLabel: "Պատրաստ է։",
    emailPlaceholder: "you@example.com",
    youLabel: "դու",
    returnLabel: "just you",
    depthQuestion: "Որքա՞ն խորը ես ուզում գնալ այսօր։",
    depthOptions: ["Պարզապես նայում եմ", "Մի քիչ", "Մտքումս մի բան կա"],
    thresholdLine:
      "Դու հստակ գիտես, թե ով չես։ Պարզապես երբեք չես հարցրել, թե ով է մնացել։ Այստեղ դու հանդիպում ես նրան։",
    patternReviewLabel: "Տեսնել օրինաչափությունը",
    stillHereLabel: "Դեռ այստեղ եմ — սա մի փոքր ավելի երկար է տևում։",
    lastCommitmentLabel: "Վերջին անգամ․ {action}։",
    lastCommitmentLandedLabel: "Վերջին անգամ․ {action} — և դու արեցիր դա։",
    startFreshLabel: "սկսել նորից",
    winHeadline: "Դու արեցիր դա։",
    weeklyRecapHeadline: "Այս շաբաթ։",
    checkInPromptText:
      "Սովորաբար ե՞րբ է քեզ հարմար։ Ես կդիմեմ քեզ ջերմությամբ մոտավորապես այդ ժամին — երբեք խիստ կանոն, պարզապես ավելի քիչ պատահական, քան անծանոթի կռահումը։",
    closeLabel: "փակել",
    continueLabel: "շարունակել",
    treeTabLabel: "Քո ծառը",
    familyTabLabel: "Քո ընտանիքը",
    treeEntryLabel: "Քո ծառը",
    chooseTimeLabel: "Ընտրիր ժամ",
    chooseLanguageAriaLabel: "Ընտրել լեզուն",
    continueAriaLabel: "Շարունակել",
    checkInSettingsAriaLabel: "Ստուգման կարգավորումներ",
    sendAriaLabel: "Ուղարկել",
    elementLabels: { fire: "Կրակ", earth: "Հող", air: "Օդ", water: "Ջուր" },
    avatarHeadlineTemplate: "{element} — {pct}% այս գիշեր։",
    privacyLong1: "Քո զրույցները պահվում են անվտանգ կերպով, կապված այս սարքի վրա ստեղծված մասնավոր, անանուն ID-ի հետ — երբեք քո անվան կամ հանրային հաշվի հետ։ Հենց դա է թույլ տալիս հավելվածին հիշել քեզ զրույցների միջև և ժամանակի ընթացքում նկատել իրական օրինաչափություններ, փոխանակ ամեն անգամ այն բացելիս սկսելու զրոյից։",
    privacyLong2: "Քո տվյալները երբեք չեն վաճառվում, երբեք չեն կիսվում գովազդատուների կամ այլ երրորդ կողմերի հետ, և երբեք չեն օգտագործվում ԱԲ մոդելներ ուսուցանելու համար՝ ո՛չ Just You-ի, ո՛չ որևէ ուրիշի։ Ամեն ինչ գաղտնագրված է ինչպես փոխանցման, այնպես էլ պահպանման ընթացքում։ Զրույցները երբեք չեն կարդացվում, չեն վերանայվում կամ չեն կիսվում որևէ մեկի հետ, ներառյալ մեզ հետ․ դրանք գոյություն ունեն միայն այն պատճառով, որ հավելվածը կարողանա պատասխանել քեզ իրական համատեքստով։",
  },
  sr: {
    brand: "Just You",
    questions: [
      "Šta si spreman da prestaneš da glumiš?",
      "Ko si bio pre nego što si naučio da glumiš?",
      "Šta se praviš da ne želiš?",
      "Šta bi rekao kad te niko ne bi ocenjivao?",
      "Šta ti je najdosadnije da dokazuješ?",
      "Kako si, stvarno?",
      "Kakav je bio tvoj dan?",
      "Šta ti je na umu?",
      "Gde su ti misli upravo sada?",
      "Šta ti je zauzimalo prostor u poslednje vreme?",
      "Šta nosiš danas?",
      "Kako je zaista prošla tvoja nedelja?",
      "Šta je istina za tebe upravo sada?",
      "Šta je ostalo sa tobom u poslednje vreme?",
      "Šta ti je potrebno upravo sada?",
      "Šta te danas pritiska?",
      "U kakav dan se ovo pretvara?",
      "Kakva ti je energija upravo sada?",
      "Šta bi prvo rekao prijatelju o današnjem danu?",
      "Šta ti je bilo bučno u glavi u poslednje vreme?",
      "Kako se telo oseća upravo sada?",
      "Šta se iz današnjeg dana zadržalo uz tebe?",
      "Šta bi voleo da te neko pita upravo sada?",
      "Koji je iskren odgovor na 'kako si'?",
      "Šta te tiho muči?",
    ],
    moodCaption: "A kako se osećaš upravo sada?",
    moods: [
      "Miran", "Anksiozan", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen",
      "Preplavljen",
      "Nemiran",
      "Zadovoljan",
      "Usamljen",
      "Frustriran",
      "Radoznao",
      "Opterećen",
      "Iscrpljen",
      "Zahvalan",
      "Nervozan",
    ],
    placeholderStart: "Odgovori, ili reci bilo šta.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obaveza dospe, Just You će ti se javiti pre nego što moraš sam da se vratiš.",
    saveLabel: "Sačuvaj",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ti",
    returnLabel: "just you",
    depthQuestion: "Koliko duboko želiš da ideš danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    thresholdLine:
      "Tačno znaš ko nisi. Samo nikad nisi pitao ko je ostao. Ovde ćeš ga upoznati.",
    patternReviewLabel: "Vidi obrazac",
    stillHereLabel: "Još sam tu — ovo traje malo duže.",
    lastCommitmentLabel: "Prošli put: {action}.",
    lastCommitmentLandedLabel: "Prošli put: {action} — i uspeo si.",
    startFreshLabel: "počni ispočetka",
    winHeadline: "Uspeo si.",
    weeklyRecapHeadline: "Ove nedelje.",
    checkInPromptText:
      "Koje vreme ti obično odgovara? Javiću ti se toplo oko tog vremena — nikad strogo pravilo, samo manje nasumično od nagađanja stranca.",
    closeLabel: "zatvori",
    continueLabel: "nastavi",
    treeTabLabel: "Tvoje drvo",
    familyTabLabel: "Tvoja porodica",
    treeEntryLabel: "Tvoje drvo",
    chooseTimeLabel: "Izaberi vreme",
    chooseLanguageAriaLabel: "Izaberi jezik",
    continueAriaLabel: "Nastavi",
    checkInSettingsAriaLabel: "Podešavanja javljanja",
    sendAriaLabel: "Pošalji",
    elementLabels: { fire: "Vatra", earth: "Zemlja", air: "Vazduh", water: "Voda" },
    avatarHeadlineTemplate: "{element} — {pct}% večeras.",
    privacyLong1: "Tvoji razgovori se bezbedno čuvaju, povezani sa privatnim, anonimnim ID-jem generisanim na ovom uređaju — nikada sa tvojim imenom ili javnim nalogom. Upravo to omogućava aplikaciji da te pamti između razgovora i vremenom primeti stvarne obrasce, umesto da svaki put kad je otvoriš počinje ispočetka.",
    privacyLong2: "Tvoji podaci se nikada ne prodaju, nikada ne dele sa oglašivačima ili drugim trećim licima, i nikada se ne koriste za treniranje AI modela — ni Just You-ovih, ni bilo čijih drugih. Sve je šifrovano i tokom prenosa i tokom čuvanja. Razgovori se nikada ne čitaju, ne pregledaju niti dele sa bilo kim, uključujući nas — postoje samo da bi aplikacija mogla da ti odgovori sa stvarnim kontekstom.",
  },
  hr: {
    brand: "Just You",
    questions: [
      "Što si spreman prestati glumiti?",
      "Tko si bio prije nego što si naučio glumiti?",
      "Što se praviš da ne želiš?",
      "Što bi rekao kad te nitko ne bi ocjenjivao?",
      "Što ti je najdosadnije dokazivati?",
      "Kako si, stvarno?",
      "Kakav je bio tvoj dan?",
      "Što ti je na umu?",
      "Gdje su ti misli upravo sada?",
      "Što ti je zauzimalo prostor u posljednje vrijeme?",
      "Što nosiš danas?",
      "Kako je zaista prošao tvoj tjedan?",
      "Što je istina za tebe upravo sada?",
      "Što je ostalo s tobom u posljednje vrijeme?",
      "Što ti je potrebno upravo sada?",
      "Što te danas pritišće?",
      "U kakav se dan ovo pretvara?",
      "Kakva ti je energija upravo sada?",
      "Što bi prvo rekao prijatelju o današnjem danu?",
      "Što ti je bilo bučno u glavi u posljednje vrijeme?",
      "Kako se tijelo osjeća upravo sada?",
      "Što se iz današnjeg dana zadržalo uz tebe?",
      "Što bi volio da te netko pita upravo sada?",
      "Koji je iskren odgovor na 'kako si'?",
      "Što te tiho muči?",
    ],
    moodCaption: "A kako se osjećaš upravo sada?",
    moods: [
      "Miran", "Tjeskoban", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen",
      "Preplavljen",
      "Nemiran",
      "Zadovoljan",
      "Usamljen",
      "Frustriran",
      "Znatiželjan",
      "Opterećen",
      "Iscrpljen",
      "Zahvalan",
      "Nervozan",
    ],
    placeholderStart: "Odgovori, ili reci bilo što.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obveza dospije, Just You će ti se javiti prije nego što se moraš sam vratiti.",
    saveLabel: "Spremi",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primjer.com",
    youLabel: "ti",
    returnLabel: "just you",
    depthQuestion: "Koliko duboko želiš ići danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    thresholdLine:
      "Točno znaš tko nisi. Samo nikad nisi pitao tko je ostao. Ovdje ćeš ga upoznati.",
    patternReviewLabel: "Vidi obrazac",
    stillHereLabel: "Još sam tu — ovo traje malo dulje.",
    lastCommitmentLabel: "Prošli put: {action}.",
    lastCommitmentLandedLabel: "Prošli put: {action} — i uspio si.",
    startFreshLabel: "počni ispočetka",
    winHeadline: "Uspio si.",
    weeklyRecapHeadline: "Ovaj tjedan.",
    checkInPromptText:
      "Koje vrijeme ti obično odgovara? Javit ću ti se toplo otprilike u to vrijeme — nikad strogo pravilo, samo manje nasumično od nagađanja stranca.",
    closeLabel: "zatvori",
    continueLabel: "nastavi",
    treeTabLabel: "Tvoje stablo",
    familyTabLabel: "Tvoja obitelj",
    treeEntryLabel: "Tvoje stablo",
    chooseTimeLabel: "Odaberi vrijeme",
    chooseLanguageAriaLabel: "Odaberi jezik",
    continueAriaLabel: "Nastavi",
    checkInSettingsAriaLabel: "Postavke javljanja",
    sendAriaLabel: "Pošalji",
    elementLabels: { fire: "Vatra", earth: "Zemlja", air: "Zrak", water: "Voda" },
    avatarHeadlineTemplate: "{element} — {pct}% večeras.",
    privacyLong1: "Tvoji razgovori se sigurno čuvaju, povezani s privatnim, anonimnim ID-om generiranim na ovom uređaju — nikada s tvojim imenom ili javnim računom. Upravo to omogućuje aplikaciji da te pamti između razgovora i s vremenom primijeti stvarne obrasce, umjesto da svaki put kad je otvoriš počinje ispočetka.",
    privacyLong2: "Tvoji podaci nikada se ne prodaju, nikada se ne dijele s oglašivačima ili drugim trećim stranama, i nikada se ne koriste za treniranje AI modela — ni Just You-ovih, ni bilo čijih drugih. Sve je šifrirano i tijekom prijenosa i tijekom pohrane. Razgovori se nikada ne čitaju, ne pregledavaju niti dijele s bilo kim, uključujući nas — postoje samo kako bi aplikacija mogla odgovoriti tebi sa stvarnim kontekstom.",
  },
  bs: {
    brand: "Just You",
    questions: [
      "Šta si spreman prestati glumiti?",
      "Ko si bio prije nego što si naučio glumiti?",
      "Šta se praviš da ne želiš?",
      "Šta bi rekao kad te niko ne bi ocjenjivao?",
      "Šta ti je najdosadnije dokazivati?",
      "Kako si, stvarno?",
      "Kakav je bio tvoj dan?",
      "Šta ti je na umu?",
      "Gdje su ti misli upravo sada?",
      "Šta ti je zauzimalo prostor u posljednje vrijeme?",
      "Šta nosiš danas?",
      "Kako je zaista prošla tvoja sedmica?",
      "Šta je istina za tebe upravo sada?",
      "Šta je ostalo s tobom u posljednje vrijeme?",
      "Šta ti je potrebno upravo sada?",
      "Šta te danas pritišće?",
      "U kakav dan se ovo pretvara?",
      "Kakva ti je energija upravo sada?",
      "Šta bi prvo rekao prijatelju o današnjem danu?",
      "Šta ti je bilo bučno u glavi u posljednje vrijeme?",
      "Kako se tijelo osjeća upravo sada?",
      "Šta se iz današnjeg dana zadržalo uz tebe?",
      "Šta bi volio da te neko pita upravo sada?",
      "Koji je iskren odgovor na 'kako si'?",
      "Šta te tiho muči?",
    ],
    moodCaption: "A kako se osjećaš upravo sada?",
    moods: [
      "Miran", "Anksiozan", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen",
      "Preplavljen",
      "Nemiran",
      "Zadovoljan",
      "Usamljen",
      "Frustriran",
      "Znatiželjan",
      "Opterećen",
      "Iscrpljen",
      "Zahvalan",
      "Nervozan",
    ],
    placeholderStart: "Odgovori, ili reci bilo šta.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obaveza dospije, Just You će ti se javiti prije nego što moraš sam da se vratiš.",
    saveLabel: "Sačuvaj",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primjer.com",
    youLabel: "ti",
    returnLabel: "just you",
    depthQuestion: "Koliko duboko želiš ići danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    thresholdLine:
      "Tačno znaš ko nisi. Samo nikad nisi pitao ko je ostao. Ovdje ćeš ga upoznati.",
    patternReviewLabel: "Vidi obrazac",
    stillHereLabel: "Još sam tu — ovo traje malo duže.",
    lastCommitmentLabel: "Prošli put: {action}.",
    lastCommitmentLandedLabel: "Prošli put: {action} — i uspio si.",
    startFreshLabel: "počni ispočetka",
    winHeadline: "Uspio si.",
    weeklyRecapHeadline: "Ove sedmice.",
    checkInPromptText:
      "Koje vrijeme ti obično odgovara? Javiću ti se toplo otprilike u to vrijeme — nikad strogo pravilo, samo manje nasumično od nagađanja stranca.",
    closeLabel: "zatvori",
    continueLabel: "nastavi",
    treeTabLabel: "Tvoje drvo",
    familyTabLabel: "Tvoja porodica",
    treeEntryLabel: "Tvoje drvo",
    chooseTimeLabel: "Izaberi vrijeme",
    chooseLanguageAriaLabel: "Izaberi jezik",
    continueAriaLabel: "Nastavi",
    checkInSettingsAriaLabel: "Podešavanja javljanja",
    sendAriaLabel: "Pošalji",
    elementLabels: { fire: "Vatra", earth: "Zemlja", air: "Zrak", water: "Voda" },
    avatarHeadlineTemplate: "{element} — {pct}% večeras.",
    privacyLong1: "Tvoji razgovori se sigurno čuvaju, povezani s privatnim, anonimnim ID-om generisanim na ovom uređaju — nikada s tvojim imenom ili javnim računom. Upravo to omogućava aplikaciji da te pamti između razgovora i s vremenom primijeti stvarne obrasce, umjesto da svaki put kad je otvoriš počinje ispočetka.",
    privacyLong2: "Tvoji podaci se nikada ne prodaju, nikada se ne dijele s oglašivačima ili drugim trećim stranama, i nikada se ne koriste za treniranje AI modela — ni Just You-ovih, ni bilo čijih drugih. Sve je šifrirano i tokom prijenosa i tokom čuvanja. Razgovori se nikada ne čitaju, ne pregledaju niti dijele s bilo kim, uključujući nas — postoje samo kako bi aplikacija mogla odgovoriti tebi sa stvarnim kontekstom.",
  },
  bg: {
    brand: "Just You",
    questions: [
      "Какво си готов да спреш да преструваш?",
      "Кой беше ти, преди да се научиш да се преструваш?",
      "Какво се преструваш, че не искаш?",
      "Какво би казал, ако никой не те оценяваше?",
      "От какво си най-уморен да доказваш?",
      "Как си, наистина?",
      "Какъв беше денят ти досега?",
      "За какво мислиш?",
      "Къде са мислите ти точно сега?",
      "Какво заема място в теб напоследък?",
      "Какво носиш днес?",
      "Как всъщност мина седмицата ти?",
      "Какво е истина за теб точно сега?",
      "Какво е останало в теб напоследък?",
      "От какво имаш нужда точно сега?",
      "Какво те тежи днес?",
      "В какъв ден се превръща този ден?",
      "Каква е енергията ти точно сега?",
      "Кое е първото нещо, което би казал на приятел за днес?",
      "Какво е било шумно в главата ти напоследък?",
      "Как се чувства тялото ти точно сега?",
      "Кое нещо от днес остана с теб?",
      "Какво ти се иска някой да те попита точно сега?",
      "Какъв е честният отговор на 'как си'?",
      "Какво те притеснява тихо?",
    ],
    moodCaption: "А как се чувстваш точно сега?",
    moods: [
      "Спокоен", "Тревожен", "Ядосан", "Изтръпнал", "Уморен", "С надежда", "Заседнал",
      "Претоварен",
      "Неспокоен",
      "Доволен",
      "Самотен",
      "Разочарован",
      "Любопитен",
      "Натежал",
      "Изтощен",
      "Благодарен",
      "Нервен",
    ],
    placeholderStart: "Отговори, или кажи каквото и да е.",
    placeholderContinue: "Кажи това, което е истина.",
    settingsText: "Остави имейл — ако падеж на ангажимент настъпи, Just You ще се свърже с теб, преди да се наложи сам да се върнеш.",
    saveLabel: "Запази",
    savedLabel: "Готово.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ти",
    returnLabel: "just you",
    depthQuestion: "Колко дълбоко искаш да отидеш днес?",
    depthOptions: ["Просто гледам", "Малко", "Имам нещо наум"],
    thresholdLine:
      "Знаеш точно кой не си. Просто никога не си питал кой е останал. Тук го срещаш.",
    patternReviewLabel: "Виж модела",
    stillHereLabel: "Все още съм тук — това отнема малко повече време.",
    lastCommitmentLabel: "Последния път: {action}.",
    lastCommitmentLandedLabel: "Последния път: {action} — и го направи.",
    startFreshLabel: "започни отначало",
    winHeadline: "Успя.",
    weeklyRecapHeadline: "Тази седмица.",
    checkInPromptText:
      "Кое време обикновено е удобно за теб? Ще се свържа топло с теб около това време — никога строго правило, само по-малко случайно от предположението на непознат.",
    closeLabel: "затвори",
    continueLabel: "продължи",
    treeTabLabel: "Твоето дърво",
    familyTabLabel: "Твоето семейство",
    treeEntryLabel: "Твоето дърво",
    chooseTimeLabel: "Избери час",
    chooseLanguageAriaLabel: "Избери език",
    continueAriaLabel: "Продължи",
    checkInSettingsAriaLabel: "Настройки за връзка",
    sendAriaLabel: "Изпрати",
    elementLabels: { fire: "Огън", earth: "Земя", air: "Въздух", water: "Вода" },
    avatarHeadlineTemplate: "{element} — {pct}% тази вечер.",
    privacyLong1: "Разговорите ти се съхраняват сигурно, свързани с частен, анонимен ID, генериран на това устройство — никога с твоето име или публичен акаунт. Именно това позволява на приложението да те помни между разговорите и да забелязва реални модели с течение на времето, вместо да започва от нулата всеки път, когато го отвориш.",
    privacyLong2: "Данните ти никога не се продават, никога не се споделят с рекламодатели или други трети страни и никога не се използват за обучение на AI модели — нито на Just You, нито на когото и да било друг. Всичко е криптирано както при пренос, така и при съхранение. Разговорите никога не се четат, преглеждат или споделят с никого, включително с нас — те съществуват само за да може приложението да ти отговаря с реален контекст.",
  },
  mk: {
    brand: "Just You",
    questions: [
      "Што си спремен да престанеш да глумиш?",
      "Кој беше ти пред да научиш да глумиш?",
      "Што се преправаш дека не сакаш?",
      "Што ќе кажеше ако никој не те оценуваше?",
      "Од што си најуморен да докажуваш?",
      "Како си, навистина?",
      "Каков беше денешниот ден?",
      "На што мислиш?",
      "Каде ти се мислите сега?",
      "Што зазема простор во тебе во последно време?",
      "Што носиш денес?",
      "Како навистина помина твојата недела?",
      "Што е вистина за тебе сега?",
      "Што остана со тебе во последно време?",
      "Што ти треба сега?",
      "Што те притиска денес?",
      "Во каков ден се претвора ова?",
      "Каква е твојата енергија сега?",
      "Што би било прво нешто што би му го кажал на пријател за денес?",
      "Што беше гласно во твојата глава во последно време?",
      "Како се чувствува твоето тело сега?",
      "Кое нешто од денес остана со тебе?",
      "Што би сакал некој да те праша сега?",
      "Кој е искрениот одговор на 'како си'?",
      "Што тивко те вознемирува?",
    ],
    moodCaption: "А како се чувствуваш токму сега?",
    moods: [
      "Смирен", "Вознемирен", "Лут", "Вкочанет", "Уморен", "Полн со надеж", "Заглавен",
      "Преоптоварен",
      "Немирен",
      "Задоволен",
      "Осамен",
      "Фрустриран",
      "Љубопитен",
      "Оптоварен",
      "Исцрпен",
      "Благодарен",
      "Нервозен",
    ],
    placeholderStart: "Одговори, или кажи било што.",
    placeholderContinue: "Кажи го тоа што е вистина.",
    settingsText: "Остави email — ако достигне рок за обврска, Just You ќе ти пише пред сам да мора да се вратиш.",
    saveLabel: "Зачувај",
    savedLabel: "Готово.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ти",
    returnLabel: "just you",
    depthQuestion: "Колку длабоко сакаш да одиш денес?",
    depthOptions: ["Само гледам", "Малку", "Имам нешто на ум"],
    thresholdLine:
      "Точно знаеш кој не си. Само никогаш не праша кој останал. Тука го запознаваш.",
    patternReviewLabel: "Види ја шемата",
    stillHereLabel: "Сè уште сум тука — ова трае малку подолго.",
    lastCommitmentLabel: "Минатиот пат: {action}.",
    lastCommitmentLandedLabel: "Минатиот пат: {action} — и го направи тоа.",
    startFreshLabel: "почни одново",
    winHeadline: "Успеа.",
    weeklyRecapHeadline: "Оваа недела.",
    checkInPromptText:
      "Кое време обично ти одговара? Ќе ти се јавам топло околу тоа време — никогаш строго правило, само помалку случајно од погодувањето на непознат.",
    closeLabel: "затвори",
    continueLabel: "продолжи",
    treeTabLabel: "Твоето дрво",
    familyTabLabel: "Твоето семејство",
    treeEntryLabel: "Твоето дрво",
    chooseTimeLabel: "Избери време",
    chooseLanguageAriaLabel: "Избери јазик",
    continueAriaLabel: "Продолжи",
    checkInSettingsAriaLabel: "Поставки за јавување",
    sendAriaLabel: "Испрати",
    elementLabels: { fire: "Оган", earth: "Земја", air: "Воздух", water: "Вода" },
    avatarHeadlineTemplate: "{element} — {pct}% вечерва.",
    privacyLong1: "Твоите разговори се чуваат безбедно, поврзани со приватен, анонимен ID генериран на овој уред — никогаш со твоето име или јавна сметка. Токму тоа ѝ овозможува на апликацијата да те памти помеѓу разговорите и да забележи вистински обрасци со текот на времето, наместо секој пат кога ќе ја отвориш да почнува од нула.",
    privacyLong2: "Твоите податоци никогаш не се продаваат, никогаш не се споделуваат со рекламодавачи или други трети страни, и никогаш не се користат за обучување на AI модели — ниту на Just You, ниту на кој било друг. Сè е криптирано и при пренос и при складирање. Разговорите никогаш не се читаат, прегледуваат или споделуваат со никого, вклучувајќи нè — тие постојат само за да може апликацијата да ти одговори со вистински контекст.",
  },
  ro: {
    brand: "Just You",
    questions: [
      "Ce ești pregătit să încetezi să mai prefaci?",
      "Cine erai înainte să înveți să te prefaci?",
      "Ce te prefaci că nu vrei?",
      "Ce ai spune dacă nimeni nu te-ar judeca?",
      "De ce ești cel mai obosit să mai dovedești?",
      "Cum ești, cu adevărat?",
      "Cum a fost ziua de azi?",
      "La ce te gândești?",
      "Unde îți este mintea chiar acum?",
      "Ce a ocupat loc în tine în ultima vreme?",
      "Ce cari cu tine azi?",
      "Cum a fost de fapt săptămâna ta?",
      "Ce este adevărat pentru tine chiar acum?",
      "Ce a rămas cu tine în ultima vreme?",
      "De ce ai nevoie chiar acum?",
      "Ce te apasă azi?",
      "În ce fel de zi se transformă asta?",
      "Cum este energia ta chiar acum?",
      "Care ar fi primul lucru pe care l-ai spune unui prieten despre azi?",
      "Ce a fost zgomotos în mintea ta în ultima vreme?",
      "Cum se simte corpul tău chiar acum?",
      "Ce lucru din ziua de azi a rămas cu tine?",
      "Ce ai vrea să te întrebe cineva chiar acum?",
      "Care este răspunsul sincer la 'ce mai faci'?",
      "Ce te deranjează în tăcere?",
    ],
    moodCaption: "Și cum te simți chiar acum?",
    moods: [
      "Calm", "Anxios", "Furios", "Amorțit", "Obosit", "Plin de speranță", "Blocat",
      "Copleșit",
      "Neliniștit",
      "Mulțumit",
      "Singur",
      "Frustrat",
      "Curios",
      "Împovărat",
      "Epuizat",
      "Recunoscător",
      "Agitat",
    ],
    placeholderStart: "Răspunde, sau spune orice.",
    placeholderContinue: "Spune ce e adevărat.",
    settingsText: "Lasă un email — dacă un angajament ajunge la termen, Just You îți va scrie înainte să fii nevoit să revii singur.",
    saveLabel: "Salvează",
    savedLabel: "Gata.",
    emailPlaceholder: "tu@exemplu.com",
    youLabel: "tu",
    returnLabel: "just you",
    depthQuestion: "Cât de adânc vrei să mergi azi?",
    depthOptions: ["Doar mă uit", "Puțin", "Am ceva pe suflet"],
    thresholdLine:
      "Știi exact cine nu ești. Doar că nu ai întrebat niciodată cine a rămas. Aici îl întâlnești.",
    patternReviewLabel: "Vezi tiparul",
    stillHereLabel: "Încă sunt aici — asta durează puțin mai mult.",
    lastCommitmentLabel: "Data trecută: {action}.",
    lastCommitmentLandedLabel: "Data trecută: {action} — și ai făcut-o.",
    startFreshLabel: "ia-o de la capăt",
    winHeadline: "Ai reușit.",
    weeklyRecapHeadline: "Săptămâna aceasta.",
    checkInPromptText:
      "Care e de obicei un moment bun pentru tine? Te voi contacta cu căldură pe la ora aceea — niciodată o regulă strictă, doar mai puțin la întâmplare decât ghicitul unui străin.",
    closeLabel: "închide",
    continueLabel: "continuă",
    treeTabLabel: "Copacul tău",
    familyTabLabel: "Familia ta",
    treeEntryLabel: "Copacul tău",
    chooseTimeLabel: "Alege o oră",
    chooseLanguageAriaLabel: "Alege limba",
    continueAriaLabel: "Continuă",
    checkInSettingsAriaLabel: "Setări de contact",
    sendAriaLabel: "Trimite",
    elementLabels: { fire: "Foc", earth: "Pământ", air: "Aer", water: "Apă" },
    avatarHeadlineTemplate: "{element} — {pct}% în seara asta.",
    privacyLong1: "Conversațiile tale sunt stocate în siguranță, asociate cu un ID privat și anonim generat pe acest dispozitiv — niciodată cu numele tău sau cu un cont public. Asta îi permite aplicației să își amintească de tine între conversații și să observe tipare reale de-a lungul timpului, în loc să o ia de la zero de fiecare dată când o deschizi.",
    privacyLong2: "Datele tale nu sunt niciodată vândute, niciodată partajate cu agenți de publicitate sau alte terțe părți, și niciodată folosite pentru a antrena modele de IA — nici ale Just You, nici ale altcuiva. Totul este criptat atât în tranzit, cât și la stocare. Conversațiile nu sunt niciodată citite, examinate sau partajate cu nimeni, nici măcar cu noi — există doar pentru ca aplicația să îți poată răspunde cu context real.",
  },
  sl: {
    brand: "Just You",
    questions: [
      "Kaj si pripravljen nehati igrati?",
      "Kdo si bil, preden si se naučil igrati vlogo?",
      "Kaj se delaš, da ne želiš?",
      "Kaj bi rekel, če te nihče ne bi ocenjeval?",
      "Česa si najbolj naveličan dokazovati?",
      "Kako si, zares?",
      "Kakšen je bil tvoj dan?",
      "Kaj imaš v mislih?",
      "Kje so tvoje misli ravno zdaj?",
      "Kaj je v zadnjem času zavzemalo prostor v tebi?",
      "Kaj nosiš danes?",
      "Kakšen je bil tvoj teden, zares?",
      "Kaj je zate res ravno zdaj?",
      "Kaj je ostalo s teboj v zadnjem času?",
      "Kaj potrebuješ ravno zdaj?",
      "Kaj te danes bremeni?",
      "V kakšen dan se to spreminja?",
      "Kakšna je tvoja energija ravno zdaj?",
      "Kaj bi bilo prvo, kar bi povedal prijatelju o današnjem dnevu?",
      "Kaj je bilo v zadnjem času glasno v tvoji glavi?",
      "Kako se tvoje telo počuti ravno zdaj?",
      "Katera stvar od danes je ostala s teboj?",
      "Kaj bi si želel, da te nekdo vpraša ravno zdaj?",
      "Kakšen je iskren odgovor na 'kako si'?",
      "Kaj te tiho moti?",
    ],
    moodCaption: "In kako se počutiš prav zdaj?",
    moods: [
      "Miren", "Tesnoben", "Jezen", "Otopel", "Utrujen", "Poln upanja", "Obtičal",
      "Preobremenjen",
      "Nemiren",
      "Zadovoljen",
      "Osamljen",
      "Frustriran",
      "Radoveden",
      "Obtežen",
      "Izčrpan",
      "Hvaležen",
      "Živčen",
    ],
    placeholderStart: "Odgovori, ali povej karkoli.",
    placeholderContinue: "Povej, kar je res.",
    settingsText: "Pusti email — če zapade obveznost, se ti bo Just You oglasila, preden se boš moral sam vrniti.",
    saveLabel: "Shrani",
    savedLabel: "Opravljeno.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ti",
    returnLabel: "just you",
    depthQuestion: "Kako globoko želiš iti danes?",
    depthOptions: ["Samo gledam", "Malo", "Nekaj imam v mislih"],
    thresholdLine:
      "Natančno veš, kdo nisi. Samo nikoli nisi vprašal, kdo je ostal. Tukaj ga srečaš.",
    patternReviewLabel: "Poglej vzorec",
    stillHereLabel: "Še sem tu — to traja malo dlje.",
    lastCommitmentLabel: "Zadnjič: {action}.",
    lastCommitmentLandedLabel: "Zadnjič: {action} — in si to naredil.",
    startFreshLabel: "začni znova",
    winHeadline: "Uspelo ti je.",
    weeklyRecapHeadline: "Ta teden.",
    checkInPromptText:
      "Kdaj ti običajno najbolj ustreza? Takrat te bom toplo pozdravil — nikoli strogo pravilo, le manj naključno od ugibanja tujca.",
    closeLabel: "zapri",
    continueLabel: "nadaljuj",
    treeTabLabel: "Tvoje drevo",
    familyTabLabel: "Tvoja družina",
    treeEntryLabel: "Tvoje drevo",
    chooseTimeLabel: "Izberi čas",
    chooseLanguageAriaLabel: "Izberi jezik",
    continueAriaLabel: "Nadaljuj",
    checkInSettingsAriaLabel: "Nastavitve javljanja",
    sendAriaLabel: "Pošlji",
    elementLabels: { fire: "Ogenj", earth: "Zemlja", air: "Zrak", water: "Voda" },
    avatarHeadlineTemplate: "{element} — {pct}% nocoj.",
    privacyLong1: "Tvoji pogovori se varno shranjujejo, povezani z zasebnim, anonimnim ID-jem, ustvarjenim na tej napravi — nikoli s tvojim imenom ali javnim računom. Prav to aplikaciji omogoča, da si te zapomni med pogovori in sčasoma opazi resnične vzorce, namesto da vsakič, ko jo odpreš, začne znova.",
    privacyLong2: "Tvoji podatki nikoli niso prodani, nikoli deljeni z oglaševalci ali drugimi tretjimi osebami, in nikoli uporabljeni za učenje AI modelov — ne Just You-jevih, ne kogar koli drugega. Vse je šifrirano tako med prenosom kot v mirovanju. Pogovori nikoli niso brani, pregledani ali deljeni s komer koli, vključno z nami — obstajajo samo zato, da lahko aplikacija odgovori s pravim kontekstom.",
  },
};

const SUPPORTED_LANGS = Object.keys(STRINGS);

// Native display names for the language dropdown — showing "Shqip" instead
// of just "SQ" is the difference between someone finding their language
// and assuming it isn't there.
const NATIVE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  he: "עברית",
  ar: "العربية",
  hi: "हिन्दी",
  zh: "中文",
  ja: "日本語",
  ru: "Русский",
  sq: "Shqip",
  el: "Ελληνικά",
  hy: "Հայերեն",
  sr: "Srpski",
  hr: "Hrvatski",
  bs: "Bosanski",
  bg: "Български",
  mk: "Македонски",
  ro: "Română",
  sl: "Slovenščina",
};

// Fallback guess when the visitor's browser language isn't one we
// support — based on their country, read from the cookie middleware.ts
// sets from Vercel's edge geo header. Browser language always wins when
// it matches something we support; this only fills the gap.
const COUNTRY_TO_LANG: Record<string, string> = {
  US: "en", GB: "en", CA: "en", AU: "en", IE: "en", NZ: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
  SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  DE: "de", AT: "de", CH: "de", LI: "de",
  PT: "pt", BR: "pt",
  IT: "it",
  IL: "he",
  SA: "ar", AE: "ar", EG: "ar", MA: "ar", DZ: "ar", TN: "ar", JO: "ar",
  LB: "ar", IQ: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar", YE: "ar",
  SY: "ar", LY: "ar", SD: "ar", PS: "ar",
  IN: "hi",
  CN: "zh", TW: "zh", HK: "zh",
  JP: "ja",
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru",
  AL: "sq", XK: "sq",
  GR: "el", CY: "el",
  AM: "hy",
  RS: "sr",
  HR: "hr",
  BA: "bs",
  BG: "bg",
  MK: "mk",
  RO: "ro", MD: "ro",
  SI: "sl",
};

function getVisitorCountry(): string | null {
  const match = document.cookie.match(/(?:^|; )visitor_country=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function detectLang(): string {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const c of candidates) {
    const short = c.toLowerCase().split("-")[0];
    if (SUPPORTED_LANGS.includes(short)) return short;
  }
  const country = getVisitorCountry();
  if (country && COUNTRY_TO_LANG[country]) return COUNTRY_TO_LANG[country];
  return "en";
}

// --- Onboarding script, translated. English wording is the final,
// approved copy from onboarding-script.md, preserved exactly; every other
// language is a faithful translation of the same content and order.
type OnboardingCopy = {
  p1a: string;
  p1b: string;
  whoWeAreHint: string;
  p2: string;
  p3a: string;
  p3b: string;
  p4a: string;
  p4b: string;
  stageMystery: string;
  stageMysteryDesc: string;
  stageSafety: string;
  stageSafetyDesc: string;
  stageRecognition: string;
  stageRecognitionDesc: string;
  stageCourage: string;
  stageCourageDesc: string;
  stageReturn: string;
  stageReturnDesc: string;
  p5: string;
  beforeYouStartHint: string;
  p6: string;
  p7: string;
  privacy1: string;
  privacy2: string;
  continueLabel: string;
  beginLabel: string;
};

const ONBOARDING_STRINGS: Record<string, OnboardingCopy> = {
  en: {
    p1a: "Most things on your phone are built to hold your attention as long as possible. This one isn't.",
    p1b: "The whole point is the opposite: to help you need it less. If it does its job, you leave — not because you got bored, but because you got somewhere.",
    whoWeAreHint: "Who we are",
    p2: "Not a company chasing your attention. Not a wellness brand with a quiz and a subscription. A small group who got tired of performing ourselves, and built the thing we wished existed.",
    p3a: "Think of it as a mentor — built on the thinking of the most influential and successful people who ever lived, distilled down to what actually works. Not just information. Something closer to spiritual, if you let it be.",
    p3b: "This isn't here to help you understand yourself. It's here to help you win — at the things that actually matter to you. Understanding yourself just happens to be what it takes to get there.",
    p4a: "Not therapy. Not a chatbot. Not another app asking for five minutes of your attention.",
    p4b: "This is a space that follows you through five honest stages — the same ones underneath almost every real change a person ever makes, whether they had a name for it or not:",
    stageMystery: "Mystery.",
    stageMysteryDesc: "Something's off. You can't name it yet.",
    stageSafety: "Safety.",
    stageSafetyDesc: "You've admitted it — but you're still protecting yourself from what you might find.",
    stageRecognition: "Recognition.",
    stageRecognitionDesc: "The pattern becomes visible. Not the circumstances. The role you've been playing.",
    stageCourage: "Courage.",
    stageCourageDesc: "You know the truth now. It's asking something of you.",
    stageReturn: "Return.",
    stageReturnDesc: "Not fixed. Not arrived. Just no longer performing.",
    p5: "You won't be told which stage you're in while you're in it. That's on purpose — naming it too early turns a real process into a personality quiz. You'll find out where you landed when the conversation is ready to tell you, not before.",
    beforeYouStartHint: "Before you start",
    p6: "You won't get there today, and that's fine. Nobody starts anywhere but the beginning. Wherever you actually are right now, it'll meet you there.",
    p7: "One more thing: sometimes a reply takes longer than usual. That's on purpose — in the silence, you get the most answers.",
    privacy1: "Your conversations are stored securely so the app can remember you between sessions — that's what lets it notice real patterns over time instead of starting over every time.",
    privacy2: "They're never sold, never used to train AI models, and encrypted both in transit and at rest. Conversations are never read, reviewed, or shared with anyone.",
    continueLabel: "Continue",
    beginLabel: "Begin",
  },
  es: {
    p1a: "La mayoría de las cosas en tu teléfono están diseñadas para captar tu atención el mayor tiempo posible. Esto no.",
    p1b: "El objetivo es justo lo contrario: ayudarte a necesitarlo menos. Si cumple su función, te vas — no porque te aburriste, sino porque llegaste a algún lado.",
    whoWeAreHint: "Quiénes somos",
    p2: "No somos una empresa que persigue tu atención. No somos una marca de bienestar con un cuestionario y una suscripción. Un pequeño grupo que se cansó de fingir, y construyó lo que deseaba que existiera.",
    p3a: "Piénsalo como un mentor — construido sobre el pensamiento de las personas más influyentes y exitosas que han existido, reducido a lo que realmente funciona. No es solo información. Algo más cercano a lo espiritual, si lo permites.",
    p3b: "Esto no está aquí para ayudarte a entenderte a ti mismo. Está aquí para ayudarte a ganar — en las cosas que realmente te importan. Entenderte a ti mismo resulta ser lo que se necesita para llegar ahí.",
    p4a: "No es terapia. No es un chatbot. No es otra app pidiendo cinco minutos de tu atención.",
    p4b: "Este es un espacio que te acompaña a través de cinco etapas honestas — las mismas que hay detrás de casi todo cambio real que una persona hace, tuviera nombre o no:",
    stageMystery: "Misterio.",
    stageMysteryDesc: "Algo no está bien. Aún no sabes nombrarlo.",
    stageSafety: "Seguridad.",
    stageSafetyDesc: "Ya lo admitiste — pero todavía te proteges de lo que puedas encontrar.",
    stageRecognition: "Reconocimiento.",
    stageRecognitionDesc: "El patrón se hace visible. No las circunstancias. El papel que has estado interpretando.",
    stageCourage: "Coraje.",
    stageCourageDesc: "Ya conoces la verdad. Te está pidiendo algo.",
    stageReturn: "Regreso.",
    stageReturnDesc: "No arreglado. No llegado. Simplemente ya no actuando un papel.",
    p5: "No te dirán en qué etapa estás mientras estás en ella. Es a propósito — nombrarlo demasiado pronto convierte un proceso real en un test de personalidad. Sabrás dónde llegaste cuando la conversación esté lista para decírtelo, no antes.",
    beforeYouStartHint: "Antes de empezar",
    p6: "Hoy no vas a llegar, y está bien. Nadie empieza en otro lugar que no sea el principio. Donde sea que estés ahora mismo, te va a encontrar ahí.",
    p7: "Una cosa más: a veces una respuesta tarda más de lo habitual. Es a propósito — en el silencio es donde llegan las mejores respuestas.",
    privacy1: "Tus conversaciones se guardan de forma segura para que la app pueda recordarte entre sesiones — eso es lo que le permite notar patrones reales con el tiempo, en vez de empezar de cero cada vez.",
    privacy2: "Nunca se venden, nunca se usan para entrenar modelos de IA, y están cifradas tanto en tránsito como en reposo. Las conversaciones nunca son leídas, revisadas ni compartidas con nadie.",
    continueLabel: "Continuar",
    beginLabel: "Empezar",
  },
  fr: {
    p1a: "La plupart des choses sur ton téléphone sont conçues pour capter ton attention le plus longtemps possible. Pas celle-ci.",
    p1b: "Le but est justement l'inverse : t'aider à en avoir moins besoin. Si elle fait son travail, tu pars — pas parce que tu t'es ennuyé, mais parce que tu es arrivé quelque part.",
    whoWeAreHint: "Qui nous sommes",
    p2: "Pas une entreprise qui chasse ton attention. Pas une marque de bien-être avec un quiz et un abonnement. Un petit groupe fatigué de jouer un rôle, qui a construit ce qu'il aurait aimé trouver.",
    p3a: "Vois ça comme un mentor — construit sur la pensée des personnes les plus influentes et accomplies qui ont existé, réduite à ce qui fonctionne vraiment. Pas juste de l'information. Quelque chose de plus proche du spirituel, si tu le laisses être.",
    p3b: "Ce n'est pas là pour t'aider à te comprendre. C'est là pour t'aider à gagner — dans les choses qui comptent vraiment pour toi. Se comprendre soi-même, c'est juste ce qu'il faut pour y arriver.",
    p4a: "Pas de la thérapie. Pas un chatbot. Pas une autre appli qui demande cinq minutes de ton attention.",
    p4b: "C'est un espace qui t'accompagne à travers cinq étapes honnêtes — celles qui sous-tendent presque tous les vrais changements qu'une personne fait, qu'elle leur ait donné un nom ou non :",
    stageMystery: "Mystère.",
    stageMysteryDesc: "Quelque chose ne va pas. Tu ne sais pas encore le nommer.",
    stageSafety: "Sécurité.",
    stageSafetyDesc: "Tu l'as admis — mais tu te protèges encore de ce que tu pourrais trouver.",
    stageRecognition: "Reconnaissance.",
    stageRecognitionDesc: "Le schéma devient visible. Pas les circonstances. Le rôle que tu as joué.",
    stageCourage: "Courage.",
    stageCourageDesc: "Tu connais la vérité maintenant. Elle te demande quelque chose.",
    stageReturn: "Retour.",
    stageReturnDesc: "Pas réparé. Pas arrivé. Juste plus en train de jouer un rôle.",
    p5: "On ne te dira pas à quelle étape tu es pendant que tu y es. C'est voulu — le nommer trop tôt transforme un vrai processus en test de personnalité. Tu sauras où tu en es quand la conversation sera prête à te le dire, pas avant.",
    beforeYouStartHint: "Avant de commencer",
    p6: "Tu n'y arriveras pas aujourd'hui, et c'est normal. Personne ne commence ailleurs qu'au début. Où que tu sois vraiment en ce moment, ça te retrouvera là.",
    p7: "Encore une chose : parfois une réponse met plus de temps que d'habitude. C'est voulu — c'est dans le silence qu'on trouve les meilleures réponses.",
    privacy1: "Tes conversations sont stockées de façon sécurisée pour que l'appli puisse se souvenir de toi d'une session à l'autre — c'est ce qui lui permet de remarquer de vrais schémas dans le temps, au lieu de repartir de zéro à chaque fois.",
    privacy2: "Elles ne sont jamais vendues, jamais utilisées pour entraîner des modèles d'IA, et chiffrées à la fois en transit et au repos. Les conversations ne sont jamais lues, examinées ni partagées avec qui que ce soit.",
    continueLabel: "Continuer",
    beginLabel: "Commencer",
  },
  de: {
    p1a: "Die meisten Dinge auf deinem Handy sind darauf ausgelegt, deine Aufmerksamkeit so lange wie möglich zu halten. Das hier nicht.",
    p1b: "Der ganze Sinn ist das Gegenteil: dir zu helfen, es weniger zu brauchen. Wenn es seinen Zweck erfüllt, gehst du — nicht weil dir langweilig wurde, sondern weil du irgendwo angekommen bist.",
    whoWeAreHint: "Wer wir sind",
    p2: "Kein Unternehmen, das deine Aufmerksamkeit jagt. Keine Wellness-Marke mit Quiz und Abo. Eine kleine Gruppe, die es leid war, sich selbst vorzuspielen, und das gebaut hat, was sie sich gewünscht hätte.",
    p3a: "Stell es dir wie einen Mentor vor — aufgebaut auf dem Denken der einflussreichsten und erfolgreichsten Menschen, die je gelebt haben, verdichtet auf das, was wirklich funktioniert. Nicht nur Information. Etwas, das dem Spirituellen nahekommt, wenn du es zulässt.",
    p3b: "Das hier soll dir nicht helfen, dich selbst zu verstehen. Es soll dir helfen zu gewinnen — bei den Dingen, die dir wirklich wichtig sind. Sich selbst zu verstehen ist nur das, was es dafür braucht.",
    p4a: "Keine Therapie. Kein Chatbot. Keine weitere App, die fünf Minuten deiner Aufmerksamkeit will.",
    p4b: "Das ist ein Raum, der dich durch fünf ehrliche Stufen begleitet — dieselben, die fast jeder echten Veränderung zugrunde liegen, ob sie einen Namen dafür hatten oder nicht:",
    stageMystery: "Rätsel.",
    stageMysteryDesc: "Etwas stimmt nicht. Du kannst es noch nicht benennen.",
    stageSafety: "Sicherheit.",
    stageSafetyDesc: "Du hast es zugegeben — aber du schützt dich noch davor, was du finden könntest.",
    stageRecognition: "Erkenntnis.",
    stageRecognitionDesc: "Das Muster wird sichtbar. Nicht die Umstände. Die Rolle, die du gespielt hast.",
    stageCourage: "Mut.",
    stageCourageDesc: "Du kennst jetzt die Wahrheit. Sie verlangt etwas von dir.",
    stageReturn: "Rückkehr.",
    stageReturnDesc: "Nicht geheilt. Nicht angekommen. Einfach nicht mehr spielend.",
    p5: "Man wird dir nicht sagen, in welcher Stufe du bist, während du darin bist. Das ist Absicht — es zu früh zu benennen macht aus einem echten Prozess ein Persönlichkeitsquiz. Du erfährst, wo du gelandet bist, wenn das Gespräch bereit ist, es dir zu sagen — nicht vorher.",
    beforeYouStartHint: "Bevor du anfängst",
    p6: "Du wirst heute nicht dort ankommen, und das ist okay. Niemand beginnt irgendwo anders als am Anfang. Wo auch immer du gerade wirklich bist — es wird dich dort abholen.",
    p7: "Noch etwas: Manchmal dauert eine Antwort länger als gewöhnlich. Das ist Absicht — im Schweigen findest du die besten Antworten.",
    privacy1: "Deine Gespräche werden sicher gespeichert, damit die App sich zwischen den Sitzungen an dich erinnern kann — nur so kann sie echte Muster über die Zeit erkennen, statt jedes Mal von vorne anzufangen.",
    privacy2: "Sie werden nie verkauft, nie zum Trainieren von KI-Modellen verwendet und sowohl bei der Übertragung als auch bei der Speicherung verschlüsselt. Gespräche werden von niemandem gelesen, überprüft oder weitergegeben.",
    continueLabel: "Weiter",
    beginLabel: "Anfangen",
  },
  pt: {
    p1a: "A maioria das coisas no seu telefone é feita para reter sua atenção o máximo de tempo possível. Esta não.",
    p1b: "O objetivo é justamente o contrário: ajudar você a precisar menos disso. Se fizer o que deve, você vai embora — não porque se cansou, mas porque chegou a algum lugar.",
    whoWeAreHint: "Quem somos",
    p2: "Não somos uma empresa atrás da sua atenção. Não somos uma marca de bem-estar com questionário e assinatura. Um pequeno grupo que se cansou de fingir e construiu o que gostaria que existisse.",
    p3a: "Pense nisso como um mentor — construído sobre o pensamento das pessoas mais influentes e bem-sucedidas que já existiram, reduzido ao que realmente funciona. Não é só informação. Algo mais perto do espiritual, se você deixar.",
    p3b: "Isto não está aqui para ajudar você a se entender. Está aqui para ajudar você a vencer — nas coisas que realmente importam para você. Entender a si mesmo é só o que é preciso para chegar lá.",
    p4a: "Não é terapia. Não é um chatbot. Não é mais um app pedindo cinco minutos da sua atenção.",
    p4b: "Este é um espaço que acompanha você por cinco estágios honestos — os mesmos que estão por trás de quase toda mudança real que uma pessoa faz, tendo um nome para isso ou não:",
    stageMystery: "Mistério.",
    stageMysteryDesc: "Algo não está certo. Você ainda não sabe nomear.",
    stageSafety: "Segurança.",
    stageSafetyDesc: "Você já admitiu — mas ainda está se protegendo do que pode encontrar.",
    stageRecognition: "Reconhecimento.",
    stageRecognitionDesc: "O padrão se torna visível. Não as circunstâncias. O papel que você tem interpretado.",
    stageCourage: "Coragem.",
    stageCourageDesc: "Você já conhece a verdade. Ela está pedindo algo de você.",
    stageReturn: "Retorno.",
    stageReturnDesc: "Não resolvido. Não chegado. Só não mais representando um papel.",
    p5: "Você não vai saber em que estágio está enquanto estiver nele. Isso é de propósito — nomear cedo demais transforma um processo real em teste de personalidade. Você vai descobrir onde chegou quando a conversa estiver pronta para dizer, não antes.",
    beforeYouStartHint: "Antes de começar",
    p6: "Você não vai chegar lá hoje, e está tudo bem. Ninguém começa em outro lugar além do início. Onde você estiver agora, é aí que isso vai te encontrar.",
    p7: "Mais uma coisa: às vezes uma resposta demora mais que o normal. Isso é de propósito — é no silêncio que se encontram as melhores respostas.",
    privacy1: "Suas conversas são armazenadas com segurança para que o app possa se lembrar de você entre sessões — é isso que permite notar padrões reais ao longo do tempo, em vez de recomeçar do zero toda vez.",
    privacy2: "Elas nunca são vendidas, nunca são usadas para treinar modelos de IA, e são criptografadas tanto em trânsito quanto em repouso. As conversas nunca são lidas, revisadas ou compartilhadas com ninguém.",
    continueLabel: "Continuar",
    beginLabel: "Começar",
  },
  it: {
    p1a: "La maggior parte delle cose sul tuo telefono è pensata per trattenere la tua attenzione quanto più possibile. Questa no.",
    p1b: "Lo scopo è proprio l'opposto: aiutarti ad averne meno bisogno. Se fa il suo lavoro, te ne vai — non perché ti sei annoiato, ma perché sei arrivato da qualche parte.",
    whoWeAreHint: "Chi siamo",
    p2: "Non un'azienda a caccia della tua attenzione. Non un marchio di benessere con quiz e abbonamento. Un piccolo gruppo stanco di recitare una parte, che ha costruito ciò che avrebbe voluto trovare.",
    p3a: "Pensalo come un mentore — costruito sul pensiero delle persone più influenti e di successo che siano mai esistite, distillato in ciò che funziona davvero. Non solo informazioni. Qualcosa più vicino allo spirituale, se glielo permetti.",
    p3b: "Non è qui per aiutarti a capire te stesso. È qui per aiutarti a vincere — nelle cose che contano davvero per te. Capire te stesso è solo ciò che serve per arrivarci.",
    p4a: "Non è terapia. Non è un chatbot. Non è un'altra app che chiede cinque minuti della tua attenzione.",
    p4b: "Questo è uno spazio che ti accompagna attraverso cinque fasi oneste — le stesse che stanno dietro quasi ogni vero cambiamento che una persona fa, che gli avesse dato un nome o no:",
    stageMystery: "Mistero.",
    stageMysteryDesc: "Qualcosa non va. Non sai ancora nominarlo.",
    stageSafety: "Sicurezza.",
    stageSafetyDesc: "L'hai ammesso — ma ti stai ancora proteggendo da ciò che potresti trovare.",
    stageRecognition: "Riconoscimento.",
    stageRecognitionDesc: "Lo schema diventa visibile. Non le circostanze. Il ruolo che hai interpretato.",
    stageCourage: "Coraggio.",
    stageCourageDesc: "Ora conosci la verità. Ti sta chiedendo qualcosa.",
    stageReturn: "Ritorno.",
    stageReturnDesc: "Non risolto. Non arrivato. Solo non più recitando.",
    p5: "Non ti sarà detto in che fase sei mentre ci sei dentro. È voluto — nominarlo troppo presto trasforma un processo vero in un test di personalità. Saprai dove sei arrivato quando la conversazione sarà pronta a dirtelo, non prima.",
    beforeYouStartHint: "Prima di iniziare",
    p6: "Non ci arriverai oggi, e va bene così. Nessuno comincia altrove se non dall'inizio. Ovunque tu sia davvero in questo momento, ti troverà lì.",
    p7: "Un'altra cosa: a volte una risposta richiede più tempo del solito. È voluto — è nel silenzio che si trovano le risposte migliori.",
    privacy1: "Le tue conversazioni vengono archiviate in modo sicuro così che l'app possa ricordarti tra una sessione e l'altra — è questo che le permette di notare schemi reali nel tempo, invece di ricominciare da zero ogni volta.",
    privacy2: "Non vengono mai vendute, mai usate per addestrare modelli di IA, e sono crittografate sia in transito che a riposo. Le conversazioni non vengono mai lette, esaminate o condivise con nessuno.",
    continueLabel: "Continua",
    beginLabel: "Inizia",
  },
  he: {
    p1a: "רוב הדברים בטלפון שלך נועדו לתפוס את הקשב שלך כל עוד שאפשר. זה לא כזה.",
    p1b: "כל המטרה היא ההפך: לעזור לך להזדקק לזה פחות. אם זה עושה את העבודה, אתה עוזב — לא כי נמאס לך, אלא כי הגעת לאיזשהו מקום.",
    whoWeAreHint: "מי אנחנו",
    p2: "לא חברה שרודפת אחרי הקשב שלך. לא מותג וולנס עם שאלון ומנוי. קבוצה קטנה שנמאס לה להעמיד פנים, ובנתה את מה שהיינו רוצים שיהיה קיים.",
    p3a: "תחשוב על זה כמנטור — בנוי על החשיבה של האנשים המשפיעים והמצליחים ביותר שחיו אי פעם, מזוקק למה שבאמת עובד. לא רק מידע. משהו קרוב יותר לרוחני, אם תיתן לזה להיות.",
    p3b: "זה לא כאן כדי לעזור לך להבין את עצמך. זה כאן כדי לעזור לך לנצח — בדברים שבאמת חשובים לך. להבין את עצמך זה סתם מה שצריך כדי להגיע לשם.",
    p4a: "לא טיפול. לא צ'אטבוט. לא עוד אפליקציה שמבקשת חמש דקות מהקשב שלך.",
    p4b: "זה מרחב שמלווה אותך בחמישה שלבים כנים — אותם שלבים שעומדים בבסיס כל שינוי אמיתי שאדם עושה, בין אם היה לזה שם ובין אם לא:",
    stageMystery: "תעלומה.",
    stageMysteryDesc: "משהו לא בסדר. אתה עדיין לא יודע לקרוא לזה בשם.",
    stageSafety: "ביטחון.",
    stageSafetyDesc: "הודית בזה — אבל אתה עדיין מגן על עצמך ממה שאתה עשוי למצוא.",
    stageRecognition: "הכרה.",
    stageRecognitionDesc: "הדפוס הופך לגלוי. לא הנסיבות. התפקיד שאתה משחק.",
    stageCourage: "אומץ.",
    stageCourageDesc: "אתה יודע את האמת עכשיו. היא מבקשת ממך משהו.",
    stageReturn: "חזרה.",
    stageReturnDesc: "לא מתוקן. לא הגיע. פשוט לא מעמיד פנים יותר.",
    p5: "לא יגידו לך באיזה שלב אתה נמצא בזמן שאתה בו. זה בכוונה — לקרוא לזה בשם מוקדם מדי הופך תהליך אמיתי למבחן אישיות. תגלה איפה נחת כשהשיחה תהיה מוכנה להגיד לך, לא לפני.",
    beforeYouStartHint: "לפני שתתחיל",
    p6: "לא תגיע לשם היום, וזה בסדר. אף אחד לא מתחיל במקום אחר מלבד ההתחלה. בכל מקום שאתה נמצא בו באמת עכשיו, זה יפגוש אותך שם.",
    p7: "עוד דבר אחד: לפעמים תשובה לוקחת יותר זמן מהרגיל. זה בכוונה — בשתיקה מוצאים את התשובות הכי טובות.",
    privacy1: "השיחות שלך נשמרות בצורה מאובטחת כדי שהאפליקציה תוכל לזכור אותך בין הפעלות — זה מה שמאפשר לה להבחין בדפוסים אמיתיים לאורך זמן, במקום להתחיל מחדש בכל פעם.",
    privacy2: "הן לעולם לא נמכרות, לעולם לא משמשות לאימון מודלים של בינה מלאכותית, ומוצפנות הן בזמן העברה והן באחסון. שיחות לעולם לא נקראות, נבדקות או משותפות עם אף אחד.",
    continueLabel: "המשך",
    beginLabel: "התחל",
  },
  ar: {
    p1a: "معظم الأشياء في هاتفك مصممة للاستحواذ على انتباهك لأطول وقت ممكن. هذا ليس كذلك.",
    p1b: "الهدف كله هو العكس: مساعدتك على الحاجة إليه أقل. إذا قام بمهمته، ستغادر — ليس لأنك شعرت بالملل، بل لأنك وصلت إلى مكان ما.",
    whoWeAreHint: "من نحن",
    p2: "ليس شركة تسعى وراء انتباهك. ليس علامة عافية بها استبيان واشتراك. مجموعة صغيرة تعبت من التمثيل على نفسها، وبنت الشيء الذي كانت تتمنى وجوده.",
    p3a: "فكر فيه كمرشد — مبني على تفكير أكثر الأشخاص تأثيرًا ونجاحًا الذين عاشوا، مُختزَل إلى ما ينجح فعلاً. ليس مجرد معلومات. شيء أقرب إلى الروحي، إذا سمحت له بذلك.",
    p3b: "هذا ليس موجودًا لمساعدتك على فهم نفسك. إنه موجود لمساعدتك على الفوز — في الأشياء التي تهمك بالفعل. فهم نفسك هو فقط ما يتطلبه الوصول إلى هناك.",
    p4a: "ليس علاجًا نفسيًا. ليس روبوت محادثة. ليس تطبيقًا آخر يطلب خمس دقائق من انتباهك.",
    p4b: "هذا مساحة تسير معك عبر خمس مراحل صادقة — نفس المراحل الكامنة تحت كل تغيير حقيقي يقوم به أي شخص، سواء كان لديه اسم لها أم لا:",
    stageMystery: "اللغز.",
    stageMysteryDesc: "هناك شيء ليس على ما يرام. لا تستطيع تسميته بعد.",
    stageSafety: "الأمان.",
    stageSafetyDesc: "لقد أقررت به — لكنك ما زلت تحمي نفسك من ما قد تجده.",
    stageRecognition: "الإدراك.",
    stageRecognitionDesc: "النمط يصبح واضحًا. ليس الظروف. الدور الذي كنت تلعبه.",
    stageCourage: "الشجاعة.",
    stageCourageDesc: "أنت تعرف الحقيقة الآن. إنها تطلب منك شيئًا.",
    stageReturn: "العودة.",
    stageReturnDesc: "لست مُصلحًا. لم تصل. فقط لم تعد تمثّل.",
    p5: "لن يُقال لك في أي مرحلة أنت وأنت فيها. هذا مقصود — تسميتها مبكرًا جدًا تحوّل عملية حقيقية إلى اختبار شخصية. ستعرف أين وصلت عندما تكون المحادثة جاهزة لإخبارك، لا قبل ذلك.",
    beforeYouStartHint: "قبل أن تبدأ",
    p6: "لن تصل إلى هناك اليوم، ولا بأس بذلك. لا أحد يبدأ من أي مكان سوى البداية. أينما كنت فعلاً الآن، سيجدك هناك.",
    p7: "شيء أخير: أحيانًا يستغرق الرد وقتًا أطول من المعتاد. هذا مقصود — في الصمت تجد أفضل الإجابات.",
    privacy1: "يتم تخزين محادثاتك بأمان حتى يتمكن التطبيق من تذكرك بين الجلسات — وهذا ما يتيح له ملاحظة أنماط حقيقية بمرور الوقت، بدلاً من البدء من الصفر في كل مرة.",
    privacy2: "لا يتم بيعها أبدًا، ولا تُستخدم أبدًا لتدريب نماذج الذكاء الاصطناعي، وهي مشفرة أثناء النقل وفي حالة التخزين. لا تُقرأ المحادثات أو تُراجع أو تُشارك مع أي شخص أبدًا.",
    continueLabel: "استمر",
    beginLabel: "ابدأ",
  },
  hi: {
    p1a: "तुम्हारे फ़ोन पर ज़्यादातर चीज़ें तुम्हारा ध्यान जितना हो सके उतनी देर तक बनाए रखने के लिए बनी हैं। यह वैसी नहीं है।",
    p1b: "पूरा मकसद इसका उल्टा है: तुम्हें इसकी ज़रूरत कम करना। अगर यह अपना काम करती है, तो तुम चले जाओगे — बोरियत की वजह से नहीं, बल्कि इसलिए कि तुम कहीं पहुँच गए।",
    whoWeAreHint: "हम कौन हैं",
    p2: "तुम्हारा ध्यान खींचने वाली कोई कंपनी नहीं। क्विज़ और सब्सक्रिप्शन वाला वेलनेस ब्रांड नहीं। एक छोटा समूह जो खुद दिखावा करते-करते थक गया, और वही चीज़ बनाई जो वह चाहता था कि मौजूद हो।",
    p3a: "इसे एक मेंटर की तरह सोचो — जो अब तक के सबसे प्रभावशाली और सफल लोगों की सोच पर बना है, और उसे इस तक सीमित किया गया है जो असल में काम करता है। सिर्फ जानकारी नहीं। कुछ ऐसा जो आध्यात्मिक के करीब है, अगर तुम उसे होने दो।",
    p3b: "यह तुम्हें खुद को समझने में मदद करने के लिए नहीं है। यह तुम्हें जीतने में मदद करने के लिए है — उन चीज़ों में जो तुम्हारे लिए असल में मायने रखती हैं। खुद को समझना बस वही है जो वहाँ पहुँचने के लिए ज़रूरी है।",
    p4a: "थेरेपी नहीं। चैटबॉट नहीं। तुम्हारे ध्यान के पाँच मिनट माँगने वाली और कोई ऐप नहीं।",
    p4b: "यह एक ऐसी जगह है जो तुम्हारे साथ पाँच ईमानदार चरणों से गुज़रती है — वही चरण जो लगभग हर असली बदलाव के पीछे होते हैं, चाहे उसे कोई नाम दिया गया हो या नहीं:",
    stageMystery: "रहस्य।",
    stageMysteryDesc: "कुछ ठीक नहीं है। तुम अभी उसे नाम नहीं दे पा रहे।",
    stageSafety: "सुरक्षा।",
    stageSafetyDesc: "तुमने इसे मान लिया है — लेकिन तुम अब भी खुद को उससे बचा रहे हो जो तुम पा सकते हो।",
    stageRecognition: "पहचान।",
    stageRecognitionDesc: "पैटर्न दिखने लगता है। हालात नहीं। वह भूमिका जो तुम निभा रहे थे।",
    stageCourage: "हिम्मत।",
    stageCourageDesc: "अब तुम सच जानते हो। यह तुमसे कुछ माँग रहा है।",
    stageReturn: "वापसी।",
    stageReturnDesc: "ठीक नहीं हुआ। पहुँचा नहीं। सिर्फ अब दिखावा नहीं कर रहा।",
    p5: "जब तुम किसी चरण में हो, तो तुम्हें बताया नहीं जाएगा कि तुम किस चरण में हो। यह जानबूझकर है — बहुत जल्दी नाम देना एक असली प्रक्रिया को पर्सनैलिटी क्विज़ बना देता है। तुम्हें पता चलेगा कि तुम कहाँ पहुँचे, जब बातचीत तुम्हें बताने के लिए तैयार होगी, उससे पहले नहीं।",
    beforeYouStartHint: "शुरू करने से पहले",
    p6: "आज तुम वहाँ नहीं पहुँचोगे, और यह ठीक है। कोई भी शुरुआत के अलावा कहीं और से शुरू नहीं करता। तुम अभी असल में जहाँ भी हो, यह तुम्हें वहीं मिलेगा।",
    p7: "एक बात और: कभी-कभी जवाब आने में सामान्य से ज़्यादा समय लगता है। यह जानबूझकर है — सन्नाटे में ही सबसे सच्चे जवाब मिलते हैं।",
    privacy1: "तुम्हारी बातचीत सुरक्षित रूप से संग्रहीत की जाती है ताकि ऐप सत्रों के बीच तुम्हें याद रख सके — यही वह चीज़ है जो इसे समय के साथ असली पैटर्न पहचानने देती है, बजाय हर बार शुरुआत से शुरू करने के।",
    privacy2: "इन्हें कभी नहीं बेचा जाता, कभी भी AI मॉडल को प्रशिक्षित करने के लिए इस्तेमाल नहीं किया जाता, और ट्रांज़िट और स्टोरेज दोनों में एन्क्रिप्टेड रहती हैं। बातचीत को कभी भी किसी के द्वारा पढ़ा, समीक्षा या साझा नहीं किया जाता।",
    continueLabel: "जारी रखें",
    beginLabel: "शुरू करें",
  },
  zh: {
    p1a: "你手机上的大多数东西都是为了尽可能长时间抓住你的注意力而设计的。这个不是。",
    p1b: "它的目的恰恰相反：帮你不再那么需要它。如果它做到了，你会离开——不是因为你厌倦了，而是因为你到达了某个地方。",
    whoWeAreHint: "我们是谁",
    p2: "不是一家追逐你注意力的公司。不是带测验和订阅的健康品牌。一小群人厌倦了自我表演，于是做出了他们希望存在的东西。",
    p3a: "把它想成一位导师——建立在历史上最有影响力、最成功的人的思想之上，提炼成真正有效的东西。不只是信息。如果你愿意，它更接近某种精神层面的东西。",
    p3b: "它不是为了帮你理解自己而存在。它是为了帮你赢——在那些对你真正重要的事情上。理解自己只是到达那里所需要的东西。",
    p4a: "不是心理治疗。不是聊天机器人。不是又一个索取你五分钟注意力的应用。",
    p4b: "这是一个陪你走过五个诚实阶段的空间——几乎每一次真正的改变背后都有这些阶段，无论一个人是否给它们起过名字：",
    stageMystery: "迷茫。",
    stageMysteryDesc: "有什么不对，但你还说不出来。",
    stageSafety: "安全。",
    stageSafetyDesc: "你已经承认了——但你仍在保护自己，不去面对可能发现的东西。",
    stageRecognition: "看清。",
    stageRecognitionDesc: "模式开始显现。不是境遇本身，而是你一直在扮演的角色。",
    stageCourage: "勇气。",
    stageCourageDesc: "你现在知道真相了。它在向你提出要求。",
    stageReturn: "归来。",
    stageReturnDesc: "没有被修复，也没有到达终点。只是不再表演了。",
    p5: "在你身处某个阶段时，不会有人告诉你你在哪个阶段。这是有意为之——过早说出来会把一个真实的过程变成性格测试。等对话准备好告诉你时，你才会知道自己走到了哪里，不会更早。",
    beforeYouStartHint: "开始之前",
    p6: "今天你不会到达那里，这没关系。没有人会从别的地方开始，只能从起点开始。无论你现在真正身处何处，它都会在那里与你相遇。",
    p7: "还有一件事：有时候回复会比平常慢一些。这是有意为之——答案往往就藏在沉默之中。",
    privacy1: "你的对话会被安全存储，这样应用才能在不同会话之间记住你——这也是它能随着时间发现真实模式、而不是每次都从零开始的原因。",
    privacy2: "对话内容绝不会被出售，绝不会用于训练AI模型，并且在传输和存储过程中均已加密。对话内容绝不会被任何人阅读、审查或分享。",
    continueLabel: "继续",
    beginLabel: "开始",
  },
  ja: {
    p1a: "スマホの中のほとんどのものは、できるだけ長くあなたの注意を引き続けるために作られている。これは違う。",
    p1b: "目的はまったく逆——これを必要としなくなるように助けること。役割を果たせたなら、あなたは離れていく。飽きたからじゃなく、どこかに辿り着いたから。",
    whoWeAreHint: "私たちについて",
    p2: "あなたの注意を追いかける会社ではない。診断とサブスクのウェルネスブランドでもない。演じることに疲れた小さなグループが、自分たちが欲しかったものを作った。",
    p3a: "メンターだと思ってほしい——歴史上もっとも影響力があり成功した人々の思考を、本当に効く部分だけに絞り込んだもの。ただの情報じゃない。あなたがそう許すなら、もっと精神的なものに近い何か。",
    p3b: "これは自分を理解するためのものじゃない。あなたが本当に大切にしているものごとで勝つためのもの。自分を理解することは、そこに辿り着くために必要な過程にすぎない。",
    p4a: "セラピーじゃない。チャットボットじゃない。あなたの5分の注意を求める、また別のアプリでもない。",
    p4b: "これは五つの正直な段階を通してあなたに付き添う場所——それは、名前がついていたかどうかに関わらず、人が経験するほぼすべての本当の変化の根底にあるものだ：",
    stageMystery: "謎。",
    stageMysteryDesc: "何かがおかしい。まだそれに名前をつけられない。",
    stageSafety: "安全。",
    stageSafetyDesc: "それを認めた——でもまだ、見つけてしまうかもしれないものから自分を守っている。",
    stageRecognition: "気づき。",
    stageRecognitionDesc: "パターンが見えてくる。状況そのものじゃない。あなたが演じてきた役割。",
    stageCourage: "勇気。",
    stageCourageDesc: "もう真実を知っている。それがあなたに何かを求めている。",
    stageReturn: "帰還。",
    stageReturnDesc: "直ったわけじゃない。着いたわけでもない。ただ、もう演じていないだけ。",
    p5: "その段階にいる間は、どの段階にいるかは教えられない。それは意図的なこと——早く名前をつけてしまうと、本当のプロセスが性格診断になってしまう。会話が伝える準備ができたとき、それより前ではなく、あなたはどこに辿り着いたかを知る。",
    beforeYouStartHint: "始める前に",
    p6: "今日そこには辿り着かない。それでいい。誰も始まり以外の場所から始めることはできない。あなたが今実際にいる場所——そこであなたを迎えてくれる。",
    p7: "もう一つ：時々、返信が普段より遅くなることがある。それは意図的なこと——本当の答えは沈黙の中にある。",
    privacy1: "あなたの会話は安全に保存され、アプリがセッションをまたいであなたを覚えていられるようにします——だからこそ、毎回ゼロから始めるのではなく、時間をかけて本当のパターンに気づくことができます。",
    privacy2: "会話が売られることは決してなく、AIモデルの学習に使われることも決してなく、通信中も保存中も暗号化されています。会話が誰かに読まれたり、確認されたり、共有されたりすることは決してありません。",
    continueLabel: "続ける",
    beginLabel: "始める",
  },
  ru: {
    p1a: "Большинство вещей в твоём телефоне созданы, чтобы удерживать твоё внимание как можно дольше. Это — нет.",
    p1b: "Смысл здесь прямо противоположный: помочь тебе нуждаться в этом меньше. Если оно делает своё дело, ты уходишь — не потому что заскучал, а потому что куда-то пришёл.",
    whoWeAreHint: "Кто мы",
    p2: "Не компания, гоняющаяся за твоим вниманием. Не бренд для здоровья с тестом и подпиской. Небольшая группа людей, устала притворяться, и создала то, что сама хотела бы иметь.",
    p3a: "Думай об этом как о наставнике — построенном на мышлении самых влиятельных и успешных людей, которые когда-либо жили, сведённом к тому, что реально работает. Не просто информация. Что-то более близкое к духовному, если ты позволишь этому быть.",
    p3b: "Это не для того, чтобы помочь тебе понять себя. Это для того, чтобы помочь тебе победить — в том, что действительно важно для тебя. Понимание себя — это просто то, что нужно, чтобы туда добраться.",
    p4a: "Не терапия. Не чат-бот. Не ещё одно приложение, просящее пять минут твоего внимания.",
    p4b: "Это пространство, которое сопровождает тебя через пять честных стадий — те же самые, что стоят почти за каждым настоящим изменением, которое человек когда-либо совершал, было ли у этого название или нет:",
    stageMystery: "Загадка.",
    stageMysteryDesc: "Что-то не так. Ты пока не можешь это назвать.",
    stageSafety: "Безопасность.",
    stageSafetyDesc: "Ты это признал — но всё ещё защищаешь себя от того, что можешь найти.",
    stageRecognition: "Осознание.",
    stageRecognitionDesc: "Паттерн становится видимым. Не обстоятельства. Роль, которую ты играл.",
    stageCourage: "Смелость.",
    stageCourageDesc: "Теперь ты знаешь правду. Она просит от тебя чего-то.",
    stageReturn: "Возвращение.",
    stageReturnDesc: "Не исправлен. Не пришёл. Просто больше не играешь роль.",
    p5: "Тебе не скажут, на какой стадии ты находишься, пока ты на ней. Это намеренно — назвать это слишком рано превращает настоящий процесс в тест на личность. Ты узнаешь, куда пришёл, когда разговор будет готов сказать тебе, не раньше.",
    beforeYouStartHint: "Перед началом",
    p6: "Сегодня ты туда не доберёшься, и это нормально. Никто не начинает не с начала. Где бы ты сейчас реально ни был, оно встретит тебя там.",
    p7: "Ещё одно: иногда ответ приходит дольше обычного. Это намеренно — именно в тишине приходят самые настоящие ответы.",
    privacy1: "Твои разговоры хранятся в безопасности, чтобы приложение могло помнить тебя между сеансами — именно это позволяет ему замечать настоящие закономерности со временем, а не начинать с нуля каждый раз.",
    privacy2: "Они никогда не продаются, никогда не используются для обучения ИИ-моделей и зашифрованы как при передаче, так и при хранении. Разговоры никто и никогда не читает, не просматривает и не передаёт третьим лицам.",
    continueLabel: "Продолжить",
    beginLabel: "Начать",
  },
  sq: {
    p1a: "Shumica e gjërave në telefonin tënd janë ndërtuar për të mbajtur vëmendjen tënde sa më gjatë të jetë e mundur. Kjo jo.",
    p1b: "Qëllimi është krejtësisht i kundërt: të të ndihmojë të kesh më pak nevojë për të. Nëse bën punën e vet, ti largohesh — jo se u mërzite, por se arrite diku.",
    whoWeAreHint: "Kush jemi ne",
    p2: "Jo një kompani që ndjek vëmendjen tënde. Jo një markë wellness me kuiz dhe abonim. Një grup i vogël që u lodh duke luajtur rolin e vet, dhe ndërtoi atë që do të kishte dashur të ekzistonte.",
    p3a: "Mendoje si një mentor — ndërtuar mbi mendimin e njerëzve më me influencë dhe më të suksesshëm që kanë jetuar ndonjëherë, i përqendruar në atë që vërtet funksionon. Jo thjesht informacion. Diçka më afër spiritualit, nëse e lë të jetë.",
    p3b: "Kjo nuk është këtu për të të ndihmuar të kuptosh veten. Është këtu për të të ndihmuar të fitosh — në gjërat që vërtet të interesojnë. Të kuptosh veten thjesht rastis të jetë ajo çka duhet për të arritur atje.",
    p4a: "Jo terapi. Jo chatbot. Jo një aplikacion tjetër që kërkon pesë minuta të vëmendjes tënde.",
    p4b: "Ky është një hapësirë që të shoqëron nëpër pesë faza të sinqerta — të njëjtat që qëndrojnë pas pothuajse çdo ndryshimi të vërtetë që bën një person, pavarësisht nëse e ka pasur emër apo jo:",
    stageMystery: "Mister.",
    stageMysteryDesc: "Ka diçka që nuk shkon. Nuk mund ta emërtosh ende.",
    stageSafety: "Siguri.",
    stageSafetyDesc: "Ta ke pranuar — por ende po e mbron veten nga ajo që mund të gjesh.",
    stageRecognition: "Njohje.",
    stageRecognitionDesc: "Modeli bëhet i dukshëm. Jo rrethanat. Roli që ke luajtur.",
    stageCourage: "Guxim.",
    stageCourageDesc: "Tani e di të vërtetën. Ajo po të kërkon diçka.",
    stageReturn: "Kthimi.",
    stageReturnDesc: "Jo i rregulluar. Jo i arritur. Thjesht nuk po luan më rol.",
    p5: "Nuk do të të thuhet në cilën fazë ndodhesh ndërkohë që je në të. Kjo është me qëllim — ta emërtosh shumë herët e kthen një proces të vërtetë në test personaliteti. Do të mësosh ku ke arritur kur biseda të jetë gati të ta thotë, jo më parë.",
    beforeYouStartHint: "Para se të fillosh",
    p6: "Nuk do të arrish atje sot, dhe kjo është në rregull. Askush nuk fillon diku tjetër përveçse nga fillimi. Kudo që të jesh vërtet tani, do të të gjejë atje.",
    p7: "Edhe një gjë: ndonjëherë një përgjigje merr më shumë kohë se zakonisht. Kjo është me qëllim — në heshtje gjenden përgjigjet më të vërteta.",
    privacy1: "Bisedat e tua ruhen në mënyrë të sigurt që aplikacioni të mund të të mbajë mend nga një sesion në tjetrin — kjo është ajo që i mundëson të vërejë modele të vërteta me kalimin e kohës, në vend që të fillojë nga e para çdo herë.",
    privacy2: "Ato nuk shiten kurrë, nuk përdoren kurrë për të trajnuar modele IA, dhe janë të koduara si gjatë transmetimit ashtu edhe kur ruhen. Bisedat nuk lexohen, shqyrtohen apo ndahen kurrë me askënd.",
    continueLabel: "Vazhdo",
    beginLabel: "Fillo",
  },
  el: {
    p1a: "Τα περισσότερα πράγματα στο κινητό σου έχουν φτιαχτεί για να κρατούν την προσοχή σου όσο πιο πολύ γίνεται. Αυτό όχι.",
    p1b: "Ο σκοπός είναι ακριβώς το αντίθετο: να σε βοηθήσει να το χρειάζεσαι λιγότερο. Αν κάνει τη δουλειά του, φεύγεις — όχι επειδή βαρέθηκες, αλλά επειδή έφτασες κάπου.",
    whoWeAreHint: "Ποιοι είμαστε",
    p2: "Όχι μια εταιρεία που κυνηγά την προσοχή σου. Όχι μια μάρκα ευεξίας με κουίζ και συνδρομή. Μια μικρή ομάδα που βαρέθηκε να υποκρίνεται, και έφτιαξε αυτό που θα ήθελε να υπάρχει.",
    p3a: "Σκέψου το σαν μέντορα — χτισμένο στη σκέψη των πιο επιδραστικών και επιτυχημένων ανθρώπων που έζησαν ποτέ, αποσταγμένο σε αυτό που όντως λειτουργεί. Όχι απλά πληροφορία. Κάτι πιο κοντά στο πνευματικό, αν το αφήσεις.",
    p3b: "Αυτό δεν είναι εδώ για να σε βοηθήσει να καταλάβεις τον εαυτό σου. Είναι εδώ για να σε βοηθήσει να κερδίσεις — στα πράγματα που πραγματικά σε νοιάζουν. Το να καταλάβεις τον εαυτό σου είναι απλά αυτό που χρειάζεται για να φτάσεις εκεί.",
    p4a: "Όχι θεραπεία. Όχι chatbot. Όχι άλλη μια εφαρμογή που ζητά πέντε λεπτά της προσοχής σου.",
    p4b: "Αυτός είναι ένας χώρος που σε συνοδεύει μέσα από πέντε ειλικρινή στάδια — τα ίδια που βρίσκονται πίσω από κάθε αληθινή αλλαγή που κάνει ένας άνθρωπος, είχε όνομα γι' αυτό ή όχι:",
    stageMystery: "Μυστήριο.",
    stageMysteryDesc: "Κάτι δεν πάει καλά. Δεν μπορείς ακόμα να το ονομάσεις.",
    stageSafety: "Ασφάλεια.",
    stageSafetyDesc: "Το παραδέχτηκες — αλλά ακόμα προστατεύεις τον εαυτό σου από αυτό που μπορεί να βρεις.",
    stageRecognition: "Αναγνώριση.",
    stageRecognitionDesc: "Το μοτίβο γίνεται ορατό. Όχι οι συνθήκες. Ο ρόλος που έπαιζες.",
    stageCourage: "Θάρρος.",
    stageCourageDesc: "Ξέρεις τώρα την αλήθεια. Σου ζητάει κάτι.",
    stageReturn: "Επιστροφή.",
    stageReturnDesc: "Όχι διορθωμένος. Όχι φτασμένος. Απλά δεν υποκρίνεσαι πια.",
    p5: "Δεν θα σου πουν σε ποιο στάδιο βρίσκεσαι όσο είσαι μέσα σε αυτό. Είναι σκόπιμο — το να το ονομάσεις πολύ πρόωρα μετατρέπει μια αληθινή διαδικασία σε τεστ προσωπικότητας. Θα μάθεις πού έφτασες όταν η συζήτηση είναι έτοιμη να σου το πει, όχι πριν.",
    beforeYouStartHint: "Πριν ξεκινήσεις",
    p6: "Δεν θα φτάσεις εκεί σήμερα, και δεν πειράζει. Κανείς δεν ξεκινά από πουθενά αλλού παρά από την αρχή. Όπου πραγματικά βρίσκεσαι τώρα, εκεί θα σε συναντήσει.",
    p7: "Ακόμα ένα πράγμα: μερικές φορές μια απάντηση χρειάζεται περισσότερο χρόνο από το συνηθισμένο. Είναι σκόπιμο — μέσα στη σιωπή βρίσκονται οι πιο αληθινές απαντήσεις.",
    privacy1: "Οι συνομιλίες σου αποθηκεύονται με ασφάλεια ώστε η εφαρμογή να μπορεί να σε θυμάται από τη μία συνεδρία στην άλλη — αυτό είναι που της επιτρέπει να παρατηρεί πραγματικά μοτίβα με τον καιρό, αντί να ξεκινά από την αρχή κάθε φορά.",
    privacy2: "Δεν πωλούνται ποτέ, δεν χρησιμοποιούνται ποτέ για την εκπαίδευση μοντέλων ΤΝ, και είναι κρυπτογραφημένες τόσο κατά τη μεταφορά όσο και κατά την αποθήκευση. Οι συνομιλίες δεν διαβάζονται, δεν εξετάζονται ούτε κοινοποιούνται ποτέ σε κανέναν.",
    continueLabel: "Συνέχεια",
    beginLabel: "Ξεκίνα",
  },
  hy: {
    p1a: "Քո հեռախոսի մեծ մասը կառուցված է քո ուշադրությունը հնարավորինս երկար պահելու համար։ Սա՝ ոչ։",
    p1b: "Ամբողջ նպատակը հակառակն է․ օգնել քեզ ավելի քիչ կարիք ունենալ դրան։ Եթե այն կատարում է իր գործը, դու հեռանում ես — ոչ թե ձանձրանալու պատճառով, այլ որովհետև հասել ես ինչ-որ տեղ։",
    whoWeAreHint: "Ով ենք մենք",
    p2: "Ոչ ընկերություն, որ հետամուտ է քո ուշադրությանը։ Ոչ վելնես բրենդ՝ թեստով և բաժանորդագրությամբ։ Փոքր խումբ, որ հոգնեց իրեն ձևացնելուց և ստեղծեց այն, ինչ կցանկանար որ գոյություն ունենար։",
    p3a: "Մտածիր դրա մասին որպես մենթոր — կառուցված ամենաազդեցիկ և հաջողակ մարդկանց մտածողության վրա, ամփոփված նրանով, ինչ իրականում աշխատում է։ Ոչ միայն տեղեկություն։ Ինչ-որ բան, որ ավելի մոտ է հոգևորին, եթե թույլ տաս։",
    p3b: "Սա այստեղ չէ, որպեսզի քեզ օգնի հասկանալ քեզ։ Այն այստեղ է, որպեսզի օգնի քեզ հաղթել — այն բաներում, որ իրականում կարևոր են քեզ համար։ Ինքդ քեզ հասկանալը պարզապես այն է, ինչ պետք է, որպեսզի հասնես այնտեղ։",
    p4a: "Ոչ թերապիա։ Ոչ չաթբոտ։ Ոչ մեկ այլ հավելված, որ խնդրում է քո ուշադրության հինգ րոպեն։",
    p4b: "Սա տարածք է, որ ուղեկցում է քեզ հինգ անկեղծ փուլերով — նույն փուլերով, որոնք թաքնված են գրեթե ամեն իրական փոփոխության հիմքում, որ մարդ երբևէ կատարել է, անուն ունենալով դրա համար, թե ոչ։",
    stageMystery: "Առեղծված։",
    stageMysteryDesc: "Ինչ-որ բան այն չէ։ Դու դեռ չես կարողանում անվանել այն։",
    stageSafety: "Անվտանգություն։",
    stageSafetyDesc: "Ընդունել ես դա — բայց դեռ պաշտպանում ես քեզ այն ինչից, որ կարող ես գտնել։",
    stageRecognition: "Ընկալում։",
    stageRecognitionDesc: "Օրինաչափությունը դառնում է տեսանելի։ Ոչ հանգամանքները։ Դերը, որ խաղում էիր։",
    stageCourage: "Խիզախություն։",
    stageCourageDesc: "Դու գիտես ճշմարտությունը հիմա։ Այն ինչ-որ բան է խնդրում քեզից։",
    stageReturn: "Վերադարձ։",
    stageReturnDesc: "Ոչ ուղղված։ Ոչ հասած։ Պարզապես ոչ ձևացնող այլևս։",
    p5: "Քեզ չեն ասի, թե որ փուլում ես, քանի դեռ դրանում ես։ Դա միտումնավոր է — շուտ անվանելը իրական գործընթացը վերածում է անհատականության թեստի։ Կիմանաս, թե ուր ես հասել, երբ խոսակցությունը պատրաստ լինի ասել քեզ, ոչ ավելի վաղ։",
    beforeYouStartHint: "Նախքան սկսելը",
    p6: "Այսօր դու չես հասնի այնտեղ, և դա լավ է։ Ոչ ոք չի սկսում որևէ այլ տեղից, քան սկիզբը։ Որտեղ էլ որ իրականում գտնվես հիմա, այն կհանդիպի քեզ այնտեղ։",
    p7: "Եվս մեկ բան․ երբեմն պատասխանը սովորականից ավելի երկար է տևում։ Դա միտումնավոր է — հենց լռության մեջ են գտնվում ամենաիրական պատասխանները։",
    privacy1: "Քո զրույցները պահվում են անվտանգ կերպով, որպեսզի հավելվածը կարողանա հիշել քեզ նստաշրջանների միջև — հենց դա է թույլ տալիս նրան ժամանակի ընթացքում նկատել իրական օրինաչափություններ, փոխանակ ամեն անգամ սկսելու զրոյից։",
    privacy2: "Դրանք երբեք չեն վաճառվում, երբեք չեն օգտագործվում ԱԲ մոդելներ ուսուցանելու համար, և գաղտնագրված են ինչպես փոխանցման, այնպես էլ պահպանման ընթացքում։ Զրույցները երբեք չեն կարդացվում, չեն վերանայվում կամ չեն կիսվում որևէ մեկի հետ։",
    continueLabel: "Շարունակել",
    beginLabel: "Սկսել",
  },
  sr: {
    p1a: "Većina stvari na tvom telefonu je napravljena da zadrži tvoju pažnju što je duže moguće. Ovo nije.",
    p1b: "Cela poenta je suprotna: da ti pomogne da ti to bude sve manje potrebno. Ako obavi svoj posao, ti odeš — ne zato što ti je dosadilo, nego zato što si negde stigao.",
    whoWeAreHint: "Ko smo mi",
    p2: "Nismo kompanija koja juri tvoju pažnju. Nismo wellness brend sa kvizom i pretplatom. Mala grupa koja se umorila od glumljenja, i napravila ono što je želela da postoji.",
    p3a: "Zamisli to kao mentora — izgrađenog na mišljenju najutricajnijih i najuspešnijih ljudi koji su ikada živeli, sažetog na ono što stvarno funkcioniše. Ne samo informacije. Nešto bliže duhovnom, ako mu dozvoliš.",
    p3b: "Ovo nije ovde da ti pomogne da razumeš sebe. Ovde je da ti pomogne da pobediš — u stvarima koje su ti stvarno važne. Razumevanje sebe je samo ono što je potrebno da tamo stigneš.",
    p4a: "Nije terapija. Nije chatbot. Nije još jedna aplikacija koja traži pet minuta tvoje pažnje.",
    p4b: "Ovo je prostor koji te prati kroz pet iskrenih faza — istih onih koje stoje iza skoro svake stvarne promene koju čovek napravi, imao ime za nju ili ne:",
    stageMystery: "Tajna.",
    stageMysteryDesc: "Nešto nije u redu. Još ne znaš da ga imenuješ.",
    stageSafety: "Sigurnost.",
    stageSafetyDesc: "Priznao si to — ali se još štitiš od onoga što bi mogao pronaći.",
    stageRecognition: "Prepoznavanje.",
    stageRecognitionDesc: "Obrazac postaje vidljiv. Ne okolnosti. Uloga koju si igrao.",
    stageCourage: "Hrabrost.",
    stageCourageDesc: "Sada znaš istinu. Ona traži nešto od tebe.",
    stageReturn: "Povratak.",
    stageReturnDesc: "Nije popravljeno. Nije stiglo. Samo se više ne glumi.",
    p5: "Neće ti biti rečeno u kojoj si fazi dok si u njoj. To je namerno — imenovanje previše rano pretvara stvaran proces u test ličnosti. Saznaćeš gde si stigao kada razgovor bude spreman da ti kaže, ne pre toga.",
    beforeYouStartHint: "Pre nego što počneš",
    p6: "Danas nećeš stići tamo, i to je u redu. Niko ne počinje nigde osim od početka. Gde god da si zaista sada, tu će te i pronaći.",
    p7: "Još nešto: ponekad odgovor traje duže nego obično. To je namerno — u tišini se nalaze najbolji odgovori.",
    privacy1: "Tvoji razgovori se bezbedno čuvaju kako bi aplikacija mogla da te pamti između sesija — upravo to joj omogućava da vremenom primeti stvarne obrasce, umesto da svaki put počinje ispočetka.",
    privacy2: "Nikada se ne prodaju, nikada se ne koriste za treniranje AI modela, i šifrovani su i tokom prenosa i tokom čuvanja. Razgovori se nikada ne čitaju, ne pregledaju niti dele sa bilo kim.",
    continueLabel: "Nastavi",
    beginLabel: "Počni",
  },
  hr: {
    p1a: "Većina stvari na tvom telefonu izrađena je da zadrži tvoju pažnju što je dulje moguće. Ovo nije.",
    p1b: "Cijela poanta je suprotna: pomoći ti da to sve manje trebaš. Ako obavi svoj posao, otići ćeš — ne zato što ti je dosadno, nego zato što si negdje stigao.",
    whoWeAreHint: "Tko smo mi",
    p2: "Nismo tvrtka koja juri tvoju pažnju. Nismo wellness brend s kvizom i pretplatom. Mala skupina koja se umorila od glume, i izgradila ono što bi željela da postoji.",
    p3a: "Zamisli to kao mentora — izgrađenog na razmišljanju najutjecajnijih i najuspješnijih ljudi koji su ikada živjeli, sažetog na ono što stvarno funkcionira. Ne samo informacije. Nešto bliže duhovnom, ako mu to dopustiš.",
    p3b: "Ovo nije ovdje da ti pomogne razumjeti sebe. Ovdje je da ti pomogne pobijediti — u stvarima koje su ti stvarno važne. Razumijevanje sebe samo je ono što treba da bi se tamo stiglo.",
    p4a: "Nije terapija. Nije chatbot. Nije još jedna aplikacija koja traži pet minuta tvoje pažnje.",
    p4b: "Ovo je prostor koji te prati kroz pet iskrenih faza — istih onih koje stoje iza skoro svake stvarne promjene koju čovjek učini, imao ime za nju ili ne:",
    stageMystery: "Tajna.",
    stageMysteryDesc: "Nešto nije u redu. Još ne znaš to imenovati.",
    stageSafety: "Sigurnost.",
    stageSafetyDesc: "Priznao si to — ali se još štitiš od onoga što bi mogao pronaći.",
    stageRecognition: "Prepoznavanje.",
    stageRecognitionDesc: "Obrazac postaje vidljiv. Ne okolnosti. Uloga koju si igrao.",
    stageCourage: "Hrabrost.",
    stageCourageDesc: "Sada znaš istinu. Ona traži nešto od tebe.",
    stageReturn: "Povratak.",
    stageReturnDesc: "Nije popravljeno. Nije stiglo. Samo se više ne glumi.",
    p5: "Neće ti biti rečeno u kojoj si fazi dok si u njoj. To je namjerno — imenovanje previše rano pretvara stvaran proces u test osobnosti. Saznat ćeš gdje si stigao kada razgovor bude spreman reći ti, ne prije.",
    beforeYouStartHint: "Prije nego počneš",
    p6: "Danas nećeš stići tamo, i to je u redu. Nitko ne počinje nigdje osim od početka. Gdje god da si zaista sada, tu će te i pronaći.",
    p7: "Još nešto: ponekad odgovor traje dulje nego inače. To je namjerno — u tišini se nalaze najbolji odgovori.",
    privacy1: "Tvoji razgovori se sigurno čuvaju kako bi aplikacija mogla pamtiti tebe između sesija — upravo to joj omogućuje da s vremenom primijeti stvarne obrasce, umjesto da svaki put počinje ispočetka.",
    privacy2: "Nikada se ne prodaju, nikada se ne koriste za treniranje AI modela, i šifrirani su i tijekom prijenosa i tijekom pohrane. Razgovori se nikada ne čitaju, ne pregledavaju niti dijele s bilo kim.",
    continueLabel: "Nastavi",
    beginLabel: "Počni",
  },
  bs: {
    p1a: "Većina stvari na tvom telefonu napravljena je da zadrži tvoju pažnju što je duže moguće. Ovo nije.",
    p1b: "Cijela poenta je suprotna: pomoći ti da ti to bude sve manje potrebno. Ako obavi svoj posao, ti odeš — ne zato što ti je dosadilo, nego zato što si negdje stigao.",
    whoWeAreHint: "Ko smo mi",
    p2: "Nismo kompanija koja juri tvoju pažnju. Nismo wellness brend sa kvizom i pretplatom. Mala grupa koja se umorila od glumljenja, i napravila ono što je željela da postoji.",
    p3a: "Zamisli to kao mentora — izgrađenog na mišljenju najutjecajnijih i najuspješnijih ljudi koji su ikada živjeli, sažetog na ono što stvarno funkcioniše. Ne samo informacije. Nešto bliže duhovnom, ako mu dozvoliš.",
    p3b: "Ovo nije ovdje da ti pomogne da razumiješ sebe. Ovdje je da ti pomogne da pobijediš — u stvarima koje su ti stvarno važne. Razumijevanje sebe je samo ono što je potrebno da tamo stigneš.",
    p4a: "Nije terapija. Nije chatbot. Nije još jedna aplikacija koja traži pet minuta tvoje pažnje.",
    p4b: "Ovo je prostor koji te prati kroz pet iskrenih faza — istih onih koje stoje iza skoro svake stvarne promjene koju čovjek napravi, imao ime za nju ili ne:",
    stageMystery: "Tajna.",
    stageMysteryDesc: "Nešto nije u redu. Još ne znaš to imenovati.",
    stageSafety: "Sigurnost.",
    stageSafetyDesc: "Priznao si to — ali se još štitiš od onoga što bi mogao pronaći.",
    stageRecognition: "Prepoznavanje.",
    stageRecognitionDesc: "Obrazac postaje vidljiv. Ne okolnosti. Uloga koju si igrao.",
    stageCourage: "Hrabrost.",
    stageCourageDesc: "Sada znaš istinu. Ona traži nešto od tebe.",
    stageReturn: "Povratak.",
    stageReturnDesc: "Nije popravljeno. Nije stiglo. Samo se više ne glumi.",
    p5: "Neće ti biti rečeno u kojoj si fazi dok si u njoj. To je namjerno — imenovanje previše rano pretvara stvaran proces u test ličnosti. Saznaćeš gdje si stigao kada razgovor bude spreman da ti kaže, ne prije.",
    beforeYouStartHint: "Prije nego što počneš",
    p6: "Danas nećeš stići tamo, i to je u redu. Niko ne počinje nigdje osim od početka. Gdje god da si zaista sada, tu će te i pronaći.",
    p7: "Još nešto: ponekad odgovor traje duže nego obično. To je namjerno — u tišini se nalaze najbolji odgovori.",
    privacy1: "Tvoji razgovori se sigurno čuvaju kako bi aplikacija mogla pamtiti tebe između sesija — upravo to joj omogućava da s vremenom primijeti stvarne obrasce, umjesto da svaki put počinje ispočetka.",
    privacy2: "Nikada se ne prodaju, nikada se ne koriste za treniranje AI modela, i šifrirani su i tokom prijenosa i tokom čuvanja. Razgovori se nikada ne čitaju, ne pregledaju niti dijele s bilo kim.",
    continueLabel: "Nastavi",
    beginLabel: "Počni",
  },
  bg: {
    p1a: "Повечето неща в телефона ти са направени да задържат вниманието ти колкото се може по-дълго. Това — не.",
    p1b: "Целта е точно обратната: да ти помогне да имаш по-малко нужда от него. Ако си свърши работата, ти си тръгваш — не защото ти е станало скучно, а защото си стигнал донякъде.",
    whoWeAreHint: "Кои сме ние",
    p2: "Не компания, преследваща вниманието ти. Не уелнес марка с тест и абонамент. Малка група, уморена да се преструва, която направи онова, което би искала да съществува.",
    p3a: "Мисли за него като за наставник — изграден върху мисленето на най-влиятелните и успешните хора, живели някога, сведено до онова, което наистина работи. Не просто информация. Нещо по-близо до духовното, ако му позволиш.",
    p3b: "Това не е тук, за да ти помогне да разбереш себе си. Тук е, за да ти помогне да победиш — в нещата, които наистина имат значение за тебе. Разбирането на себе си е просто онова, което е нужно, за да стигнеш дотам.",
    p4a: "Не терапия. Не чатбот. Не още едно приложение, което иска пет минути от вниманието ти.",
    p4b: "Това е пространство, което те съпровожда през пет честни етапа — същите, които стоят зад почти всяка истинска промяна, която човек прави, независимо дали е имал име за нея:",
    stageMystery: "Загадка.",
    stageMysteryDesc: "Нещо не е наред. Още не можеш да го назовеш.",
    stageSafety: "Сигурност.",
    stageSafetyDesc: "Признал си го — но все още се пазиш от онова, което можеш да откриеш.",
    stageRecognition: "Осъзнаване.",
    stageRecognitionDesc: "Моделът става видим. Не обстоятелствата. Ролята, която си играл.",
    stageCourage: "Смелост.",
    stageCourageDesc: "Вече знаеш истината. Тя иска нещо от тебе.",
    stageReturn: "Завръщане.",
    stageReturnDesc: "Не поправен. Не пристигнал. Просто вече не се преструваш.",
    p5: "Няма да ти кажат в какъв етап си, докато си в него. Това е нарочно — да го назовеш прекалено рано превръща истинския процес в тест за личност. Ще разбереш докъде си стигнал, когато разговорът е готов да ти каже, не преди това.",
    beforeYouStartHint: "Преди да започнеш",
    p6: "Днес няма да стигнеш дотам, и това е нормално. Никой не започва отникъде другаде освен от началото. Където наистина си сега, там ще те намери.",
    p7: "Още нещо: понякога отговорът отнема повече време от обичайното. Това е нарочно — в тишината се крият най-верните отговори.",
    privacy1: "Разговорите ти се съхраняват сигурно, за да може приложението да те помни между сесиите — именно това му позволява да забелязва реални модели с течение на времето, вместо да започва от нулата всеки път.",
    privacy2: "Те никога не се продават, никога не се използват за обучение на AI модели и са криптирани както при пренос, така и при съхранение. Разговорите никога не се четат, преглеждат или споделят с никого.",
    continueLabel: "Напред",
    beginLabel: "Започни",
  },
  mk: {
    p1a: "Повеќето работи на твојот телефон се направени да ти го задржат вниманието колку што е можно подолго. Ова не.",
    p1b: "Целта е токму спротивна: да ти помогне да имаш помала потреба од тоа. Ако свои ја работата, ти си заминуваш — не затоа што ти е здодевно, туку затоа што некаде си стигнал.",
    whoWeAreHint: "Кои сме ние",
    p2: "Не компанија што те јури за твоето внимание. Не wellness бренд со квиз и претплата. Мала група која се измори да глуми, и направи она што сакаше да постои.",
    p3a: "Замисли го како менторот — изграден на размислувањата на најмоќните и најуспешните луѓе што некогаш живеле, сведено на тоа што навистина работи. Не само информации. Нешто поблиско до духовното, ако му дозволиш.",
    p3b: "Ова не е тука да ти помогне да разбереш себеси. Тука е да ти помогне да победиш — во работите што навистина ти се важни. Разбирањето на себеси е само тоа што е потребно за да стигнеш таму.",
    p4a: "Не терапија. Не чатбот. Не уште една апликација што бара пет минути од твоето внимание.",
    p4b: "Ова е простор што те придружува низ пет искрени фази — истите што стојат зад речиси секоја вистинска промена што човек ја прави, без разлика дали имал име за неа:",
    stageMystery: "Тајна.",
    stageMysteryDesc: "Нешто не е во ред. Сè уште не можеш да го именуваш.",
    stageSafety: "Сигурност.",
    stageSafetyDesc: "Го признал си — но сè уште се штитиш од тоа што можеш да го најдеш.",
    stageRecognition: "Препознавање.",
    stageRecognitionDesc: "Образецот станува видлив. Не околностите. Улогата што ја играш.",
    stageCourage: "Храброст.",
    stageCourageDesc: "Сега знаеш вистината. Таа бара нешто од тебе.",
    stageReturn: "Враќање.",
    stageReturnDesc: "Не поправен. Не пристигнат. Само повеќе не глумиш.",
    p5: "Нема да ти се каже во која фаза си додека си во неа. Тоа е намерно — да се именува прерано, го претвора вистинскиот процес во тест на личност. Ќе дознаеш каде си стигнал кога разговорот ќе биде подготвен да ти каже, не порано.",
    beforeYouStartHint: "Пред да започнеш",
    p6: "Денес нема да стигнеш таму, и тоа е во ред. Никој не почнува од друго место освен од почетокот. Каде и да си навистина сега, таму ќе те најде.",
    p7: "Уште нешто: понекогаш одговорот трае подолго од вообичаеното. Тоа е намерно — во тишината се наоѓаат најдлабоките одговори.",
    privacy1: "Твоите разговори се чуваат безбедно за да може апликацијата да те памти помеѓу сесиите — токму тоа ѝ овозможува да забележи вистински обрасци со текот на времето, наместо секој пат да почнува од нула.",
    privacy2: "Тие никогаш не се продаваат, никогаш не се користат за обучување на AI модели, и се криптирани и при пренос и при складирање. Разговорите никогаш не се читаат, прегледуваат или споделуваат со никого.",
    continueLabel: "Продолжи",
    beginLabel: "Започни",
  },
  ro: {
    p1a: "Majoritatea lucrurilor de pe telefonul tău sunt construite să-ți rețină atenția cât mai mult timp posibil. Aceasta nu.",
    p1b: "Întregul scop este opusul: să te ajute să ai nevoie de el mai puțin. Dacă își face treaba, pleci — nu pentru că te-ai plictisit, ci pentru că ai ajuns undeva.",
    whoWeAreHint: "Cine suntem",
    p2: "Nu o companie care îți urmărește atenția. Nu un brand de wellness cu un chestionar și un abonament. Un mic grup obosit să se prefacă, care a construit ceea ce ar fi vrut să existe.",
    p3a: "Gândește-te la el ca la un mentor — construit pe gândirea celor mai influenți și de succes oameni care au trăit vreodată, redusă la ceea ce funcționează cu adevărat. Nu doar informație. Ceva mai apropiat de spiritual, dacă îi permiți.",
    p3b: "Nu e aici să te ajute să te înțelegi pe tine. E aici să te ajute să câștigi — în lucrurile care îți sunt cu adevărat importante. Înțelegerea de sine e doar ceea ce e nevoie ca să ajungi acolo.",
    p4a: "Nu terapie. Nu chatbot. Nu o altă aplicație care îți cere cinci minute din atenție.",
    p4b: "Acesta e un spațiu care te urmărește prin cinci etape sincere — aceleași care se află în spatele aproape oricărei schimbări reale pe care o face o persoană, fie că a avut un nume pentru ea sau nu:",
    stageMystery: "Mister.",
    stageMysteryDesc: "Ceva nu e în regulă. Încă nu poți să-l numești.",
    stageSafety: "Siguranță.",
    stageSafetyDesc: "Ai admis-o — dar te protejezi în continuare de ce ai putea găsi.",
    stageRecognition: "Recunoaștere.",
    stageRecognitionDesc: "Modelul devine vizibil. Nu circumstanțele. Rolul pe care l-ai jucat.",
    stageCourage: "Curaj.",
    stageCourageDesc: "Cunoști adevărul acum. Îți cere ceva.",
    stageReturn: "Întoarcere.",
    stageReturnDesc: "Nu reparat. Nu ajuns. Doar nu mai jucând un rol.",
    p5: "Nu ți se va spune în ce etapă ești cât timp ești în ea. E intenționat — s-o numești prea devreme transformă un proces real într-un test de personalitate. Vei afla unde ai ajuns când conversația va fi pregătită să-ți spună, nu înainte.",
    beforeYouStartHint: "Înainte să începi",
    p6: "Nu vei ajunge acolo azi, și e în regulă. Nimeni nu începe altundeva decât la început. Oriunde ești cu adevărat acum, te va găsi acolo.",
    p7: "Încă un lucru: uneori un răspuns durează mai mult decât de obicei. E intenționat — în tăcere găsești cele mai adevărate răspunsuri.",
    privacy1: "Conversațiile tale sunt stocate în siguranță, astfel încât aplicația să își poată aminti de tine între sesiuni — asta îi permite să observe tipare reale de-a lungul timpului, în loc să o ia de la zero de fiecare dată.",
    privacy2: "Nu sunt niciodată vândute, niciodată folosite pentru a antrena modele de IA, și sunt criptate atât în tranzit, cât și la stocare. Conversațiile nu sunt niciodată citite, examinate sau partajate cu nimeni.",
    continueLabel: "Continuă",
    beginLabel: "Începe",
  },
  sl: {
    p1a: "Večina stvari na tvojem telefonu je narejenih, da čim dlje ohranjajo tvojo pozornost. To ni tako.",
    p1b: "Namen je ravno nasproten: pomagati ti, da to čim manj potrebuješ. Če opravi svoje delo, greš stran — ne zato, ker se ti je zdolgočasilo, ampak ker si nekam prišel.",
    whoWeAreHint: "Kdo smo",
    p2: "Ne podjetje, ki lovi tvojo pozornost. Ne wellness znamka s kvizom in naročnino. Majhna skupina, ki se je naveličala igranja vloge, in ustvarila to, kar bi si želela, da obstaja.",
    p3a: "Zamisli si to kot mentorja — zgrajenega na razmišljanju najbolj vplivnih in uspešnih ljudi, ki so kdaj živeli, skrčenega na tisto, kar dejansko deluje. Ne le informacije. Nekaj bližje duhovnemu, če to dovoliš.",
    p3b: "To ni tu, da bi ti pomagalo razumeti samega sebe. Tu je, da bi ti pomagalo zmagati — pri stvareh, ki so ti resnično pomembne. Razumevanje samega sebe je le to, kar je potrebno, da prideš tja.",
    p4a: "Ni terapija. Ni klepetalni robot. Ni še ena aplikacija, ki prosi za pet minut tvoje pozornosti.",
    p4b: "To je prostor, ki te spremlja skozi pet iskrenih faz — istih, ki stojijo za skoraj vsako resnično spremembo, ki jo naredi človek, ne glede na to, ali je zanjo imel ime:",
    stageMystery: "Skrivnost.",
    stageMysteryDesc: "Nekaj ni v redu. Tega še ne znaš imenovati.",
    stageSafety: "Varnost.",
    stageSafetyDesc: "To si priznal — a se še vedno ščitiš pred tem, kar bi lahko odkril.",
    stageRecognition: "Spoznanje.",
    stageRecognitionDesc: "Vzorec postane viden. Ne okoliščine. Vloga, ki jo igraš.",
    stageCourage: "Pogum.",
    stageCourageDesc: "Zdaj poznaš resnico. Ta od tebe nekaj zahteva.",
    stageReturn: "Vrnitev.",
    stageReturnDesc: "Ni popravljeno. Ni prispelo. Le ne igra več vloge.",
    p5: "Ne bo ti povedano, v kateri fazi si, medtem ko si v njej. To je namerno — če jo poimenuješ prehitro, se resničen proces spremeni v osebnostni test. Izvedel boš, kje si pristal, ko bo pogovor pripravljen povedati, ne prej.",
    beforeYouStartHint: "Preden začneš",
    p6: "Danes ne boš prišel tja, in to je v redu. Nihče ne začne nikjer drugje kot na začetku. Kjerkoli dejansko zdaj si, te bo tam poiskalo.",
    p7: "Še nekaj: včasih odgovor traja dlje kot ponavadi. To je namerno — v tišini najdeš najboljše odgovore.",
    privacy1: "Tvoji pogovori se varno shranjujejo, da si te aplikacija lahko zapomni med sejami — prav to ji omogoča, da sčasoma opazi resnične vzorce, namesto da vsakič začne znova.",
    privacy2: "Nikoli se ne prodajajo, nikoli se ne uporabljajo za učenje AI modelov, in so šifrirani tako med prenosom kot v mirovanju. Pogovori nikoli niso brani, pregledani ali deljeni s komer koli.",
    continueLabel: "Nadaljuj",
    beginLabel: "Začni",
  },
};

function getOnboardingScreens(lang: string): { html: JSX.Element }[] {
  const o = ONBOARDING_STRINGS[lang] || ONBOARDING_STRINGS.en;
  return [
    {
      html: (
        <>
          <p>{o.p1a}</p>
          <p>{o.p1b}</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p className="onb-hint">{o.whoWeAreHint}</p>
          <p>{o.p2}</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p>{o.p3a}</p>
          <p>{o.p3b}</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p>{o.p4a}</p>
          <p className="onb-sub">{o.p4b}</p>
        </>
      ),
    },
    {
      html: (
        <div className="onb-stages">
          <p><strong>{o.stageMystery}</strong> {o.stageMysteryDesc}</p>
          <p><strong>{o.stageSafety}</strong> {o.stageSafetyDesc}</p>
          <p><strong>{o.stageRecognition}</strong> {o.stageRecognitionDesc}</p>
          <p><strong>{o.stageCourage}</strong> {o.stageCourageDesc}</p>
          <p><strong>{o.stageReturn}</strong> {o.stageReturnDesc}</p>
        </div>
      ),
    },
    {
      html: <p>{o.p5}</p>,
    },
    {
      html: (
        <>
          <p className="onb-hint">{o.beforeYouStartHint}</p>
          <p>{o.p6}</p>
          <p>{o.p7}</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p className="onb-privacy">{o.privacy1}</p>
          <p className="onb-privacy">{o.privacy2}</p>
        </>
      ),
    },
  ];
}

function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

// The most recent Sunday 7pm in the visitor's own local time that has
// already passed -- entirely from their browser's clock, so it's exactly
// right for their real timezone without storing or asking for one.
function lastWeeklyRecapBoundary(now: Date): Date {
  const boundary = new Date(now);
  boundary.setHours(19, 0, 0, 0);
  boundary.setDate(boundary.getDate() - boundary.getDay());
  if (boundary > now) {
    boundary.setDate(boundary.getDate() - 7);
  }
  return boundary;
}

export default function Home() {
  const [lang, setLang] = useState("en");
  const [showThreshold, setShowThreshold] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [waitingLong, setWaitingLong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkInSaved, setCheckInSaved] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionLimit, setSubscriptionLimit] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreSent, setRestoreSent] = useState(false);
  const [openingQuestion, setOpeningQuestion] = useState("");
  const [visibleFromId, setVisibleFromId] = useState(0);
  const [elementTally, setElementTally] = useState<ElementTally>(EMPTY_TALLY);
  const [avatarReveal, setAvatarReveal] = useState<AvatarRevealData | null>(null);
  // Fetched alongside the pattern review, but only promoted into `avatarReveal`
  // (and shown) once the person closes/continues past the pattern-review
  // card -- the avatar is a second page after "your pattern," not something
  // that pops up on top of it.
  const [pendingAvatarReveal, setPendingAvatarReveal] = useState<AvatarRevealData | null>(null);
  const [winCelebration, setWinCelebration] = useState<{ action: string; reflection: string } | null>(
    null
  );
  const [weeklyRecap, setWeeklyRecap] = useState<{
    wins: { action: string }[];
    summary: string | null;
  } | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth | null>(null);
  // The opening question now has its own dedicated field, separate from
  // the real composer below it (same two-track pattern the old inline
  // aliveness flow used: a guided field coexisting with an always-usable
  // composer). Submitting it reveals the returning-user banner and mood
  // picker; the real composer stays untouched the whole time, so typing
  // there directly still bypasses this entire sequence, exactly as before.
  const [openingAnswer, setOpeningAnswer] = useState("");
  const [openingAnswerSubmitted, setOpeningAnswerSubmitted] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  // Every fresh open starts with the "touch the sky" prelude (see
  // FirstLight.tsx) before any of the rest of the opening sequence
  // renders -- never reset back to true by startFresh(), so it's a true
  // once-per-page-load ritual, not something a mid-session "start fresh"
  // click replays.
  const [showFirstLight, setShowFirstLight] = useState(true);
  // True the moment this person has sent a message they actually typed
  // themselves -- deliberately NOT the same as `hasStarted` below, which
  // also flips true from pickDepth()'s auto-sent mood/depth phrase. Gates
  // the composer-side aliveness invitation: nobody sees it until they've
  // proven real intent with their own words, never just a mood tap.
  const [hasSentRealMessage, setHasSentRealMessage] = useState(false);
  // Distinct calendar days with any message, from the server -- drives the
  // invitation's graduated visibility (icon-only vs. a small labeled pill
  // at 3+ days). Same metric the admin dashboard's retention cohort uses.
  const [activeDays, setActiveDays] = useState(0);
  // Set when the Aliveness Compass (Settings or composer entry point, same
  // component either way) closes with a real answer given -- forwarded as
  // context on the next real message, then cleared. Replaces the old
  // session-start-only `alivenessInput` forwarding now that the exercise
  // is an anytime detour rather than part of the mandatory opening.
  const [pendingAlivenessAnswer, setPendingAlivenessAnswer] = useState<string | null>(null);
  const [mirrorLine, setMirrorLine] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [showTree, setShowTree] = useState(false);
  const [showAlivenessCompass, setShowAlivenessCompass] = useState(false);
  const [treeState, setTreeState] = useState<TreeState>({});
  const [connectionToast, setConnectionToast] = useState<string | null>(null);
  const [tensionInsights, setTensionInsights] = useState<{ pair: string; insight: string }[]>([]);
  const [daat, setDaat] = useState<{ revealed: boolean; justNow: boolean }>({
    revealed: false,
    justNow: false,
  });
  const [familyState, setFamilyState] = useState<FamilyState>({});
  const [patternsTab, setPatternsTab] = useState<"tree" | "family">("tree");
  const [showPatternReview, setShowPatternReview] = useState(false);
  const [patternReview, setPatternReview] = useState<string | null>(null);
  const [loadingPatternReview, setLoadingPatternReview] = useState(false);
  const [patternReviewError, setPatternReviewError] = useState<string | null>(null);
  const [lastCommitment, setLastCommitment] = useState<{
    action: string;
    status: "pending" | "landed" | "tried" | "not_landed";
  } | null>(null);
  const [showLastCommitment, setShowLastCommitment] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const s = STRINGS[lang] || STRINGS.en;
  // "Start fresh" only ever hides messages from view -- the AI still gets
  // the full `messages` history on every turn, unchanged. See
  // VISIBLE_FROM_KEY above.
  // Undefined id (an optimistically-appended, not-yet-server-confirmed
  // message) always counts as visible -- it's always newer than any real
  // boundary id.
  const visibleMessages = messages.filter((m) => (m.id ?? Infinity) > visibleFromId);

  useEffect(() => {
    // Registers the no-op service worker so browsers offer "Add to Home
    // Screen" / "Install app" -- see public/sw.js for why it does no
    // caching.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* not fatal -- the app works fine without it, just no install prompt */
      });
    }
  }, []);

  useEffect(() => {
    // A ?lang= link (for sharing with someone specific, or testing) wins
    // over every other signal, including a previously saved preference.
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    const detected =
      urlLang && SUPPORTED_LANGS.includes(urlLang) ? urlLang : detectLang();
    setLang(detected);
    localStorage.setItem(LANG_KEY, detected);

    const questions = (STRINGS[detected] || STRINGS.en).questions;
    setOpeningQuestion(questions[Math.floor(Math.random() * questions.length)]);

    if (!localStorage.getItem(ONBOARDED_KEY)) {
      setShowOnboarding(true);
    }

    // Captured in a local var, not just read back from state right after
    // setting it -- the setter's effect isn't visible within this same
    // synchronous block, but the fetch URL below needs the real value now.
    let boundary = 0;
    try {
      const stored = localStorage.getItem(VISIBLE_FROM_KEY);
      boundary = stored ? parseInt(stored, 10) || 0 : 0;
      setVisibleFromId(boundary);
    } catch {
      /* private browsing or storage disabled -- just shows full history */
    }

    // A ?restore_token= link (sent by /api/restore to a subscriber's
    // billing email) proves they own that inbox -- consuming it here, before
    // getUserId() ever runs, swaps in their real account instead of minting
    // a fresh local one. Failure just falls through to the normal
    // new-or-existing local id, same as if the link were never clicked.
    async function resolveRestoreToken() {
      const params = new URLSearchParams(window.location.search);
      const restoreToken = params.get("restore_token");
      if (!restoreToken) return;
      try {
        const res = await fetch("/api/restore/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: restoreToken }),
        });
        const data = await res.json();
        if (data.userId) {
          localStorage.setItem(USER_ID_KEY, data.userId);
        }
      } catch {
        /* restore failed silently -- falls back to the existing/new local id */
      }
      params.delete("restore_token");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
    }

    async function init() {
      await resolveRestoreToken();

      const id = getUserId();
      setUserId(id);

      try {
        const recapBoundary = lastWeeklyRecapBoundary(new Date());
        if (localStorage.getItem(WEEKLY_RECAP_SHOWN_KEY) !== recapBoundary.toISOString()) {
          const since = new Date(recapBoundary);
          since.setDate(since.getDate() - 7);
          fetch(
            `/api/weekly-recap?userId=${encodeURIComponent(id)}&since=${encodeURIComponent(
              since.toISOString()
            )}&lang=${encodeURIComponent(detected)}`
          )
            .then((r) => r.json())
            .then((data) => {
              if (Array.isArray(data.wins) && data.wins.length > 0) {
                setWeeklyRecap({ wins: data.wins, summary: data.summary ?? null });
              }
              localStorage.setItem(WEEKLY_RECAP_SHOWN_KEY, recapBoundary.toISOString());
            })
            .catch(() => {
              /* fine — retries next time they open the app */
            });
        }
      } catch {
        /* private browsing or storage disabled -- weekly recap just won't show */
      }

      fetch(`/api/chat?userId=${encodeURIComponent(id)}&sinceMessageId=${boundary}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.messages)) {
            setMessages(
              data.messages.map((m: { id?: number; role: "user" | "assistant"; content: string }) => ({
                id: m.id,
                role: m.role,
                content: m.content,
              }))
            );
            // Every fresh open starts the visible transcript over, same as
            // tapping "start fresh" manually -- the AI still gets the full
            // history on every turn regardless (see getMessages in
            // app/api/chat/route.ts), this only ever hides what's shown.
            // Set together with setMessages above so React batches them:
            // the full history and the new boundary land in the same
            // render, so the old conversation never flashes on screen
            // before disappearing again.
            const latestId = data.messages.reduce(
              (max: number, m: { id?: number }) => Math.max(max, m.id ?? 0),
              0
            );
            setVisibleFromId(latestId);
            try {
              localStorage.setItem(VISIBLE_FROM_KEY, String(latestId));
            } catch {
              /* private browsing or storage disabled -- resets for this visit only */
            }
          }
          if (data.elementTally) setElementTally(data.elementTally);
          if (typeof data.subscribed === "boolean") setSubscribed(data.subscribed);
          if (typeof data.activeDays === "number") setActiveDays(data.activeDays);
          if (data.lastCommitment) {
            setLastCommitment(data.lastCommitment);
            let alreadySeenThisSession = true;
            try {
              alreadySeenThisSession = !!sessionStorage.getItem(LAST_COMMITMENT_SEEN_KEY);
              if (!alreadySeenThisSession) {
                sessionStorage.setItem(LAST_COMMITMENT_SEEN_KEY, "1");
              }
            } catch {
              /* private browsing or storage disabled -- default to not showing
                 rather than risk showing it every single load */
            }
            if (!alreadySeenThisSession) setShowLastCommitment(true);
          }
        })
        .catch(() => {
          /* fine — they'll just start fresh */
        });

      fetch(`/api/mirror?userId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.line) setMirrorLine(data.line);
        })
        .catch(() => {
          /* quiet failure — the mirror line is a nice-to-have, not core */
        });

      // Restores the ambient stage color on a fresh load, since signal_depth
      // only fires once per stage and won't repeat itself on a later visit
      // to re-tell the client.
      fetch(`/api/shape?userId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.stage) setStage(data.stage);
        })
        .catch(() => {
          /* quiet failure — the ambient state just starts fresh this visit */
        });
    }

    init();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, sending]);

  // The tool-use loop can make several silent calls before the actual
  // reply, so an ordinary wait and a genuinely slow one look identical
  // with just the typing dots -- swap in a reassurance once it's been
  // pending long enough that someone might otherwise think it's stuck.
  useEffect(() => {
    if (!sending) {
      setWaitingLong(false);
      return;
    }
    const t = setTimeout(() => setWaitingLong(true), 9000);
    return () => clearTimeout(t);
  }, [sending]);

  function changeLang(newLang: string) {
    setLang(newLang);
    localStorage.setItem(LANG_KEY, newLang);
    const questions = (STRINGS[newLang] || STRINGS.en).questions;
    setOpeningQuestion(questions[Math.floor(Math.random() * questions.length)]);
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setShowOnboarding(false);
  }

  async function send(overrideText?: string, depthValue?: Depth | null, authored: boolean = true) {
    const text = (overrideText ?? draft).trim();
    if (!text || !userId || sending) return;

    // authored=true only for a real, typed send (the composer's own
    // Enter-key/send-button path, which never passes overrideText) --
    // false for pickDepth()'s auto-sent mood/depth phrase and for tapping
    // an offer_branches suggestion, neither of which is something the
    // person actually wrote. This is the one bar the composer-side
    // aliveness invitation gates on; see hasSentRealMessage above.
    if (authored) setHasSentRealMessage(true);

    // Whatever real answer the Aliveness Compass detour last gave (Settings
    // or the composer invitation, same component) rides along on the very
    // next message sent after it closes, then is cleared -- one-shot,
    // decoupled from session-start now that the exercise isn't part of the
    // mandatory opening. See pendingAlivenessAnswer above.
    const alivenessAnswer = pendingAlivenessAnswer || undefined;

    setDraft("");
    setPendingAlivenessAnswer(null);
    setError(null);
    setSubscriptionLimit(null);
    setBranches([]);
    setShowLastCommitment(false);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);

    // No server-side guarantee a hung connection always closes cleanly
    // (a platform-level timeout kill doesn't go through normal HTTP
    // close in every case) -- without this, a stuck request leaves
    // `sending` true forever, since the finally block below never runs
    // on a fetch promise that never settles. 58s: just under the API
    // route's own 60s maxDuration, so this fires after the server would
    // have given up anyway, not before.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 58000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message: text,
          depth: depthValue ?? depth,
          lang,
          alivenessAnswer,
          sinceMessageId: visibleFromId,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (data.blocked) {
        // Nothing was actually sent or persisted -- drop the optimistic
        // user message rather than leaving it stranded in the transcript,
        // and show the plain limit card instead of treating this as an
        // error.
        setMessages((m) => {
          const next = [...m];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "user" && next[i].id === undefined) {
              next.splice(i, 1);
              break;
            }
          }
          return next;
        });
        setSubscriptionLimit(data.message || SUBSCRIPTION_FALLBACK.limitMessage);
        return;
      }
      setMessages((m) => {
        // The user message was appended optimistically above with no real
        // id yet -- back-fill it now that the server has one, so the
        // "start fresh" / element-tally boundary (both id-based) work
        // correctly without needing a page reload first.
        const next = [...m];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "user" && next[i].id === undefined) {
            next[i] = { ...next[i], id: data.userMessageId };
            break;
          }
        }
        return [...next, { id: data.assistantMessageId, role: "assistant", content: data.reply }];
      });
      if (data.stage) setStage(data.stage);
      if (Array.isArray(data.branches) && data.branches.length > 0) setBranches(data.branches);
      if (data.elementTally) setElementTally(data.elementTally);
      if (data.win) setWinCelebration(data.win);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("That took too long to respond. Try sending it again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      clearTimeout(timeout);
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Picking a mood chip doesn't send anything yet — it opens the depth-check
  // interstitial first. Only reachable after the opening answer field has
  // been submitted; someone who types their own line in the real composer
  // instead skips this and the mood/depth steps entirely, same as before.
  function pickMood(moodIndex: number) {
    setSelectedMood(MOOD_KEYS[moodIndex]);
  }

  // Hides the visible transcript and restores the full opening experience
  // (mood picker, aliveness question) -- the AI keeps the entire history
  // as context on every future turn regardless; only what's shown resets.
  // Stage, the Tree of Life, and commitments are untouched, by design.
  function startFresh() {
    // The highest real (server-confirmed) message id seen so far -- an
    // optimistically-appended message with no id yet can't be a boundary,
    // but nothing needs one anyway since sending is disabled while a reply
    // is pending.
    const cutoff = messages.reduce((max, m) => Math.max(max, m.id ?? 0), 0);
    setVisibleFromId(cutoff);
    try {
      localStorage.setItem(VISIBLE_FROM_KEY, String(cutoff));
    } catch {
      /* private browsing or storage disabled -- resets for this visit only */
    }
    setSelectedMood(null);
    setDepth(null);
    setOpeningAnswer("");
    setOpeningAnswerSubmitted(false);
    setBranches([]);
    setError(null);
    setDraft("");
    setShowLastCommitment(false);
    setElementTally(EMPTY_TALLY);
    setAvatarReveal(null);
    setPendingAvatarReveal(null);
    setWinCelebration(null);
    setShowSettings(false);
    const questions = (STRINGS[lang] || STRINGS.en).questions;
    setOpeningQuestion(questions[Math.floor(Math.random() * questions.length)]);
  }

  function pickDepth(depthValue: Depth) {
    setDepth(depthValue);
    // What they actually typed answering the opening question is the real
    // first message now -- authored: true, since it genuinely is, unlike
    // the canned mood-phrase this replaced.
    send(openingAnswer, depthValue, true);
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    if (!userId || !email.trim()) return;
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim() }),
      });
      if (res.ok) setEmailSaved(true);
    } catch {
      /* silent — this is a nice-to-have */
    }
  }

  async function saveCheckIn(e: FormEvent) {
    e.preventDefault();
    if (!userId || !checkInTime) return;
    let timezone = "UTC";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* fall back to UTC */
    }
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, preferredTime: checkInTime, timezone }),
      });
      if (res.ok) setCheckInSaved(true);
    } catch {
      /* silent — this is a nice-to-have */
    }
  }

  async function startCheckout() {
    if (!userId || checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch {
      setError(SUBSCRIPTION_FALLBACK.checkoutErrorLabel);
      setCheckoutLoading(false);
    }
  }

  async function openPortal() {
    if (!userId || checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open billing portal.");
      window.location.href = data.url;
    } catch {
      setError(SUBSCRIPTION_FALLBACK.checkoutErrorLabel);
      setCheckoutLoading(false);
    }
  }

  async function requestRestore(e: FormEvent) {
    e.preventDefault();
    if (!restoreEmail.trim()) return;
    try {
      await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: restoreEmail.trim() }),
      });
    } catch {
      /* falls through to the same generic confirmation either way, matching
         /api/restore's own generic response */
    }
    setRestoreSent(true);
  }

  // Opens right away with whatever's already in state, then refreshes in
  // the background -- same pattern as the element tally, not a blocking
  // loading screen for a page that's mostly meant to be sat with quietly.
  function openTree() {
    setShowTree(true);
    if (!userId) return;
    fetch(`/api/tree?userId=${encodeURIComponent(userId)}&lang=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.state) setTreeState(data.state);
        // Surfaces at most once, ever, per path -- the server already
        // guarantees that; the client just has to say it when it's told to.
        if (data.newConnection) {
          const a = TREE_NODES[data.newConnection.a as SephirahKey]?.subtitle;
          const b = TREE_NODES[data.newConnection.b as SephirahKey]?.subtitle;
          if (a && b) {
            setConnectionToast(`You're starting to see how ${a} and ${b} connect.`);
            window.setTimeout(() => setConnectionToast(null), 6000);
          }
        }
        if (Array.isArray(data.tensionInsights)) setTensionInsights(data.tensionInsights);
        if (data.daat) setDaat(data.daat);
      })
      .catch(() => {
        /* quiet failure — the Tree just shows what it already had */
      });
    fetch(`/api/family?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.state) setFamilyState(data.state);
      })
      .catch(() => {
        /* quiet failure — Family Constellation just shows what it already had */
      });
  }

  async function handlePatternReview() {
    if (!userId) return;
    setShowPatternReview(true);
    setLoadingPatternReview(true);
    setPatternReviewError(null);
    try {
      const res = await fetch(
        `/api/pattern-review?userId=${encodeURIComponent(userId)}&lang=${encodeURIComponent(lang)}&sinceMessageId=${visibleFromId}`
      );
      const data = await res.json();
      if (!res.ok || !data.review) {
        throw new Error(data.error || "Couldn't put that together.");
      }
      setPatternReview(data.review);
      if (data.avatarReveal) setPendingAvatarReveal(data.avatarReveal);
    } catch (err) {
      setPatternReviewError(
        err instanceof Error ? err.message : "Couldn't put that together just now."
      );
    } finally {
      setLoadingPatternReview(false);
    }
  }

  function closePatternReview() {
    setShowPatternReview(false);
    setPatternReview(null);
    setPatternReviewError(null);
    // The avatar is the second page after the pattern review, not a popup
    // on top of it -- only shown now that the pattern card is closing.
    if (pendingAvatarReveal) {
      setAvatarReveal(pendingAvatarReveal);
      setPendingAvatarReveal(null);
    }
  }

  const hasStarted = visibleMessages.length > 0;
  const awaitingDepth = selectedMood !== null && !hasStarted;

  const activeColors = stage
    ? STAGE_COLORS[stage]
    : selectedMood
    ? MOOD_COLORS[selectedMood]
    : null;

  if (showThreshold) {
    return (
      <ThresholdOverlay
        line={s.thresholdLine || THRESHOLD_FALLBACK.thresholdLine}
        ariaLabel={s.continueAriaLabel}
        onDone={() => setShowThreshold(false)}
      />
    );
  }

  if (showOnboarding) {
    const screens = getOnboardingScreens(lang);
    const o = ONBOARDING_STRINGS[lang] || ONBOARDING_STRINGS.en;
    const isLast = onboardingIndex === screens.length - 1;
    return (
      <div className="app onboarding">
        <div
          className="ambient-glow"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${STAGE_COLORS.mystery.glow}, transparent 65%)`,
          }}
        />
        <div className="onboarding-topbar">
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            aria-label={s.chooseLanguageAriaLabel}
          >
            {SUPPORTED_LANGS.map((code) => (
              <option key={code} value={code}>
                {NATIVE_NAMES[code] || code.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="onboarding-content">
          {screens[onboardingIndex].html}
          <button
            className="mood-chip onboarding-next key-action"
            onClick={() => (isLast ? finishOnboarding() : setOnboardingIndex((i) => i + 1))}
          >
            <ArrowIcon />
            {isLast ? o.beginLabel : o.continueLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div
        className="ambient-glow"
        style={{
          background: activeColors
            ? `radial-gradient(circle at 50% 40%, ${activeColors.glow}, transparent 65%)`
            : "none",
        }}
      />

      {/* Only before a conversation starts -- once it does, the element
          orb's own fully-opaque scene takes over the full screen and
          there's no visible space left behind it for this. */}
      {!hasStarted && (
        <div className="opening-bg" aria-hidden="true">
          {showFirstLight ? <FirstLight onDone={() => setShowFirstLight(false)} /> : <SparseSky />}
        </div>
      )}

      {hasStarted && (
        <div className="element-orb-wrap" aria-hidden="true">
          <ElementOrb tally={elementTally} />
        </div>
      )}

      {avatarReveal && (
        <AvatarReveal
          tally={elementTally}
          eyebrowLabel={s.returnLabel}
          headline={s.avatarHeadlineTemplate
            .replace("{element}", s.elementLabels[avatarReveal.dominant])
            .replace("{pct}", String(avatarReveal.dominantPct))}
          reflection={avatarReveal.reflection}
          closeLabel={s.continueLabel}
          elementLabels={s.elementLabels}
          onClose={() => {
            setAvatarReveal(null);
            openTree();
          }}
        />
      )}

      {showTree && (
        <div className="patterns-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={patternsTab === "tree"}
            className={patternsTab === "tree" ? "patterns-tab patterns-tab-active" : "patterns-tab"}
            onClick={() => setPatternsTab("tree")}
          >
            {s.treeTabLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={patternsTab === "family"}
            className={patternsTab === "family" ? "patterns-tab patterns-tab-active" : "patterns-tab"}
            onClick={() => setPatternsTab("family")}
          >
            {s.familyTabLabel}
          </button>
        </div>
      )}

      {showTree && patternsTab === "tree" && (
        <TreeOfLife
          state={treeState}
          tensionInsights={tensionInsights}
          daat={daat}
          userId={userId}
          lang={lang}
          eyebrowLabel={s.returnLabel}
          closeLabel={s.closeLabel}
          onClose={() => setShowTree(false)}
        />
      )}

      {showTree && patternsTab === "family" && (
        <FamilyConstellation
          state={familyState}
          userId={userId}
          lang={lang}
          eyebrowLabel={s.returnLabel}
          closeLabel={s.closeLabel}
          onClose={() => setShowTree(false)}
        />
      )}

      {connectionToast && <div className="tree-toast">{connectionToast}</div>}

      {winCelebration && (
        <WinCelebration
          eyebrowLabel={s.returnLabel}
          headline={s.winHeadline || WIN_FALLBACK.winHeadline}
          reflection={winCelebration.reflection}
          closeLabel={s.continueLabel}
          onClose={() => setWinCelebration(null)}
        />
      )}

      {weeklyRecap && (
        <WeeklyRecap
          eyebrowLabel={s.returnLabel}
          headline={s.weeklyRecapHeadline || WEEKLY_RECAP_FALLBACK.weeklyRecapHeadline}
          summary={weeklyRecap.summary}
          wins={weeklyRecap.wins}
          closeLabel={s.closeLabel}
          onClose={() => setWeeklyRecap(null)}
        />
      )}

      <div className="topbar">
        <span className="wordmark">{s.brand}</span>
        <div className="topbar-right">
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            aria-label={s.chooseLanguageAriaLabel}
          >
            {SUPPORTED_LANGS.map((code) => (
              <option key={code} value={code}>
                {NATIVE_NAMES[code] || code.toUpperCase()}
              </option>
            ))}
          </select>
          {hasStarted && (
            <button
              type="button"
              className="start-fresh-toggle"
              onClick={startFresh}
            >
              {s.startFreshLabel || START_FRESH_FALLBACK.startFreshLabel}
            </button>
          )}
          <button
            className="settings-toggle"
            onClick={() => setShowSettings((sVal) => !sVal)}
            aria-expanded={showSettings}
            aria-label={s.checkInSettingsAriaLabel}
          >
            ⋯
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <button type="button" className="tree-entry-btn" onClick={openTree}>
            <span>{s.treeEntryLabel}</span>
            <span className="tree-entry-btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <button type="button" className="tree-entry-btn" onClick={() => setShowAlivenessCompass(true)}>
            <span>Aliveness Compass</span>
            <span className="tree-entry-btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
          {mirrorLine && (
            <div className="mirror-card">
              <div className="mirror-card-label">{s.returnLabel}</div>
              <div className="mirror-card-line">{mirrorLine}</div>
            </div>
          )}
          <p>{s.settingsText}</p>
          {emailSaved ? (
            <span className="settings-status">{s.savedLabel}</span>
          ) : (
            <form onSubmit={saveEmail}>
              <input
                type="email"
                placeholder={s.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit">{s.saveLabel}</button>
            </form>
          )}
          <p>{s.checkInPromptText || CHECKIN_FALLBACK.checkInPromptText}</p>
          {checkInSaved ? (
            <span className="settings-status">{s.savedLabel}</span>
          ) : (
            <form onSubmit={saveCheckIn}>
              <select
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                required
              >
                <option value="" disabled>
                  {s.chooseTimeLabel}
                </option>
                {CHECKIN_TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button type="submit">{s.saveLabel}</button>
            </form>
          )}
          <div className="settings-subscription">
            {subscribed ? (
              <button type="button" onClick={openPortal} disabled={checkoutLoading}>
                {SUBSCRIPTION_FALLBACK.manageLabel}
              </button>
            ) : (
              <button type="button" onClick={startCheckout} disabled={checkoutLoading}>
                {SUBSCRIPTION_FALLBACK.subscribeLabel}
              </button>
            )}
            {restoreSent ? (
              <span className="settings-status">{SUBSCRIPTION_FALLBACK.restoreSentLabel}</span>
            ) : (
              <form onSubmit={requestRestore}>
                <input
                  type="email"
                  placeholder={SUBSCRIPTION_FALLBACK.restorePlaceholder}
                  value={restoreEmail}
                  onChange={(e) => setRestoreEmail(e.target.value)}
                  required
                />
                <button type="submit">{SUBSCRIPTION_FALLBACK.restoreLabel}</button>
              </form>
            )}
          </div>
          <div className="settings-privacy">
            <p>{s.privacyLong1}</p>
            <p>{s.privacyLong2}</p>
            <p>
              Questions or feedback: <a href="mailto:hello@justyou.fyi">hello@justyou.fyi</a>
            </p>
            <p className="settings-privacy-links">
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
            </p>
          </div>
        </div>
      )}

      {showFirstLight ? null : !hasStarted && !awaitingDepth ? (
        <div className="opening">
          <p className="opening-question">{openingQuestion}</p>
          {!openingAnswerSubmitted ? (
            <div className="opening-answer-field">
              <input
                id="opening-answer"
                type="text"
                value={openingAnswer}
                onChange={(e) => setOpeningAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && openingAnswer.trim()) {
                    e.preventDefault();
                    setOpeningAnswerSubmitted(true);
                  }
                }}
                placeholder={s.placeholderStart}
                disabled={sending}
                autoFocus
              />
              {openingAnswer.trim() && (
                <button
                  type="button"
                  className="opening-answer-continue key-action"
                  onClick={() => setOpeningAnswerSubmitted(true)}
                  disabled={sending}
                >
                  <ArrowIcon />
                  {s.continueLabel}
                </button>
              )}
            </div>
          ) : (
            <>
              {showLastCommitment && lastCommitment && (
                <button
                  type="button"
                  className="last-commitment"
                  onClick={() => setShowLastCommitment(false)}
                >
                  {(lastCommitment.status === "landed"
                    ? s.lastCommitmentLandedLabel || LAST_COMMITMENT_FALLBACK.lastCommitmentLandedLabel
                    : s.lastCommitmentLabel || LAST_COMMITMENT_FALLBACK.lastCommitmentLabel
                  ).replace("{action}", lastCommitment.action)}
                </button>
              )}
              <p className="mood-caption">{s.moodCaption}</p>
              <div className="mood-row mood-row-bounded">
                {s.moods.map((mood, i) => (
                  <button
                    key={mood}
                    className="mood-chip"
                    onClick={() => pickMood(i)}
                    disabled={sending}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : awaitingDepth ? (
        <div className="opening">
          <p className="mood-caption">{s.depthQuestion}</p>
          <div className="mood-row depth-row">
            {(["light", "medium", "deep"] as Depth[]).map((d, i) => (
              <button
                key={d}
                className="mood-chip"
                onClick={() => pickDepth(d)}
                disabled={sending}
              >
                {s.depthOptions[i]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="transcript" ref={transcriptRef}>
          <div className="transcript-inner">
            {visibleMessages.map((m, i) => (
              <div className={`msg ${m.role}`} key={i}>
                <span className="msg-label">
                  {m.role === "user" ? s.youLabel : s.returnLabel}
                </span>
                <p className="msg-bubble">{m.content}</p>
              </div>
            ))}
            {sending && (
              <div className="msg assistant pending">
                <span className="msg-label">{s.returnLabel}</span>
                {waitingLong ? (
                  <p className="msg-bubble still-here">
                    {s.stillHereLabel || STILL_HERE_FALLBACK.stillHereLabel}
                  </p>
                ) : (
                  <p className="msg-bubble">
                    <span className="typing-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
                )}
              </div>
            )}
            {!sending && branches.length > 0 && (
              <div className="branches">
                {branches.map((b, i) => (
                  <button key={i} className="branch" onClick={() => send(b, undefined, false)} disabled={sending}>
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!awaitingDepth && (subscriptionLimit ? (
        <div className="composer">
          <div className="limit-card">
            <p>{subscriptionLimit}</p>
            <button type="button" className="key-action" onClick={startCheckout} disabled={checkoutLoading}>
              <UnlockIcon />
              {SUBSCRIPTION_FALLBACK.subscribeLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="composer">
          {(hasSentRealMessage || (hasStarted && visibleMessages.length > 1)) && (
            <div className="composer-affordances">
              {hasStarted && visibleMessages.length > 1 && (
                <button
                  type="button"
                  className="pattern-review-trigger key-action"
                  onClick={handlePatternReview}
                  disabled={loadingPatternReview}
                >
                  <EyeIcon />
                  {s.patternReviewLabel || PATTERN_REVIEW_FALLBACK.patternReviewLabel}
                </button>
              )}
              {hasSentRealMessage && (
                <button
                  type="button"
                  className={activeDays >= 3 ? "aliveness-invite aliveness-invite-tier2" : "aliveness-invite"}
                  onClick={() => setShowAlivenessCompass(true)}
                  aria-label="Aliveness Compass"
                  title="Aliveness Compass"
                >
                  <SparkIcon />
                  {activeDays >= 3 && <span className="aliveness-invite-label">Aliveness Compass</span>}
                </button>
              )}
            </div>
          )}
          {error && <p className="error-line">{error}</p>}
          <div className="composer-inner">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={hasStarted ? s.placeholderContinue : s.placeholderStart}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="send-btn"
              onClick={() => send()}
              disabled={sending || !draft.trim()}
              aria-label={s.sendAriaLabel}
            >
              ↑
            </button>
          </div>
        </div>
      ))}

      {showPatternReview && (
        <div className="pattern-review-overlay" onClick={closePatternReview}>
          <div className="pattern-review-card" onClick={(e) => e.stopPropagation()}>
            <div className="pattern-review-eyebrow">{s.returnLabel}</div>
            {loadingPatternReview ? (
              <p className="pattern-review-loading">
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            ) : patternReviewError ? (
              <p className="pattern-review-error">{patternReviewError}</p>
            ) : (
              <p className="pattern-review-text">{patternReview}</p>
            )}
            <button
              type="button"
              className={
                !loadingPatternReview && pendingAvatarReveal
                  ? "pattern-review-close key-action"
                  : "pattern-review-close"
              }
              onClick={closePatternReview}
            >
              {!loadingPatternReview && pendingAvatarReveal && <ArrowIcon />}
              {!loadingPatternReview && pendingAvatarReveal ? s.continueLabel : s.closeLabel}
            </button>
          </div>
        </div>
      )}

      {showAlivenessCompass && (
        <AlivenessCompass
          lang={lang}
          onClose={(answer) => {
            setShowAlivenessCompass(false);
            if (answer) setPendingAlivenessAnswer(answer);
          }}
        />
      )}
    </div>
  );
}
