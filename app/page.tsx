"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Depth = "light" | "medium" | "deep";

const USER_ID_KEY = "the_return_user_id";
const ONBOARDED_KEY = "the_return_onboarded";
const LANG_KEY = "the_return_lang";
const REVEAL_SHOWN_KEY = "the_return_reveal_shown";

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
};

const MOOD_KEYS = ["Calm", "Anxious", "Angry", "Numb", "Tired", "Hopeful", "Stuck"];

// --- Personalized shape family artwork: fragments -> whole across the five
// stages. Which family someone gets is decided invisibly by the model (see
// assign_shape_family in lib/anthropic.ts) -- never shown as a quiz, never
// announced. Geometry ported from the approved mockup.
const STAGE_ORDER = ["mystery", "safety", "recognition", "courage", "return"] as const;
type ShapeFamily = "tree" | "flame" | "river" | "constellation" | "mountain";

type FamilyPath = { d: string; dx: number; dy: number; rot: number };
type FamilyDot = { cx: number; cy: number; r: number };

const SHAPE_FAMILIES: Record<
  ShapeFamily,
  { color: string; paths: FamilyPath[]; dots: FamilyDot[]; stageLines: string[] }
> = {
  tree: {
    color: "#C99A5B",
    paths: [
      { d: "M150,270 L150,140", dx: -40, dy: 30, rot: -25 },
      { d: "M150,140 Q110,110 95,70", dx: 35, dy: -25, rot: 20 },
      { d: "M150,140 Q190,110 205,68", dx: -30, dy: 25, rot: -18 },
      { d: "M150,175 Q110,165 80,190", dx: 25, dy: 20, rot: 15 },
      { d: "M150,175 Q190,165 220,195", dx: -25, dy: -20, rot: -15 },
      { d: "M150,205 Q125,200 105,220", dx: 20, dy: 15, rot: 10 },
      { d: "M150,205 Q175,200 195,222", dx: -20, dy: -15, rot: -10 },
    ],
    dots: [
      { cx: 95, cy: 70, r: 2.5 },
      { cx: 205, cy: 68, r: 2.5 },
      { cx: 80, cy: 190, r: 2 },
      { cx: 220, cy: 195, r: 2 },
    ],
    stageLines: [
      "Something unfinished, barely a line.",
      "The fragments start finding each other.",
      "The pattern appears — it was always a tree.",
      "The branches reach further than before.",
      "Whole — every fragment, one shape.",
    ],
  },
  flame: {
    color: "#D97A4A",
    paths: [
      { d: "M150,260 Q130,220 150,190", dx: 30, dy: 20, rot: 20 },
      { d: "M150,260 Q170,220 150,190", dx: -30, dy: 20, rot: -20 },
      { d: "M150,195 Q125,150 145,110", dx: 25, dy: -25, rot: 18 },
      { d: "M150,195 Q175,150 155,110", dx: -25, dy: -25, rot: -18 },
      { d: "M150,115 Q135,80 150,55", dx: 18, dy: -15, rot: 12 },
      { d: "M150,115 Q165,80 150,55", dx: -18, dy: -15, rot: -12 },
    ],
    dots: [{ cx: 150, cy: 55, r: 3 }],
    stageLines: [
      "A flicker, easy to miss.",
      "Catching, but still unsteady.",
      "It knows now it's meant to burn.",
      "Rising, no longer asking permission.",
      "A fire that doesn't need feeding to stay lit.",
    ],
  },
  river: {
    color: "#5FA3A0",
    paths: [
      { d: "M40,90 Q80,70 100,95", dx: -20, dy: 20, rot: 10 },
      { d: "M100,95 Q140,120 130,150", dx: 20, dy: -15, rot: -10 },
      { d: "M130,150 Q160,175 150,200", dx: -15, dy: 15, rot: 8 },
      { d: "M150,200 Q190,220 185,245", dx: 15, dy: -15, rot: -8 },
      { d: "M185,245 Q220,255 260,250", dx: -10, dy: 10, rot: 6 },
    ],
    dots: [],
    stageLines: [
      "Water with nowhere agreed to go.",
      "Finding a direction, still shallow.",
      "The current knows its own shape now.",
      "Moving fast, carving its own bank.",
      "One continuous line, all the way to the sea.",
    ],
  },
  constellation: {
    color: "#B9AEDB",
    paths: [
      { d: "M70,70 L120,110", dx: 30, dy: -25, rot: 0 },
      { d: "M120,110 L110,170", dx: -25, dy: 20, rot: 0 },
      { d: "M110,170 L160,200", dx: 20, dy: -20, rot: 0 },
      { d: "M160,200 L215,175", dx: -20, dy: 20, rot: 0 },
      { d: "M215,175 L230,110", dx: 20, dy: -15, rot: 0 },
      { d: "M230,110 L180,75", dx: -20, dy: 15, rot: 0 },
      { d: "M180,75 L120,110", dx: 15, dy: -15, rot: 0 },
    ],
    dots: [
      { cx: 70, cy: 70, r: 3 },
      { cx: 120, cy: 110, r: 2.5 },
      { cx: 110, cy: 170, r: 2.5 },
      { cx: 160, cy: 200, r: 3 },
      { cx: 215, cy: 175, r: 2.5 },
      { cx: 230, cy: 110, r: 2.5 },
      { cx: 180, cy: 75, r: 2.5 },
    ],
    stageLines: [
      "Scattered light, no shape yet.",
      "A few points start to relate.",
      "You can almost trace the figure.",
      "The shape is unmistakable now.",
      "A full constellation — it was always there.",
    ],
  },
  mountain: {
    color: "#9C978C",
    paths: [
      { d: "M40,230 L110,110", dx: -20, dy: 25, rot: 8 },
      { d: "M110,110 L150,160", dx: 15, dy: -20, rot: -6 },
      { d: "M150,160 L190,90", dx: -15, dy: 20, rot: 6 },
      { d: "M190,90 L260,230", dx: 15, dy: -20, rot: -6 },
      { d: "M40,230 L260,230", dx: 0, dy: 20, rot: 0 },
    ],
    dots: [
      { cx: 110, cy: 110, r: 2 },
      { cx: 190, cy: 90, r: 2.5 },
    ],
    stageLines: [
      "Loose stone, no ground yet.",
      "Something is starting to hold weight.",
      "The base is set — it isn't moving.",
      "Rising higher than the fog.",
      "A mountain. Unshaken, from any side.",
    ],
  },
};

