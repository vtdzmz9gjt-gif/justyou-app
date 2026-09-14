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
  },
};

const SUPPORTED_LANGS = Object.keys(STRINGS);

function detectLang(): string {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const c of candidates) {
    const short = c.toLowerCase().split("-")[0];
    if (SUPPORTED_LANGS.includes(short)) return short;
  }
  return "en";
}

// --- Onboarding script screens, shown once before anything else ---
// Copy is final and approved — preserve wording and order exactly as
// written in onboarding-script.md; only the screen-break points here are
// an implementation choice.
function getOnboardingScreens(): { html: JSX.Element }[] {
  return [
    {
      html: (
        <>
          <p>Most things on your phone are built to hold your attention as long as possible. This one isn&rsquo;t.</p>
          <p>The whole point is the opposite: to help you need it less. If it does its job, you leave — not because you got bored, but because you got somewhere.</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p className="onb-hint">Who we are</p>
          <p>Not a company chasing your attention. Not a wellness brand with a quiz and a subscription. A small group who got tired of performing ourselves, and built the thing we wished existed.</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p>Think of it as a mentor — built on the thinking of the most influential and successful people who ever lived, distilled down to what actually works. Not just information. Something closer to spiritual, if you let it be.</p>
          <p>This isn&rsquo;t here to help you understand yourself. It&rsquo;s here to help you win — at the things that actually matter to you. Understanding yourself just happens to be what it takes to get there.</p>
        </>
      ),
    },
    {
      html: (
        <>
          <p>Not therapy. Not a chatbot. Not another app asking for five minutes of your attention.</p>
          <p className="onb-sub">This is a space that follows you through five honest stages — the same ones underneath almost every real change a person ever makes, whether they had a name for it or not:</p>
        </>
      ),
    },
    {
      html: (
        <div className="onb-stages">
          <p><strong>Mystery.</strong> Something&rsquo;s off. You can&rsquo;t name it yet.</p>
          <p><strong>Safety.</strong> You&rsquo;ve admitted it — but you&rsquo;re still protecting yourself from what you might find.</p>
          <p><strong>Recognition.</strong> The pattern becomes visible. Not the circumstances. The role you&rsquo;ve been playing.</p>
          <p><strong>Courage.</strong> You know the truth now. It&rsquo;s asking something of you.</p>
          <p><strong>Return.</strong> Not fixed. Not arrived. Just no longer performing.</p>
        </div>
      ),
    },
    {
      html: (
        <p>You won&rsquo;t be told which stage you&rsquo;re in while you&rsquo;re in it. That&rsquo;s on purpose — naming it too early turns a real process into a personality quiz. You&rsquo;ll find out where you landed when the conversation is ready to tell you, not before.</p>
      ),
    },
    {
      html: (
        <>
          <p className="onb-hint">Before you start</p>
          <p>You won&rsquo;t get there today, and that&rsquo;s fine. Nobody starts anywhere but the beginning. Wherever you actually are right now, it&rsquo;ll meet you there.</p>
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
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const s = STRINGS[lang] || STRINGS.en;

  useEffect(() => {
    const detected = detectLang();
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

    setDraft("");
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.stage) setStage(data.stage);
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
    send(`I'm feeling ${moodLabel.toLowerCase()} right now.`, depthValue);
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

  const hasStarted = messages.length > 0;
  const awaitingDepth = selectedMood !== null && !hasStarted;

  const activeColors = stage
    ? STAGE_COLORS[stage]
    : selectedMood
    ? MOOD_COLORS[selectedMood]
    : null;

  if (showOnboarding) {
    const screens = getOnboardingScreens();
    const isLast = onboardingIndex === screens.length - 1;
    return (
      <div className="app onboarding">
        <div
          className="ambient-glow"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${STAGE_COLORS.mystery.glow}, transparent 65%)`,
          }}
        />
        <div className="onboarding-content">
          {screens[onboardingIndex].html}
          <button
            className="mood-chip onboarding-next"
            onClick={() => (isLast ? finishOnboarding() : setOnboardingIndex((i) => i + 1))}
          >
            {isLast ? "Begin" : "Continue"}
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
                {code.toUpperCase()}
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