function ShapeArt({
  family,
  stage,
  size,
}: {
  family: ShapeFamily;
  stage: string;
  size: number;
}) {
  const fam = SHAPE_FAMILIES[family];
  const stageIdx = Math.max(0, STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]));
  const progress = stageIdx / 4;

  return (
    <svg width={size} height={size} viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      {fam.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={fam.color}
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.35 + 0.6 * progress}
          transform={`translate(${p.dx * (1 - progress)},${p.dy * (1 - progress)}) rotate(${
            p.rot * (1 - progress)
          } 150 150)`}
        />
      ))}
      {fam.dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill={fam.color}
          opacity={0.3 + 0.6 * progress}
        />
      ))}
    </svg>
  );
}

// The Return-stage reveal: happens once, for real, at the true end of
// someone's journey. Fragments assemble fully, a beat of stillness, then
// the line. Not something to casually replay -- see REVEAL_SHOWN_KEY.
function RevealOverlay({ family, onClose }: { family: ShapeFamily; onClose: () => void }) {
  const fam = SHAPE_FAMILIES[family];
  const total = fam.paths.length + fam.dots.length;
  let i = 0;

  return (
    <div className="reveal-overlay">
      <div className="reveal-eyebrow">the return</div>
      <div className="reveal-art">
        <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
          {fam.paths.map((p, idx) => {
            const delay = 0.5 + (i++ / total) * 1.6;
            return (
              <path
                key={`p${idx}`}
                d={p.d}
                stroke={fam.color}
                fill="none"
                strokeWidth={1.7}
                strokeLinecap="round"
                className="reveal-fragment"
                style={{ animationDelay: `${delay}s` }}
              />
            );
          })}
          {fam.dots.map((d, idx) => {
            const delay = 0.5 + (i++ / total) * 1.6;
            return (
              <circle
                key={`d${idx}`}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill={fam.color}
                className="reveal-fragment"
                style={{ animationDelay: `${delay}s` }}
              />
            );
          })}
        </svg>
      </div>
      <div className="reveal-word">Whole.</div>
      <div className="reveal-line">
        You didn&rsquo;t choose this shape. You just kept being honest, and this is what it
        became.
      </div>
      <button className="reveal-continue" onClick={onClose}>
        continue
      </button>
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
  // Template for the synthetic opening line sent when someone picks a mood
  // chip instead of typing — "{mood}" is replaced with the translated mood
  // word. Needed so that line is actually in the visitor's language rather
  // than always English, which was steering the AI's replies into English
  // regardless of the selected UI language.
  moodPhrase: string;
  // Optional secondary question on the opening screen. Not yet translated
  // for every language (like the extra rotating `questions`) -- falls back
  // to English, see ALIVENESS_FALLBACK below.
  alivenessQuestion?: string;
  alivenessOptional?: string;
};

const ALIVENESS_FALLBACK = {
  alivenessQuestion: "Where did you feel most alive this week?",
  alivenessOptional: "optional",
};

const STRINGS: Record<string, Strings> = {
  en: {
    brand: "The Return",
    questions: [
      "What are you ready to stop performing?",
      "Who were you before you learned to perform?",
      "What are you pretending not to want?",
      "What would you say if no one was grading you?",
      "What's the thing you're most tired of proving?",
    ],
    moodCaption: "Not sure how to put it into words? Start here",
    moods: ["Calm", "Anxious", "Angry", "Numb", "Tired", "Hopeful", "Stuck"],
    placeholderStart: "Answer, or say anything.",
    placeholderContinue: "Say what's true.",
    settingsText: "Leave an email and if a commitment comes due, you'll hear from The Return before you have to come back on your own.",
    saveLabel: "Save",
    savedLabel: "You're set.",
    emailPlaceholder: "you@example.com",
    youLabel: "you",
    returnLabel: "the return",
    depthQuestion: "How much do you want to get into today?",
    depthOptions: ["Just looking around", "A little", "I've got something on my mind"],
    moodPhrase: "I'm feeling {mood} right now.",
    alivenessQuestion: "Where did you feel most alive this week?",
    alivenessOptional: "optional",
  },
  es: {
    brand: "El Regreso",
    questions: ["¿Qué estás listo para dejar de aparentar?"],
    moodCaption: "¿No sabes cómo ponerlo en palabras? Empieza aquí",
    moods: ["Tranquilo", "Ansioso", "Enfadado", "Entumecido", "Cansado", "Esperanzado", "Atascado"],
    placeholderStart: "Responde, o di cualquier cosa.",
    placeholderContinue: "Di lo que es verdad.",
    settingsText: "Deja un correo y si un compromiso vence, sabrás de El Regreso antes de tener que volver por tu cuenta.",
    saveLabel: "Guardar",
    savedLabel: "Listo.",
    emailPlaceholder: "tu@ejemplo.com",
    youLabel: "tú",
    returnLabel: "el regreso",
    depthQuestion: "¿Qué tan a fondo quieres ir hoy?",
    depthOptions: ["Solo mirando", "Un poco", "Tengo algo en mente"],
    moodPhrase: "Me siento {mood} ahora mismo.",
  },
  fr: {
    brand: "Le Retour",
    questions: ["Qu'es-tu prêt à arrêter de jouer ?"],
    moodCaption: "Tu ne sais pas comment le dire ? Commence ici",
    moods: ["Calme", "Anxieux", "En colère", "Engourdi", "Fatigué", "Plein d'espoir", "Bloqué"],
    placeholderStart: "Réponds, ou dis n'importe quoi.",
    placeholderContinue: "Dis ce qui est vrai.",
    settingsText: "Laisse un e-mail et si un engagement arrive à échéance, Le Retour te contactera avant que tu aies à revenir seul.",
    saveLabel: "Enregistrer",
    savedLabel: "C'est fait.",
    emailPlaceholder: "toi@exemple.com",
    youLabel: "toi",
    returnLabel: "le retour",
    depthQuestion: "Tu veux aller jusqu'où aujourd'hui ?",
    depthOptions: ["Je regarde juste", "Un peu", "J'ai quelque chose en tête"],
    moodPhrase: "Je me sens {mood} en ce moment.",
  },
  de: {
    brand: "Die Rückkehr",
    questions: ["Was bist du bereit, nicht mehr vorzuspielen?"],
    moodCaption: "Findest du keine Worte dafür? Fang hier an",
    moods: ["Ruhig", "Ängstlich", "Wütend", "Taub", "Müde", "Hoffnungsvoll", "Feststeckend"],
    placeholderStart: "Antworte, oder sag irgendetwas.",
    placeholderContinue: "Sag, was wahr ist.",
    settingsText: "Hinterlasse eine E-Mail — wenn eine Verpflichtung fällig wird, meldet sich Die Rückkehr, bevor du selbst zurückkommen musst.",
    saveLabel: "Speichern",
    savedLabel: "Erledigt.",
    emailPlaceholder: "du@beispiel.de",
    youLabel: "du",
    returnLabel: "die rückkehr",
    depthQuestion: "Wie tief willst du heute gehen?",
    depthOptions: ["Ich schaue nur", "Ein bisschen", "Ich habe etwas im Kopf"],
    moodPhrase: "Ich fühle mich gerade {mood}.",
  },
  pt: {
    brand: "O Retorno",
    questions: ["O que você está pronto para parar de fingir?"],
    moodCaption: "Não sabe como colocar em palavras? Comece aqui",
    moods: ["Calmo", "Ansioso", "Irritado", "Anestesiado", "Cansado", "Esperançoso", "Travado"],
    placeholderStart: "Responda, ou diga qualquer coisa.",
    placeholderContinue: "Diga o que é verdade.",
    settingsText: "Deixe um e-mail e, se um compromisso vencer, você terá notícias de O Retorno antes de precisar voltar sozinho.",
    saveLabel: "Salvar",
    savedLabel: "Pronto.",
    emailPlaceholder: "voce@exemplo.com",
    youLabel: "você",
    returnLabel: "o retorno",
    depthQuestion: "O quanto você quer se aprofundar hoje?",
    depthOptions: ["Só olhando", "Um pouco", "Tenho algo em mente"],
    moodPhrase: "Estou me sentindo {mood} agora.",
  },
  it: {
    brand: "Il Ritorno",
    questions: ["Cosa sei pronto a smettere di recitare?"],
    moodCaption: "Non sai come dirlo a parole? Inizia qui",
    moods: ["Calmo", "Ansioso", "Arrabbiato", "Intorpidito", "Stanco", "Speranzoso", "Bloccato"],
    placeholderStart: "Rispondi, o di' qualsiasi cosa.",
    placeholderContinue: "Di' ciò che è vero.",
    settingsText: "Lascia un'email — se un impegno scade, Il Ritorno ti scriverà prima che tu debba tornare da solo.",
    saveLabel: "Salva",
    savedLabel: "Fatto.",
    emailPlaceholder: "tu@esempio.it",
    youLabel: "tu",
    returnLabel: "il ritorno",
    depthQuestion: "Quanto vuoi approfondire oggi?",
    depthOptions: ["Sto solo guardando", "Un po'", "Ho qualcosa in mente"],
    moodPhrase: "Mi sento {mood} in questo momento.",
  },
  he: {
    brand: "החזרה",
    questions: ["מה אתה מוכן להפסיק להעמיד פנים?"],
    moodCaption: "לא בטוח איך לנסח את זה? התחל כאן",
    moods: ["רגוע", "חרד", "כועס", "קהה", "עייף", "מקווה", "תקוע"],
    placeholderStart: "תענה, או תגיד משהו.",
    placeholderContinue: "תגיד מה שנכון.",
    settingsText: "השאר אימייל — אם התחייבות מגיעה למועד, תשמע מהחזרה לפני שתצטרך לחזור בעצמך.",
    saveLabel: "שמור",
    savedLabel: "סגור.",
    emailPlaceholder: "you@example.com",
    youLabel: "אתה",
    returnLabel: "החזרה",
    depthQuestion: "כמה עמוק אתה רוצה להיכנס היום?",
    depthOptions: ["רק מסתכל", "קצת", "יש לי משהו בראש"],
    moodPhrase: "אני מרגיש {mood} כרגע.",
  },
  ar: {
    brand: "العودة",
    questions: ["ما الذي أنت مستعد للتوقف عن التظاهر به؟"],
    moodCaption: "لا تعرف كيف تصوغها بكلمات؟ ابدأ هنا",
    moods: ["هادئ", "قلق", "غاضب", "خدر", "متعب", "متفائل", "عالق"],
    placeholderStart: "أجب، أو قل أي شيء.",
    placeholderContinue: "قل ما هو حقيقي.",
    settingsText: "اترك بريدًا إلكترونيًا — وإذا حان موعد التزام، ستسمع من العودة قبل أن تضطر للعودة بنفسك.",
    saveLabel: "حفظ",
    savedLabel: "تم.",
    emailPlaceholder: "you@example.com",
    youLabel: "أنت",
    returnLabel: "العودة",
    depthQuestion: "كم تريد أن تتعمق اليوم؟",
    depthOptions: ["فقط أتصفح", "قليلاً", "لدي شيء في بالي"],
    moodPhrase: "أشعر بأنني {mood} الآن.",
  },
  hi: {
    brand: "वापसी",
    questions: ["तुम अब क्या दिखावा करना बंद करने को तैयार हो?"],
    moodCaption: "शब्दों में नहीं आ रहा? यहाँ से शुरू करें",
    moods: ["शांत", "चिंतित", "क्रोधित", "सुन्न", "थका हुआ", "आशान्वित", "अटका हुआ"],
    placeholderStart: "जवाब दो, या कुछ भी कहो।",
    placeholderContinue: "जो सच है वह कहो।",
    settingsText: "एक ईमेल छोड़ें — अगर कोई प्रतिबद्धता देय हो, तो वापसी से आपको खुद वापस आने से पहले सुनने को मिलेगा।",
    saveLabel: "सेव करें",
    savedLabel: "हो गया।",
    emailPlaceholder: "you@example.com",
    youLabel: "तुम",
    returnLabel: "वापसी",
    depthQuestion: "आज तुम कितना गहराई में जाना चाहते हो?",
    depthOptions: ["बस देख रहा हूँ", "थोड़ा सा", "मेरे मन में कुछ है"],
    moodPhrase: "मुझे अभी {mood} महसूस हो रहा है.",
  },
  zh: {
    brand: "归来",
    questions: ["你准备好不再伪装什么了？"],
    moodCaption: "不知道怎么说？从这里开始",
    moods: ["平静", "焦虑", "愤怒", "麻木", "疲惫", "有希望", "卡住了"],
    placeholderStart: "回答，或者说点什么。",
    placeholderContinue: "说出真实的想法。",
    settingsText: "留下邮箱——如果有承诺到期，归来会在你需要自己回来之前联系你。",
    saveLabel: "保存",
    savedLabel: "已完成。",
    emailPlaceholder: "you@example.com",
    youLabel: "你",
    returnLabel: "归来",
    depthQuestion: "今天你想深入到什么程度？",
    depthOptions: ["只是看看", "一点点", "我心里有件事"],
    moodPhrase: "我现在感觉{mood}。",
  },
  ja: {
    brand: "帰還",
    questions: ["もう演じるのをやめてもいいことは何ですか？"],
    moodCaption: "言葉にならない？ここから始めてみて",
    moods: ["穏やか", "不安", "怒り", "無感覚", "疲れた", "希望がある", "行き詰まっている"],
    placeholderStart: "答えるか、何か言ってみて。",
    placeholderContinue: "本当のことを言って。",
    settingsText: "メールを残しておくと、約束の期限が来たとき、自分から戻る前に帰還から連絡します。",
    saveLabel: "保存",
    savedLabel: "完了。",
    emailPlaceholder: "you@example.com",
    youLabel: "あなた",
    returnLabel: "帰還",
    depthQuestion: "今日はどのくらい深く話したいですか？",
    depthOptions: ["ただ見ているだけ", "少しだけ", "気になることがある"],
    moodPhrase: "今は{mood}な気分です。",
  },
  ru: {
    brand: "Возвращение",
    questions: ["Что ты готов перестать изображать?"],
    moodCaption: "Не знаешь, как это выразить? Начни здесь",
    moods: ["Спокойный", "Тревожный", "Злой", "Онемевший", "Уставший", "С надеждой", "Застрявший"],
    placeholderStart: "Ответь или скажи что угодно.",
    placeholderContinue: "Скажи то, что правда.",
    settingsText: "Оставь email — если срок обязательства подойдёт, Возвращение напишет тебе раньше, чем придётся возвращаться самому.",
    saveLabel: "Сохранить",
    savedLabel: "Готово.",
    emailPlaceholder: "you@example.com",
    youLabel: "ты",
    returnLabel: "возвращение",
    depthQuestion: "Насколько глубоко ты хочешь зайти сегодня?",
    depthOptions: ["Просто смотрю", "Немного", "У меня кое-что на уме"],
    moodPhrase: "Сейчас я чувствую себя {mood}.",
  },
  sq: {
    brand: "Kthimi",
    questions: ["Çfarë je gati të mos shtiresh më?"],
    moodCaption: "Nuk je i sigurt si ta shprehësh me fjalë? Fillo këtu",
    moods: ["I qetë", "I shqetësuar", "I zemëruar", "I shurdhuar", "I lodhur", "Shpresëplotë", "I bllokuar"],
    placeholderStart: "Përgjigju, ose thuaj çfarëdo.",
    placeholderContinue: "Thuaj çfarë është e vërtetë.",
    settingsText: "Lër një email — nëse një angazhim vjen në afat, Kthimi do të të kontaktojë para se të duhet të kthehesh vetë.",
    saveLabel: "Ruaj",
    savedLabel: "U bë.",
    emailPlaceholder: "ti@shembull.com",
    youLabel: "ti",
    returnLabel: "kthimi",
    depthQuestion: "Sa thellë dëshiron të shkosh sot?",
    depthOptions: ["Vetëm po shikoj", "Pak", "Kam diçka në mendje"],
    moodPhrase: "Po ndihem {mood} tani.",
  },
  el: {
    brand: "Η Επιστροφή",
    questions: ["Τι είσαι έτοιμος να σταματήσεις να προσποιείσαι;"],
    moodCaption: "Δεν ξέρεις πώς να το εκφράσεις; Ξεκίνα εδώ",
    moods: ["Ήρεμος", "Ανήσυχος", "Θυμωμένος", "Μουδιασμένος", "Κουρασμένος", "Με ελπίδα", "Κολλημένος"],
    placeholderStart: "Απάντησε, ή πες οτιδήποτε.",
    placeholderContinue: "Πες αυτό που είναι αλήθεια.",
    settingsText: "Άφησε ένα email — αν μια δέσμευση λήξει, θα ακούσεις από την Επιστροφή πριν χρειαστεί να επιστρέψεις μόνος σου.",
    saveLabel: "Αποθήκευση",
    savedLabel: "Έγινε.",
    emailPlaceholder: "esy@example.com",
    youLabel: "εσύ",
    returnLabel: "η επιστροφή",
    depthQuestion: "Πόσο βαθιά θέλεις να πας σήμερα;",
    depthOptions: ["Απλώς κοιτάζω", "Λίγο", "Έχω κάτι στο μυαλό μου"],
    moodPhrase: "Αισθάνομαι {mood} αυτή τη στιγμή.",
  },
  hy: {
    brand: "Վերադարձը",
    questions: ["Ի՞նչ ես պատրաստ դադարել ձևացնել։"],
    moodCaption: "Չգիտե՞ս ինչպես բացատրել բառերով։ Սկսիր այստեղից",
    moods: ["Հանգիստ", "Անհանգիստ", "Զայրացած", "Թմրած", "Հոգնած", "Հուսադրված", "Խրված"],
    placeholderStart: "Պատասխանիր, կամ ասա ինչ-որ բան։",
    placeholderContinue: "Ասա, ինչն է ճշմարիտ։",
    settingsText: "Թող էլ. փոստ — եթե պարտավորության ժամկետը լրանա, Վերադարձը կգրի քեզ նախքան ինքդ վերադառնալը։",
    saveLabel: "Պահպանել",
    savedLabel: "Պատրաստ է։",
    emailPlaceholder: "you@example.com",
    youLabel: "դու",
    returnLabel: "վերադարձը",
    depthQuestion: "Որքա՞ն խորը ես ուզում գնալ այսօր։",
    depthOptions: ["Պարզապես նայում եմ", "Մի քիչ", "Մտքումս մի բան կա"],
    moodPhrase: "Հիմա ես {mood} եմ։",
  },
  sr: {
    brand: "Povratak",
    questions: ["Šta si spreman da prestaneš da glumiš?"],
    moodCaption: "Ne znaš kako to da izraziš rečima? Počni ovde",
    moods: ["Miran", "Anksiozan", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen"],
    placeholderStart: "Odgovori, ili reci bilo šta.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obaveza dospe, Povratak će ti se javiti pre nego što moraš sam da se vratiš.",
    saveLabel: "Sačuvaj",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ti",
    returnLabel: "povratak",
    depthQuestion: "Koliko duboko želiš da ideš danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    moodPhrase: "Trenutno se osećam {mood}.",
  },
  hr: {
    brand: "Povratak",
    questions: ["Što si spreman prestati glumiti?"],
    moodCaption: "Ne znaš kako to izraziti riječima? Počni ovdje",
    moods: ["Miran", "Tjeskoban", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen"],
    placeholderStart: "Odgovori, ili reci bilo što.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obveza dospije, Povratak će ti se javiti prije nego što se moraš sam vratiti.",
    saveLabel: "Spremi",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primjer.com",
    youLabel: "ti",
    returnLabel: "povratak",
    depthQuestion: "Koliko duboko želiš ići danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    moodPhrase: "Trenutno se osjećam {mood}.",
  },
  bs: {
    brand: "Povratak",
    questions: ["Šta si spreman prestati glumiti?"],
    moodCaption: "Ne znaš kako to izraziti riječima? Počni ovdje",
    moods: ["Miran", "Anksiozan", "Ljut", "Utrnuo", "Umoran", "Pun nade", "Zaglavljen"],
    placeholderStart: "Odgovori, ili reci bilo šta.",
    placeholderContinue: "Reci ono što je istina.",
    settingsText: "Ostavi email — ako obaveza dospije, Povratak će ti se javiti prije nego što moraš sam da se vratiš.",
    saveLabel: "Sačuvaj",
    savedLabel: "Gotovo.",
    emailPlaceholder: "ti@primjer.com",
    youLabel: "ti",
    returnLabel: "povratak",
    depthQuestion: "Koliko duboko želiš ići danas?",
    depthOptions: ["Samo gledam", "Malo", "Imam nešto na umu"],
    moodPhrase: "Trenutno se osjećam {mood}.",
  },
  bg: {
    brand: "Завръщането",
    questions: ["Какво си готов да спреш да преструваш?"],
    moodCaption: "Не знаеш как да го изразиш с думи? Започни оттук",
    moods: ["Спокоен", "Тревожен", "Ядосан", "Изтръпнал", "Уморен", "С надежда", "Заседнал"],
    placeholderStart: "Отговори, или кажи каквото и да е.",
    placeholderContinue: "Кажи това, което е истина.",
    settingsText: "Остави имейл — ако падеж на ангажимент настъпи, Завръщането ще се свърже с теб, преди да се наложи сам да се върнеш.",
    saveLabel: "Запази",
    savedLabel: "Готово.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ти",
    returnLabel: "завръщането",
    depthQuestion: "Колко дълбоко искаш да отидеш днес?",
    depthOptions: ["Просто гледам", "Малко", "Имам нещо наум"],
    moodPhrase: "В момента се чувствам {mood}.",
  },
  mk: {
    brand: "Враќањето",
    questions: ["Што си спремен да престанеш да глумиш?"],
    moodCaption: "Не знаеш како да го кажеш со зборови? Почни овде",
    moods: ["Смирен", "Вознемирен", "Лут", "Вкочанет", "Уморен", "Полн со надеж", "Заглавен"],
    placeholderStart: "Одговори, или кажи било што.",
    placeholderContinue: "Кажи го тоа што е вистина.",
    settingsText: "Остави email — ако достигне рок за обврска, Враќањето ќе ти пише пред сам да мора да се вратиш.",
    saveLabel: "Зачувај",
    savedLabel: "Готово.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ти",
    returnLabel: "враќањето",
    depthQuestion: "Колку длабоко сакаш да одиш денес?",
    depthOptions: ["Само гледам", "Малку", "Имам нешто на ум"],
    moodPhrase: "Во моментот се чувствувам {mood}.",
  },
  ro: {
    brand: "Întoarcerea",
    questions: ["Ce ești pregătit să încetezi să mai prefaci?"],
    moodCaption: "Nu știi cum să o pui în cuvinte? Începe aici",
    moods: ["Calm", "Anxios", "Furios", "Amorțit", "Obosit", "Plin de speranță", "Blocat"],
    placeholderStart: "Răspunde, sau spune orice.",
    placeholderContinue: "Spune ce e adevărat.",
    settingsText: "Lasă un email — dacă un angajament ajunge la termen, Întoarcerea îți va scrie înainte să fii nevoit să revii singur.",
    saveLabel: "Salvează",
    savedLabel: "Gata.",
    emailPlaceholder: "tu@exemplu.com",
    youLabel: "tu",
    returnLabel: "întoarcerea",
    depthQuestion: "Cât de adânc vrei să mergi azi?",
    depthOptions: ["Doar mă uit", "Puțin", "Am ceva pe suflet"],
    moodPhrase: "Mă simt {mood} chiar acum.",
  },
  sl: {
    brand: "Vrnitev",
    questions: ["Kaj si pripravljen nehati igrati?"],
    moodCaption: "Ne veš, kako to ubesediti? Začni tukaj",
    moods: ["Miren", "Tesnoben", "Jezen", "Otopel", "Utrujen", "Poln upanja", "Obtičal"],
    placeholderStart: "Odgovori, ali povej karkoli.",
    placeholderContinue: "Povej, kar je res.",
    settingsText: "Pusti email — če zapade obveznost, se ti bo Vrnitev oglasila, preden se boš moral sam vrniti.",
    saveLabel: "Shrani",
    savedLabel: "Opravljeno.",
    emailPlaceholder: "ti@primer.com",
    youLabel: "ti",
    returnLabel: "vrnitev",
    depthQuestion: "Kako globoko želiš iti danes?",
    depthOptions: ["Samo gledam", "Malo", "Nekaj imam v mislih"],
    moodPhrase: "Trenutno se počutim {mood}.",
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

export default function Home() {
  const [lang, setLang] = useState("en");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [openingQuestion, setOpeningQuestion] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [alivenessInput, setAlivenessInput] = useState("");
  const [mirrorLine, setMirrorLine] = useState<string | null>(null);
  const [shapeFamily, setShapeFamily] = useState<ShapeFamily | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const s = STRINGS[lang] || STRINGS.en;

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

    const id = getUserId();
    setUserId(id);
    fetch(`/api/chat?userId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { role: "user" | "assistant"; content: string }) => ({
              role: m.role,
              content: m.content,
            }))
          );
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

    // Restores the persistent artwork + ambient stage color on a fresh
    // load, since assign_shape_family / signal_depth only fire once each
    // and won't repeat themselves on a later visit to re-tell the client.
    fetch(`/api/shape?userId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.family) setShapeFamily(data.family);
        if (data.stage) {
          setStage(data.stage);
          if (data.stage === "return" && !localStorage.getItem(REVEAL_SHOWN_KEY)) {
            setShowReveal(true);
          }
        }
      })
      .catch(() => {
        /* quiet failure — the ambient state just starts fresh this visit */
      });
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, sending]);

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

  async function send(overrideText?: string, depthValue?: Depth | null) {
    const text = (overrideText ?? draft).trim();
    if (!text || !userId || sending) return;

    const isFirstMessage = messages.length === 0;
    const alivenessAnswer = isFirstMessage ? alivenessInput.trim() || undefined : undefined;

    setDraft("");
    setAlivenessInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.stage) setStage(data.stage);
      if (data.shapeFamily) setShapeFamily(data.shapeFamily);
      if (
        data.stage === "return" &&
        typeof window !== "undefined" &&
        !localStorage.getItem(REVEAL_SHOWN_KEY)
      ) {
        setShowReveal(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
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
  // interstitial first. Someone who just types their own opening line
  // instead skips both and goes straight through `send()`, same as before.
  function pickMood(moodIndex: number) {
    setSelectedMood(MOOD_KEYS[moodIndex]);
  }

  function pickDepth(depthValue: Depth, moodLabel: string) {
    setDepth(depthValue);
    const moodIndex = MOOD_KEYS.indexOf(moodLabel);
    const translatedMood = (s.moods[moodIndex] ?? moodLabel).toLowerCase();
    const phrase = s.moodPhrase.replace("{mood}", translatedMood);
    send(phrase, depthValue);
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

  function closeReveal() {
    try {
      localStorage.setItem(REVEAL_SHOWN_KEY, "1");
    } catch {
      /* private browsing or storage disabled — still closes for this visit */
    }
    setShowReveal(false);
  }

  const hasStarted = messages.length > 0;
  const awaitingDepth = selectedMood !== null && !hasStarted;

  const activeColors = stage
    ? STAGE_COLORS[stage]
    : selectedMood
    ? MOOD_COLORS[selectedMood]
    : null;

  if (showReveal && shapeFamily) {
    return <RevealOverlay family={shapeFamily} onClose={closeReveal} />;
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
            aria-label="Choose language"
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
            className="mood-chip onboarding-next"
            onClick={() => (isLast ? finishOnboarding() : setOnboardingIndex((i) => i + 1))}
          >
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

      <div className="topbar">
        <span className="wordmark">{s.brand}</span>
        <div className="topbar-right">
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            aria-label="Choose language"
          >
            {SUPPORTED_LANGS.map((code) => (
              <option key={code} value={code}>
                {NATIVE_NAMES[code] || code.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            className="settings-toggle"
            onClick={() => setShowSettings((sVal) => !sVal)}
            aria-expanded={showSettings}
            aria-label="Check-in settings"
          >
            ⋯
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          {shapeFamily && (
            <div className="artwork-card">
              <ShapeArt family={shapeFamily} stage={stage || "mystery"} size={96} />
              <div className="artwork-caption">
                {SHAPE_FAMILIES[shapeFamily].stageLines[
                  Math.max(0, STAGE_ORDER.indexOf((stage || "mystery") as (typeof STAGE_ORDER)[number]))
                ]}
              </div>
            </div>
          )}
          {mirrorLine && (
            <div className="mirror-card">
              <div className="mirror-card-label">the return</div>
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
        </div>
      )}

      {!hasStarted && !awaitingDepth ? (
        <div className="opening">
          <p className="opening-question">{openingQuestion}</p>
          <p className="mood-caption">{s.moodCaption}</p>
          <div className="mood-row">
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
          <div className="aliveness-field">
            <label htmlFor="aliveness">
              {s.alivenessQuestion || ALIVENESS_FALLBACK.alivenessQuestion}{" "}
              <span className="aliveness-optional">
                ({s.alivenessOptional || ALIVENESS_FALLBACK.alivenessOptional})
              </span>
            </label>
            <input
              id="aliveness"
              type="text"
              value={alivenessInput}
              onChange={(e) => setAlivenessInput(e.target.value)}
              disabled={sending}
            />
          </div>
        </div>
      ) : awaitingDepth ? (
        <div className="opening">
          <p className="mood-caption">{s.depthQuestion}</p>
          <div className="mood-row depth-row">
            {(["light", "medium", "deep"] as Depth[]).map((d, i) => (
              <button
                key={d}
                className="mood-chip"
                onClick={() => pickDepth(d, selectedMood!)}
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
            {messages.map((m, i) => (
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
                <p className="msg-bubble">
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!awaitingDepth && (
        <div className="composer">
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
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
