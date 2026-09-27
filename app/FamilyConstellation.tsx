"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { SephirahTier } from "@/lib/tree";
import {
  THEME_ORDER,
  THEMES,
  YOU_POSITION,
  FATHER_POSITION,
  MOTHER_POSITION,
  type FamilyTheme,
  type FamilyPatternState,
  type FamilyState,
} from "@/lib/family";

export type { FamilyTheme, FamilyPatternState, FamilyState };

type FamilyWisdomEntry = { pattern: string; cost: string; choice: string };
type FamilyWisdom = Record<FamilyTheme, FamilyWisdomEntry>;

// Static, same for every person -- what a theme means in general, not this
// person's specific story. The personal, accumulated read on what THIS
// person has actually disclosed is a separate "your pattern" section
// (Stage 5), grounded in their own history and regenerated as it grows.
// Keyed by lang, falling back to English, same convention as page.tsx's
// STRINGS/ONBOARDING_STRINGS.
const PATTERN_WISDOM: Record<string, FamilyWisdom> = {
  en: {
    money: {
      pattern:
        "A stance toward money that was modeled for you before you ever earned a cent of your own — money as scarcity, as safety, as proof, before it was ever just a tool.",
      cost: "This can quietly run every financial decision you make, long after the original reason for it stopped applying.",
      choice:
        "You get to decide whether this belief about money is still true for you, or whether it was only ever true for whoever taught it to you.",
    },
    love: {
      pattern:
        "The shape love took in the home you grew up in — who gave it, who withheld it, what it cost to receive it — often becomes the shape you keep looking for, or keep running from.",
      cost: "You may find yourself repeating the exact dynamic you swore you'd never repeat, without ever choosing to.",
      choice: "This one is genuinely yours to keep or end. The pattern doesn't require your participation forever.",
    },
    work_life: {
      pattern:
        "How you learned to treat rest, ambition, and your own worth through work — usually absorbed by watching how the adults around you treated theirs, not by anything they actually said.",
      cost:
        "This can turn into either constant overextension or constant self-doubt about whether you're doing enough — neither of which you actually chose.",
      choice: "Rest, ambition, and worth don't have to keep the exact shape they were handed to you in.",
    },
    body: {
      pattern:
        "What you learned about listening to pain, rest, and your own physical limits — often taught less by words than by what was modeled in silence.",
      cost: "This can mean real signals go ignored until they're loud enough to be impossible to miss.",
      choice: "You can choose to listen earlier than you were ever taught to.",
    },
  },
  es: {
    money: {
      pattern:
        "Una postura hacia el dinero que te modelaron antes de que ganaras un solo centavo propio — el dinero como escasez, como seguridad, como prueba, antes de ser solo una herramienta.",
      cost: "Esto puede regir en silencio cada decisión financiera que tomas, mucho después de que la razón original dejara de aplicarse.",
      choice: "Tú decides si esta creencia sobre el dinero sigue siendo cierta para ti, o si solo lo fue para quien te la enseñó.",
    },
    love: {
      pattern:
        "La forma que tomó el amor en el hogar donde creciste — quién lo daba, quién lo negaba, qué costaba recibirlo — a menudo se vuelve la forma que sigues buscando, o de la que sigues huyendo.",
      cost: "Puede que te encuentres repitiendo exactamente la dinámica que jurabas nunca repetir, sin haberlo elegido nunca.",
      choice: "Esto sí es genuinamente tuyo, para conservarlo o terminarlo. El patrón no exige tu participación para siempre.",
    },
    work_life: {
      pattern:
        "Cómo aprendiste a tratar el descanso, la ambición y tu propio valor a través del trabajo — normalmente absorbido al observar cómo los adultos a tu alrededor trataban los suyos, no por nada que dijeran realmente.",
      cost: "Esto puede convertirse en una extensión constante de ti mismo o en una duda constante sobre si estás haciendo suficiente — ninguna de las cuales elegiste realmente.",
      choice: "El descanso, la ambición y el valor no tienen que conservar la forma exacta en la que te los entregaron.",
    },
    body: {
      pattern:
        "Lo que aprendiste sobre escuchar el dolor, el descanso y tus propios límites físicos — a menudo enseñado menos con palabras que con lo modelado en silencio.",
      cost: "Esto puede significar que señales reales se ignoren hasta que sean demasiado fuertes para pasarlas por alto.",
      choice: "Puedes elegir escuchar antes de lo que nunca te enseñaron a hacerlo.",
    },
  },
  fr: {
    money: {
      pattern:
        "Une posture envers l'argent qui t'a été inculquée avant même que tu gagnes ton premier centime — l'argent comme rareté, comme sécurité, comme preuve, avant d'être un simple outil.",
      cost: "Cela peut discrètement gouverner chaque décision financière que tu prends, longtemps après que la raison initiale ait cessé de s'appliquer.",
      choice: "C'est à toi de décider si cette croyance sur l'argent est encore vraie pour toi, ou si elle ne l'a jamais été que pour celui qui te l'a enseignée.",
    },
    love: {
      pattern:
        "La forme que l'amour a prise dans le foyer où tu as grandi — qui le donnait, qui le retenait, ce qu'il coûtait de le recevoir — devient souvent la forme que tu continues à chercher, ou à fuir.",
      cost: "Tu pourrais te retrouver à répéter exactement la dynamique que tu jurais de ne jamais répéter, sans jamais l'avoir choisi.",
      choice: "Celui-ci est vraiment le tien, à garder ou à terminer. Le schéma n'exige pas ta participation pour toujours.",
    },
    work_life: {
      pattern:
        "Comment tu as appris à traiter le repos, l'ambition et ta propre valeur à travers le travail — généralement absorbé en observant comment les adultes autour de toi traitaient les leurs, pas par ce qu'ils disaient réellement.",
      cost: "Cela peut se transformer soit en surengagement constant, soit en doute permanent sur le fait d'en faire assez — deux choses que tu n'as jamais vraiment choisies.",
      choice: "Le repos, l'ambition et la valeur n'ont pas à garder exactement la forme dans laquelle on te les a transmis.",
    },
    body: {
      pattern:
        "Ce que tu as appris sur l'écoute de la douleur, du repos et de tes propres limites physiques — souvent enseigné moins par des mots que par ce qui était modelé en silence.",
      cost: "Cela peut signifier que de vrais signaux sont ignorés jusqu'à ce qu'ils soient trop forts pour être manqués.",
      choice: "Tu peux choisir d'écouter plus tôt que ce qu'on t'a jamais appris à faire.",
    },
  },
  de: {
    money: {
      pattern:
        "Eine Haltung zu Geld, die dir vorgelebt wurde, bevor du je einen eigenen Cent verdient hast — Geld als Mangel, als Sicherheit, als Beweis, bevor es je nur ein Werkzeug war.",
      cost: "Das kann still jede finanzielle Entscheidung bestimmen, die du triffst, lange nachdem der ursprüngliche Grund nicht mehr gilt.",
      choice: "Du entscheidest, ob dieser Glaubenssatz über Geld noch für dich stimmt — oder ob er nur für den galt, der ihn dir beigebracht hat.",
    },
    love: {
      pattern:
        "Die Form, die Liebe in dem Zuhause annahm, in dem du aufgewachsen bist — wer sie gab, wer sie zurückhielt, was es kostete, sie zu empfangen — wird oft zu der Form, die du weiter suchst oder vor der du weiter fliehst.",
      cost: "Vielleicht wiederholst du genau die Dynamik, die du dir geschworen hast, nie zu wiederholen, ohne es je bewusst gewählt zu haben.",
      choice: "Das hier ist wirklich deins, um es zu behalten oder zu beenden. Das Muster verlangt nicht für immer deine Teilnahme.",
    },
    work_life: {
      pattern:
        "Wie du gelernt hast, Ruhe, Ehrgeiz und deinen eigenen Wert durch Arbeit zu behandeln — meist aufgenommen, indem du beobachtet hast, wie die Erwachsenen um dich herum ihre eigenen behandelten, nicht durch das, was sie tatsächlich gesagt haben.",
      cost: "Das kann entweder in ständige Selbstüberforderung oder ständigen Selbstzweifel umschlagen, ob du genug tust — beides hast du nie wirklich gewählt.",
      choice: "Ruhe, Ehrgeiz und Wert müssen nicht die genaue Form behalten, in der sie dir übergeben wurden.",
    },
    body: {
      pattern:
        "Was du übers Zuhören auf Schmerz, Ruhe und deine eigenen körperlichen Grenzen gelernt hast — oft weniger durch Worte gelehrt als durch das, was in Stille vorgelebt wurde.",
      cost: "Das kann bedeuten, dass echte Signale ignoriert werden, bis sie zu laut sind, um sie zu übersehen.",
      choice: "Du kannst dich entscheiden, früher zuzuhören, als man es dich je gelehrt hat.",
    },
  },
  pt: {
    money: {
      pattern:
        "Uma postura em relação ao dinheiro que foi moldada para você antes mesmo de ganhar um centavo seu — dinheiro como escassez, como segurança, como prova, antes de ser apenas uma ferramenta.",
      cost: "Isso pode governar silenciosamente cada decisão financeira que você toma, muito depois de o motivo original deixar de valer.",
      choice: "Você decide se essa crença sobre dinheiro ainda é verdadeira para você, ou se só era verdadeira para quem te ensinou.",
    },
    love: {
      pattern:
        "A forma que o amor tomou no lar em que você cresceu — quem o dava, quem o negava, o que custava recebê-lo — muitas vezes se torna a forma que você continua procurando, ou continua evitando.",
      cost: "Você pode se pegar repetindo exatamente a dinâmica que jurou nunca repetir, sem nunca ter escolhido isso.",
      choice: "Este é genuinamente seu, para manter ou encerrar. O padrão não exige sua participação para sempre.",
    },
    work_life: {
      pattern:
        "Como você aprendeu a tratar o descanso, a ambição e o próprio valor através do trabalho — geralmente absorvido observando como os adultos ao seu redor tratavam os deles, não por nada que realmente disseram.",
      cost: "Isso pode se transformar em superexigência constante ou em dúvida constante sobre se você está fazendo o suficiente — nenhuma das quais você realmente escolheu.",
      choice: "Descanso, ambição e valor não precisam manter exatamente a forma em que foram entregues a você.",
    },
    body: {
      pattern:
        "O que você aprendeu sobre ouvir a dor, o descanso e seus próprios limites físicos — muitas vezes ensinado menos por palavras do que pelo que foi modelado em silêncio.",
      cost: "Isso pode significar que sinais reais são ignorados até ficarem altos demais para não serem percebidos.",
      choice: "Você pode escolher ouvir mais cedo do que jamais te ensinaram a fazer.",
    },
  },
  it: {
    money: {
      pattern:
        "Un atteggiamento verso il denaro che ti è stato modellato prima ancora di guadagnare un solo centesimo tuo — il denaro come scarsità, come sicurezza, come prova, prima di essere solo uno strumento.",
      cost: "Questo può guidare silenziosamente ogni decisione finanziaria che prendi, molto tempo dopo che la ragione originale ha smesso di valere.",
      choice: "Sta a te decidere se questa convinzione sul denaro è ancora vera per te, o se lo è mai stata solo per chi te l'ha insegnata.",
    },
    love: {
      pattern:
        "La forma che l'amore ha preso nella casa in cui sei cresciuto — chi lo dava, chi lo negava, cosa costava riceverlo — spesso diventa la forma che continui a cercare, o da cui continui a fuggire.",
      cost: "Potresti ritrovarti a ripetere esattamente la dinamica che giuravi di non ripetere mai, senza averlo mai scelto.",
      choice: "Questo è davvero tuo, da mantenere o interrompere. Lo schema non richiede la tua partecipazione per sempre.",
    },
    work_life: {
      pattern:
        "Come hai imparato a trattare il riposo, l'ambizione e il tuo valore attraverso il lavoro — di solito assorbito osservando come gli adulti intorno a te trattavano i propri, non per qualcosa che hanno effettivamente detto.",
      cost: "Questo può trasformarsi in un costante sovraccarico o in un dubbio costante sul fare abbastanza — nessuno dei due l'hai davvero scelto.",
      choice: "Riposo, ambizione e valore non devono mantenere esattamente la forma in cui ti sono stati consegnati.",
    },
    body: {
      pattern:
        "Cosa hai imparato sull'ascoltare il dolore, il riposo e i tuoi limiti fisici — spesso insegnato meno a parole che con ciò che veniva modellato in silenzio.",
      cost: "Questo può significare che segnali reali vengono ignorati finché non sono troppo forti per non essere notati.",
      choice: "Puoi scegliere di ascoltare prima di quanto ti sia mai stato insegnato.",
    },
  },
  he: {
    money: {
      pattern:
        "עמדה כלפי כסף שעוצבה עבורך עוד לפני שהרווחת אגורה משלך — כסף כמחסור, כביטחון, כהוכחה, לפני שהיה אי פעם רק כלי.",
      cost: "זה יכול להנחות בשקט כל החלטה כלכלית שאתה מקבל, זמן רב אחרי שהסיבה המקורית הפסיקה להתקיים.",
      choice: "אתה מחליט אם האמונה הזו על כסף עדיין נכונה עבורך, או שהיא הייתה נכונה רק למי שלימד אותך אותה.",
    },
    love: {
      pattern:
        "הצורה שאהבה לבשה בבית שבו גדלת — מי נתן אותה, מי מנע אותה, מה עלה לקבל אותה — לרוב הופכת לצורה שאתה ממשיך לחפש, או ממשיך לברוח ממנה.",
      cost: "ייתכן שתמצא את עצמך חוזר בדיוק על הדינמיקה שנשבעת שלעולם לא תחזור עליה, בלי שבחרת בכך אי פעם.",
      choice: "זה באמת שלך, לשמור או לסיים. התבנית לא דורשת את השתתפותך לנצח.",
    },
    work_life: {
      pattern:
        "איך למדת להתייחס למנוחה, לשאפתנות ולערך העצמי שלך דרך העבודה — לרוב נספג מתוך התבוננות באיך המבוגרים סביבך התייחסו לשלהם, לא מכל דבר שהם באמת אמרו.",
      cost: "זה יכול להפוך למאמץ יתר מתמיד או לספק עצמי מתמיד לגבי אם אתה עושה מספיק — אף אחד מהם לא באמת בחרת.",
      choice: "מנוחה, שאפתנות וערך לא חייבים לשמור על הצורה המדויקת שבה הועברו אליך.",
    },
    body: {
      pattern:
        "מה שלמדת על הקשבה לכאב, למנוחה ולגבולות הפיזיים שלך — לרוב נלמד פחות במילים ויותר במה שעוצב בשתיקה.",
      cost: "זה יכול להוביל לכך שאותות אמיתיים יתעלמו מהם עד שהם חזקים מכדי להתעלם מהם.",
      choice: "אתה יכול לבחור להקשיב מוקדם יותר ממה שאי פעם לימדו אותך.",
    },
  },
  ar: {
    money: {
      pattern:
        "موقف تجاه المال تم تشكيله لك قبل أن تكسب سنتًا واحدًا بنفسك — المال كندرة، كأمان، كإثبات، قبل أن يكون مجرد أداة.",
      cost: "يمكن لهذا أن يوجه بصمت كل قرار مالي تتخذه، بعد فترة طويلة من توقف السبب الأصلي عن الانطباق.",
      choice: "لك أن تقرر ما إذا كان هذا الاعتقاد حول المال لا يزال صحيحًا بالنسبة لك، أم أنه كان صحيحًا فقط لمن علّمك إياه.",
    },
    love: {
      pattern:
        "الشكل الذي اتخذه الحب في المنزل الذي نشأت فيه — من أعطاه، من منعه، ما كلّف الحصول عليه — غالبًا ما يصبح الشكل الذي تستمر في البحث عنه، أو تستمر في الهروب منه.",
      cost: "قد تجد نفسك تكرر بالضبط الديناميكية التي أقسمت ألا تكررها أبدًا، دون أن تختار ذلك يومًا.",
      choice: "هذا حقًا لك، لتحتفظ به أو تنهيه. النمط لا يتطلب مشاركتك إلى الأبد.",
    },
    work_life: {
      pattern:
        "كيف تعلمت التعامل مع الراحة والطموح وقيمتك الذاتية من خلال العمل — عادةً ما يُستوعب من خلال مراقبة كيف تعامل البالغون من حولك مع ذلك، وليس بأي شيء قالوه فعلاً.",
      cost: "يمكن أن يتحول هذا إما إلى إجهاد مستمر للنفس أو شك دائم فيما إذا كنت تفعل ما يكفي — لم تختر أيًا منهما فعلاً.",
      choice: "لا يجب أن تحافظ الراحة والطموح والقيمة على الشكل الدقيق الذي وُهبت لك به.",
    },
    body: {
      pattern:
        "ما تعلمته عن الاستماع للألم والراحة وحدودك الجسدية الخاصة — غالبًا ما يُعلَّم بكلمات أقل ومما تم تشكيله في الصمت.",
      cost: "قد يعني هذا أن الإشارات الحقيقية تُتجاهل حتى تصبح عالية بما يكفي بحيث يستحيل تفويتها.",
      choice: "يمكنك أن تختار الاستماع في وقت أبكر مما عُلِّمت أبدًا.",
    },
  },
  hi: {
    money: {
      pattern:
        "पैसे के प्रति एक रवैया जो तुम्हारे लिए तब आकार लिया गया जब तुमने अपना खुद का एक पैसा भी नहीं कमाया था — पैसा जो पहले सिर्फ एक उपकरण होने से पहले, कमी, सुरक्षा या सबूत के रूप में देखा गया।",
      cost: "यह चुपचाप तुम्हारे हर वित्तीय निर्णय को नियंत्रित कर सकता है, बहुत समय बाद तक जब मूल कारण लागू होना बंद हो चुका हो।",
      choice: "तुम तय करते हो कि पैसे के बारे में यह मान्यता अब भी तुम्हारे लिए सच है, या यह सिर्फ उसके लिए सच थी जिसने तुम्हें यह सिखाया।",
    },
    love: {
      pattern:
        "जिस घर में तुम बड़े हुए, वहाँ प्रेम ने जो रूप लिया — किसने इसे दिया, किसने इसे रोका, इसे पाने की क्या कीमत थी — अक्सर वही रूप बन जाता है जिसे तुम खोजते रहते हो, या जिससे भागते रहते हो।",
      cost: "हो सकता है तुम खुद को बिल्कुल वही गतिशीलता दोहराते हुए पाओ जिसे कभी न दोहराने की कसम खाई थी, बिना कभी इसे चुने।",
      choice: "यह सचमुच तुम्हारा है, रखने या समाप्त करने के लिए। पैटर्न को हमेशा के लिए तुम्हारी भागीदारी की आवश्यकता नहीं है।",
    },
    work_life: {
      pattern:
        "तुमने काम के माध्यम से आराम, महत्वाकांक्षा और अपने खुद के मूल्य के साथ कैसे व्यवहार करना सीखा — आमतौर पर यह देखकर आत्मसात किया गया कि तुम्हारे आसपास के बड़े लोग अपने साथ कैसे व्यवहार करते थे, न कि उन्होंने वास्तव में जो कहा उससे।",
      cost: "यह या तो लगातार खुद को अधिक बढ़ाने या इस लगातार संदेह में बदल सकता है कि क्या तुम पर्याप्त कर रहे हो — इनमें से किसी को भी तुमने वास्तव में नहीं चुना।",
      choice: "आराम, महत्वाकांक्षा और मूल्य को उसी सटीक रूप में बने रहने की ज़रूरत नहीं जिसमें वे तुम्हें सौंपे गए थे।",
    },
    body: {
      pattern:
        "दर्द, आराम और अपनी शारीरिक सीमाओं को सुनने के बारे में तुमने जो सीखा — अक्सर शब्दों से कम और चुप्पी में जो आकार दिया गया उससे ज़्यादा सिखाया गया।",
      cost: "इसका मतलब हो सकता है कि असली संकेतों को तब तक नज़रअंदाज़ किया जाए जब तक वे इतने तेज़ न हो जाएँ कि उन्हें चूकना नामुमकिन हो।",
      choice: "तुम चुन सकते हो कि जितनी जल्दी तुम्हें कभी सिखाया गया था, उससे पहले सुनना शुरू करो।",
    },
  },
  zh: {
    money: {
      pattern:
        "在你赚到自己的第一分钱之前，就已经为你塑造好的对金钱的态度——金钱意味着匮乏、安全感、证明，而在此之前它本该只是一个工具。",
      cost: "这可能在你不知不觉中主导你做出的每一个财务决定，即使最初的理由早已不再适用。",
      choice: "你可以决定这个关于金钱的信念对你来说是否仍然成立，还是它只对教你这一点的人成立过。",
    },
    love: {
      pattern:
        "你成长的家庭中爱的样子——谁给予它，谁拒绝它，接受它要付出什么代价——常常变成你不断寻找、或不断逃避的那种样子。",
      cost: "你可能会发现自己在重复那个你曾发誓绝不再重复的模式，却从未真正选择过这样做。",
      choice: "这一点真正属于你，去保留还是结束。这个模式并不要求你永远参与其中。",
    },
    work_life: {
      pattern:
        "你是如何通过工作学会对待休息、抱负和自身价值的——通常是通过观察身边的成年人如何对待他们自己的，而不是他们真正说过的任何话。",
      cost: "这可能会变成持续的过度付出，或者持续怀疑自己做得是否足够——这两者都不是你真正选择的。",
      choice: "休息、抱负和价值感不必保持它们被交到你手上时的那个样子。",
    },
    body: {
      pattern:
        "你学到的关于倾听疼痛、休息和自身身体极限的东西——往往不是通过言语教导的，而是通过沉默中被示范出来的。",
      cost: "这可能意味着真实的信号被忽视，直到它们强烈到无法忽视为止。",
      choice: "你可以选择比你曾被教导的更早去倾听。",
    },
  },
  ja: {
    money: {
      pattern:
        "自分の稼ぎを一銭も得る前から、あなたのために形作られていたお金への態度——それが単なる道具になる前は、お金は欠乏、安全、証明として存在していた。",
      cost: "これは、元々の理由が当てはまらなくなってからずっと後まで、あなたが下すあらゆる金銭的決断を静かに支配し続けることがあります。",
      choice: "このお金についての信念が今もあなたにとって真実かどうか、それとも教えてくれた人にとってのみ真実だったのかを決めるのは、あなたです。",
    },
    love: {
      pattern:
        "あなたが育った家庭で愛がとった形——誰がそれを与え、誰がそれを与えず、それを受け取るのに何を代償として払ったか——は、しばしばあなたが探し続ける、あるいは逃げ続ける形になります。",
      cost: "選んだつもりがなくても、決して繰り返すまいと誓ったまさにその力学を繰り返している自分に気づくかもしれません。",
      choice: "これは本当にあなたのものです。保つのも終わらせるのも。そのパターンは永遠にあなたの参加を要求しているわけではありません。",
    },
    work_life: {
      pattern:
        "休息や野心、自分自身の価値を仕事を通じてどう扱うかを学んだ経緯——たいていは周りの大人が実際に言ったことよりも、彼らが自分自身をどう扱っていたかを見て吸収したものです。",
      cost: "これは、常に自分を酷使し続けることか、十分にやれているかという絶え間ない自己不信のどちらかに転じることがあります——そのどちらも、あなたが本当に選んだものではありません。",
      choice: "休息、野心、価値は、あなたに手渡されたときとまったく同じ形を保つ必要はありません。",
    },
    body: {
      pattern:
        "痛みや休息、自分自身の身体的な限界に耳を傾けることについて学んだこと——それは言葉よりも、沈黙の中で示されたことによって教えられることが多いものです。",
      cost: "これは、本物のサインが見逃せないほど大きくなるまで無視され続けることを意味することがあります。",
      choice: "あなたは、これまで教わってきたよりも早く耳を傾けることを選べます。",
    },
  },
  ru: {
    money: {
      pattern:
        "Отношение к деньгам, которое сформировалось у тебя ещё до того, как ты заработал хоть цент сам — деньги как дефицит, как безопасность, как доказательство, прежде чем они стали просто инструментом.",
      cost: "Это может незаметно управлять каждым твоим финансовым решением ещё долго после того, как первоначальная причина перестала действовать.",
      choice: "Тебе решать, остаётся ли это убеждение о деньгах верным для тебя, или оно было верным только для того, кто тебя этому научил.",
    },
    love: {
      pattern:
        "Форма, которую любовь приняла в доме, где ты вырос — кто её давал, кто её удерживал, чего стоило её получить — часто становится формой, которую ты продолжаешь искать или от которой продолжаешь бежать.",
      cost: "Ты можешь обнаружить, что повторяешь именно ту динамику, которую поклялся никогда не повторять, так и не выбрав этого осознанно.",
      choice: "Это действительно принадлежит тебе — сохранить или прекратить. Паттерн не требует твоего участия навсегда.",
    },
    work_life: {
      pattern:
        "Как ты научился относиться к отдыху, амбициям и собственной ценности через работу — обычно усвоено через наблюдение за тем, как взрослые вокруг тебя относились к своим, а не через то, что они реально говорили.",
      cost: "Это может превратиться либо в постоянную перегрузку, либо в постоянное сомнение в том, достаточно ли ты делаешь — ни то, ни другое ты на самом деле не выбирал.",
      choice: "Отдых, амбиции и ценность не обязаны сохранять ту же форму, в которой они были тебе переданы.",
    },
    body: {
      pattern:
        "Чему ты научился насчёт того, как слушать боль, отдых и собственные физические пределы — часто этому учили не столько словами, сколько тем, что демонстрировалось молча.",
      cost: "Это может означать, что настоящие сигналы игнорируются, пока не становятся слишком громкими, чтобы их пропустить.",
      choice: "Ты можешь выбрать слушать раньше, чем тебя когда-либо этому учили.",
    },
  },
  sq: {
    money: {
      pattern:
        "Një qëndrim ndaj parasë që u modelua për ty para se të fitoje ndonjëherë qoftë edhe një cent tëndin — paratë si mungesë, si siguri, si provë, para se të ishin ndonjëherë thjesht një mjet.",
      cost: "Kjo mund të drejtojë në heshtje çdo vendim financiar që merr, shumë kohë pasi arsyeja fillestare ka pushuar së zbatuari.",
      choice: "Ti vendos nëse ky besim rreth parasë është ende i vërtetë për ty, ose nëse ka qenë i vërtetë vetëm për atë që ta mësoi.",
    },
    love: {
      pattern:
        "Forma që mori dashuria në shtëpinë ku u rrite — kush e jepte, kush e mohonte, çfarë kushtonte marrja e saj — shpesh bëhet forma që vazhdon ta kërkosh, ose nga e cila vazhdon të ikësh.",
      cost: "Mund ta gjesh veten duke përsëritur saktësisht dinamikën që u betove se nuk do ta përsërisje kurrë, pa e zgjedhur kurrë vetë.",
      choice: "Kjo është vërtet e jotja, për ta mbajtur ose për ta mbyllur. Modeli nuk kërkon pjesëmarrjen tënde përgjithmonë.",
    },
    work_life: {
      pattern:
        "Si mësove të trajtosh pushimin, ambicien dhe vlerën tënde përmes punës — zakonisht e përvetësuar duke vëzhguar si i trajtonin të rriturit përreth teje të tyret, jo nga diçka që thanë vërtet.",
      cost: "Kjo mund të kthehet ose në mbingarkesë të vazhdueshme, ose në dyshim të vazhdueshëm nëse po bën mjaftueshëm — asnjërën nga këto nuk e ke zgjedhur vërtet vetë.",
      choice: "Pushimi, ambicia dhe vlera nuk duhet ta mbajnë formën e saktë në të cilën t'u dhanë.",
    },
    body: {
      pattern:
        "Çfarë mësove për dëgjimin e dhimbjes, pushimit dhe kufijve të tu fizikë — shpesh mësuar më pak me fjalë e më shumë me atë që u modelua në heshtje.",
      cost: "Kjo mund të thotë që sinjalet e vërteta injorohen derisa bëhen tepër të forta për t'u anashkaluar.",
      choice: "Mund të zgjedhësh të dëgjosh më herët nga sa u mësove ndonjëherë.",
    },
  },
  el: {
    money: {
      pattern:
        "Μια στάση απέναντι στο χρήμα που διαμορφώθηκε για σένα προτού καν κερδίσεις ένα δικό σου λεπτό — το χρήμα ως έλλειψη, ως ασφάλεια, ως απόδειξη, πριν γίνει ποτέ απλώς ένα εργαλείο.",
      cost: "Αυτό μπορεί να καθορίζει σιωπηλά κάθε οικονομική απόφαση που παίρνεις, πολύ καιρό αφότου ο αρχικός λόγος έπαψε να ισχύει.",
      choice: "Εσύ αποφασίζεις αν αυτή η πεποίθηση για το χρήμα εξακολουθεί να ισχύει για σένα, ή αν ίσχυε μόνο για όποιον σου το έμαθε.",
    },
    love: {
      pattern:
        "Η μορφή που πήρε η αγάπη στο σπίτι όπου μεγάλωσες — ποιος την έδινε, ποιος την στερούσε, τι κόστιζε να τη λάβεις — συχνά γίνεται η μορφή που συνεχίζεις να αναζητάς, ή από την οποία συνεχίζεις να τρέχεις.",
      cost: "Μπορεί να βρεθείς να επαναλαμβάνεις ακριβώς τη δυναμική που ορκίστηκες ότι δεν θα επαναλάβεις ποτέ, χωρίς ποτέ να το επιλέξεις.",
      choice: "Αυτό είναι πραγματικά δικό σου, να το κρατήσεις ή να το τερματίσεις. Το μοτίβο δεν απαιτεί τη συμμετοχή σου για πάντα.",
    },
    work_life: {
      pattern:
        "Πώς έμαθες να αντιμετωπίζεις την ξεκούραση, τη φιλοδοξία και την αξία σου μέσα από τη δουλειά — συνήθως αφομοιωμένο παρατηρώντας πώς οι ενήλικες γύρω σου αντιμετώπιζαν τα δικά τους, όχι από κάτι που πραγματικά είπαν.",
      cost: "Αυτό μπορεί να μετατραπεί είτε σε συνεχή υπερπροσπάθεια είτε σε συνεχή αμφιβολία για το αν κάνεις αρκετά — τίποτα από τα δύο δεν επέλεξες πραγματικά.",
      choice: "Η ξεκούραση, η φιλοδοξία και η αξία δεν χρειάζεται να κρατήσουν την ακριβή μορφή στην οποία σου παραδόθηκαν.",
    },
    body: {
      pattern:
        "Τι έμαθες για το να ακούς τον πόνο, την ξεκούραση και τα δικά σου σωματικά όρια — συχνά διδαγμένο λιγότερο με λόγια και περισσότερο με ό,τι διαμορφώθηκε σιωπηλά.",
      cost: "Αυτό μπορεί να σημαίνει ότι αληθινά σήματα αγνοούνται μέχρι να γίνουν πολύ δυνατά για να τα προσπεράσεις.",
      choice: "Μπορείς να επιλέξεις να ακούς νωρίτερα απ' όσο σου έμαθαν ποτέ.",
    },
  },
  hy: {
    money: {
      pattern:
        "Փողի հանդեպ վերաբերմունք, որը ձևավորվել է քեզ համար դեռ մինչև որևէ սեփական ցենտ վաստակելը — փողը որպես սակավություն, որպես անվտանգություն, որպես ապացույց, նախքան այն երբևէ պարզապես գործիք դառնալը։",
      cost: "Սա կարող է լուռ կառավարել քո ամեն մի ֆինանսական որոշումը, երկար ժամանակ անց, երբ սկզբնական պատճառն այլևս ուժի մեջ չէ։",
      choice: "Դու ես որոշում, թե արդյոք փողի մասին այս համոզմունքը դեռ ճշմարիտ է քեզ համար, թե՞ այն ճշմարիտ էր միայն նրա համար, ով քեզ սովորեցրեց այն։",
    },
    love: {
      pattern:
        "Այն ձևը, որը սերն ընդունեց այն տանը, որտեղ մեծացել ես — ով էր տալիս այն, ով էր զլանում, ինչ էր արժենում այն ստանալը — հաճախ դառնում է այն ձևը, որը շարունակում ես փնտրել, կամ որից շարունակում ես փախչել։",
      cost: "Կարող ես հայտնվել՝ կրկնելով ճիշտ այն դինամիկան, որը երդվել էիր երբեք չկրկնել, առանց երբևէ դա գիտակցաբար ընտրելու։",
      choice: "Սա իսկապես քոնն է՝ պահելու կամ ավարտելու համար։ Օրինաչափությունը չի պահանջում քո մասնակցությունը հավիտյան։",
    },
    work_life: {
      pattern:
        "Ինչպես ես սովորել վերաբերվել հանգստին, փառասիրությանը և սեփական արժեքին աշխատանքի միջոցով — սովորաբար յուրացված ես դիտելով, թե ինչպես էին շրջապատիդ մեծահասակները վերաբերվում իրենցին, ոչ թե նրանց ասածից։",
      cost: "Սա կարող է վերածվել կամ մշտական գերծանրաբեռնվածության, կամ մշտական կասկածի, թե արդյոք բավարար ես անում — երկուսն էլ դու իրականում չես ընտրել։",
      choice: "Հանգիստը, փառասիրությունը և արժեքը պարտավոր չեն պահել այն ճշգրիտ ձևը, որով դրանք հանձնվել են քեզ։",
    },
    body: {
      pattern:
        "Ինչ ես սովորել ցավին, հանգստին և սեփական ֆիզիկական սահմաններին ականջ դնելու մասին — հաճախ սովորեցվել է ոչ այնքան խոսքերով, որքան լռության մեջ ցուցադրվածով։",
      cost: "Սա կարող է նշանակել, որ իրական ազդանշանները անտեսվում են, մինչև որ դրանք դառնում են չափազանց բարձր՝ բաց չթողնելու համար։",
      choice: "Կարող ես ընտրել ականջ դնել ավելի վաղ, քան երբևէ սովորեցրել են քեզ։",
    },
  },
  sr: {
    money: {
      pattern:
        "Stav prema novcu koji ti je oblikovan pre nego što si ikada zaradio ijedan svoj cent — novac kao oskudica, kao sigurnost, kao dokaz, pre nego što je ikada bio samo alat.",
      cost: "Ovo može tiho voditi svaku finansijsku odluku koju doneseš, dugo nakon što je originalni razlog prestao da važi.",
      choice: "Ti odlučuješ da li je to uverenje o novcu i dalje istinito za tebe, ili je bilo istinito samo za onog ko te je tome naučio.",
    },
    love: {
      pattern:
        "Oblik koji je ljubav poprimila u domu u kom si odrastao — ko ju je davao, ko ju je uskraćivao, šta je koštalo da je primiš — često postaje oblik koji nastavljaš da tražiš, ili od kog nastavljaš da bežiš.",
      cost: "Možeš se zateći kako ponavljaš tačno onu dinamiku koju si se zakleo da nikad nećeš ponoviti, a da to nikad nisi svesno izabrao.",
      choice: "Ovo je zaista tvoje, da zadržiš ili okončaš. Obrazac ne zahteva tvoje učešće zauvek.",
    },
    work_life: {
      pattern:
        "Kako si naučio da tretiraš odmor, ambiciju i sopstvenu vrednost kroz posao — obično usvojeno posmatranjem kako su odrasli oko tebe tretirali svoje, a ne bilo čime što su zaista rekli.",
      cost: "Ovo se može pretvoriti ili u stalno preopterećivanje sebe ili u stalnu sumnju da li radiš dovoljno — ništa od toga zapravo nisi izabrao.",
      choice: "Odmor, ambicija i vrednost ne moraju da zadrže tačan oblik u kom su ti predati.",
    },
    body: {
      pattern:
        "Šta si naučio o slušanju bola, odmora i sopstvenih fizičkih granica — često naučeno manje rečima, a više onim što je pokazano u tišini.",
      cost: "Ovo može značiti da se pravi signali ignorišu dok ne postanu previše glasni da bi se propustili.",
      choice: "Možeš izabrati da slušaš ranije nego što si ikada naučen da to radiš.",
    },
  },
  hr: {
    money: {
      pattern:
        "Stav prema novcu koji ti je oblikovan prije nego što si ikada zaradio ijedan svoj cent — novac kao oskudica, kao sigurnost, kao dokaz, prije nego što je ikad bio samo alat.",
      cost: "Ovo može tiho voditi svaku financijsku odluku koju doneseš, dugo nakon što je izvorni razlog prestao vrijediti.",
      choice: "Ti odlučuješ je li to uvjerenje o novcu i dalje istinito za tebe, ili je bilo istinito samo za onoga tko te je tome naučio.",
    },
    love: {
      pattern:
        "Oblik koji je ljubav poprimila u domu u kojem si odrastao — tko ju je davao, tko ju je uskraćivao, što je koštalo primiti je — često postaje oblik koji nastavljaš tražiti, ili od kojeg nastavljaš bježati.",
      cost: "Možeš se zateći kako ponavljaš točno onu dinamiku koju si se zakleo da nikad nećeš ponoviti, a da to nikad nisi svjesno izabrao.",
      choice: "Ovo je zaista tvoje, da zadržiš ili okončaš. Obrazac ne zahtijeva tvoje sudjelovanje zauvijek.",
    },
    work_life: {
      pattern:
        "Kako si naučio tretirati odmor, ambiciju i vlastitu vrijednost kroz posao — obično usvojeno promatranjem kako su odrasli oko tebe tretirali svoje, a ne bilo čime što su zaista rekli.",
      cost: "Ovo se može pretvoriti ili u stalno preopterećivanje sebe ili u stalnu sumnju radiš li dovoljno — ništa od toga zapravo nisi izabrao.",
      choice: "Odmor, ambicija i vrijednost ne moraju zadržati točan oblik u kojem su ti predani.",
    },
    body: {
      pattern:
        "Što si naučio o slušanju boli, odmora i vlastitih fizičkih granica — često naučeno manje riječima, a više onim što je pokazano u tišini.",
      cost: "Ovo može značiti da se pravi signali ignoriraju dok ne postanu preglasni da bi se propustili.",
      choice: "Možeš izabrati slušati ranije nego što si ikad naučen to raditi.",
    },
  },
  bs: {
    money: {
      pattern:
        "Stav prema novcu koji ti je oblikovan prije nego što si ikada zaradio ijedan svoj cent — novac kao oskudica, kao sigurnost, kao dokaz, prije nego što je ikad bio samo alat.",
      cost: "Ovo može tiho voditi svaku finansijsku odluku koju doneseš, dugo nakon što je izvorni razlog prestao vrijediti.",
      choice: "Ti odlučuješ da li je to uvjerenje o novcu i dalje istinito za tebe, ili je bilo istinito samo za onoga ko te je tome naučio.",
    },
    love: {
      pattern:
        "Oblik koji je ljubav poprimila u domu u kojem si odrastao — ko ju je davao, ko ju je uskraćivao, šta je koštalo primiti je — često postaje oblik koji nastavljaš tražiti, ili od kojeg nastavljaš bježati.",
      cost: "Možeš se zateći kako ponavljaš tačno onu dinamiku koju si se zakleo da nikad nećeš ponoviti, a da to nikad nisi svjesno izabrao.",
      choice: "Ovo je zaista tvoje, da zadržiš ili okončaš. Obrazac ne zahtijeva tvoje učešće zauvijek.",
    },
    work_life: {
      pattern:
        "Kako si naučio tretirati odmor, ambiciju i vlastitu vrijednost kroz posao — obično usvojeno posmatranjem kako su odrasli oko tebe tretirali svoje, a ne bilo čime što su zaista rekli.",
      cost: "Ovo se može pretvoriti ili u stalno preopterećivanje sebe ili u stalnu sumnju da li radiš dovoljno — ništa od toga zapravo nisi izabrao.",
      choice: "Odmor, ambicija i vrijednost ne moraju zadržati tačan oblik u kojem su ti predani.",
    },
    body: {
      pattern:
        "Šta si naučio o slušanju bola, odmora i vlastitih fizičkih granica — često naučeno manje riječima, a više onim što je pokazano u tišini.",
      cost: "Ovo može značiti da se pravi signali ignorišu dok ne postanu preglasni da bi se propustili.",
      choice: "Možeš izabrati slušati ranije nego što si ikad naučen to raditi.",
    },
  },
  bg: {
    money: {
      pattern:
        "Отношение към парите, оформено за теб още преди да си спечелил и цент сам — парите като недостиг, като сигурност, като доказателство, преди изобщо да са само инструмент.",
      cost: "Това може тихо да управлява всяко финансово решение, което вземаш, дълго след като първоначалната причина е престанала да важи.",
      choice: "Ти решаваш дали това убеждение за парите все още е вярно за теб, или е било вярно само за онзи, който те е научил на него.",
    },
    love: {
      pattern:
        "Формата, която любовта е приела в дома, в който си израснал — кой я е давал, кой я е отказвал, какво е струвало да я получиш — често се превръща във формата, която продължаваш да търсиш, или от която продължаваш да бягаш.",
      cost: "Може да се окажеш, че повтаряш точно динамиката, която си се заклел никога да не повториш, без изобщо да си го избрал.",
      choice: "Това наистина е твое, да го запазиш или прекратиш. Моделът не изисква участието ти завинаги.",
    },
    work_life: {
      pattern:
        "Как си се научил да се отнасяш към почивката, амбицията и собствената си стойност чрез работата — обикновено усвоено чрез наблюдение как възрастните около теб са се отнасяли към своите, а не чрез нещо, което наистина са казали.",
      cost: "Това може да се превърне или в постоянно пренапрежение, или в постоянно съмнение дали правиш достатъчно — нито едно от двете всъщност не си избрал.",
      choice: "Почивката, амбицията и стойността не трябва да запазват точната форма, в която са ти предадени.",
    },
    body: {
      pattern:
        "Какво си научил за слушането на болката, почивката и собствените си физически граници — често учено по-малко с думи и повече с това, което е демонстрирано мълчаливо.",
      cost: "Това може да означава, че истинските сигнали се игнорират, докато не станат твърде силни, за да бъдат пропуснати.",
      choice: "Можеш да избереш да слушаш по-рано, отколкото някога са те учили.",
    },
  },
  mk: {
    money: {
      pattern:
        "Став кон парите кој бил обликуван за тебе уште пред да заработиш ниту еден свој цент — парите како недостиг, како сигурност, како доказ, пред воопшто да бидат само алатка.",
      cost: "Ова може тивко да раководи со секоја финансиска одлука што ја носиш, долго откако првобитната причина престанала да важи.",
      choice: "Ти одлучуваш дали ова верување за парите сè уште е точно за тебе, или било точно само за оној што те научил на тоа.",
    },
    love: {
      pattern:
        "Формата што ја зела љубовта во домот каде што си пораснал — кој ја давал, кој ја ускратувал, што чинело да ја примиш — често станува формата која продолжуваш да ја бараш, или од која продолжуваш да бегаш.",
      cost: "Можеш да се затекнеш како ја повторуваш токму динамиката за која си се заколнал дека никогаш нема да ја повториш, без воопшто да си го избрал тоа.",
      choice: "Ова навистина е твое, да го задржиш или да го завршиш. Образецот не бара твое учество засекогаш.",
    },
    work_life: {
      pattern:
        "Како си научил да се однесуваш кон одморот, амбицијата и сопствената вредност преку работата — обично усвоено набљудувајќи како возрасните околу тебе се однесувале кон своите, а не преку нешто што навистина го кажале.",
      cost: "Ова може да се претвори или во постојано преоптоварување, или во постојано сомневање дали правиш доволно — ниту едно од двете всушност не си го избрал.",
      choice: "Одморот, амбицијата и вредноста не мора да ја задржат точната форма во која ти биле предадени.",
    },
    body: {
      pattern:
        "Што си научил за слушање на болката, одморот и сопствените физички граници — често учено помалку со зборови, а повеќе со она што било прикажано во тишина.",
      cost: "Ова може да значи дека вистинските сигнали се игнорираат сè додека не станат премногу гласни за да бидат пропуштени.",
      choice: "Можеш да избереш да слушаш порано отколку што некогаш си научен да го правиш тоа.",
    },
  },
  ro: {
    money: {
      pattern:
        "O atitudine față de bani care ți-a fost modelată înainte să câștigi vreodată un ban al tău — banii ca lipsă, ca siguranță, ca dovadă, înainte să fie doar un instrument.",
      cost: "Asta poate conduce în tăcere fiecare decizie financiară pe care o iei, mult după ce motivul inițial a încetat să se aplice.",
      choice: "Tu decizi dacă această credință despre bani mai este adevărată pentru tine, sau dacă a fost adevărată doar pentru cel care ți-a învățat-o.",
    },
    love: {
      pattern:
        "Forma pe care a luat-o iubirea în casa în care ai crescut — cine o dădea, cine o refuza, ce costa să o primești — devine adesea forma pe care continui să o cauți, sau de care continui să fugi.",
      cost: "S-ar putea să te trezești repetând exact dinamica pe care ai jurat să n-o mai repeți vreodată, fără să fi ales-o vreodată cu adevărat.",
      choice: "Asta chiar îți aparține, ca s-o păstrezi sau s-o încheiei. Tiparul nu cere participarea ta pentru totdeauna.",
    },
    work_life: {
      pattern:
        "Cum ai învățat să tratezi odihna, ambiția și propria valoare prin muncă — de obicei asimilat urmărind cum tratau adulții din jurul tău pe ale lor, nu prin ceva ce au spus cu adevărat.",
      cost: "Asta se poate transforma fie în supraîncărcare constantă, fie în îndoială constantă dacă faci suficient — niciuna dintre ele nu ai ales-o cu adevărat.",
      choice: "Odihna, ambiția și valoarea nu trebuie să păstreze forma exactă în care ți-au fost date.",
    },
    body: {
      pattern:
        "Ce ai învățat despre ascultarea durerii, odihnei și propriilor limite fizice — adesea predat mai puțin prin cuvinte, cât prin ce a fost modelat în tăcere.",
      cost: "Asta poate însemna că semnale reale sunt ignorate până devin prea puternice pentru a fi ratate.",
      choice: "Poți alege să asculți mai devreme decât ai fost vreodată învățat să o faci.",
    },
  },
  sl: {
    money: {
      pattern:
        "Odnos do denarja, ki ti je bil oblikovan, še preden si zaslužil svoj prvi cent — denar kot pomanjkanje, kot varnost, kot dokaz, preden je bil sploh le orodje.",
      cost: "To lahko tiho upravlja vsako finančno odločitev, ki jo sprejmeš, dolgo potem, ko prvotni razlog ni več veljal.",
      choice: "Ti se odločiš, ali to prepričanje o denarju še vedno drži zate, ali pa je držalo le za tistega, ki te ga je naučil.",
    },
    love: {
      pattern:
        "Oblika, ki jo je ljubezen dobila v domu, v katerem si odraščal — kdo jo je dajal, kdo jo je zadrževal, kaj je stalo, da si jo prejel — pogosto postane oblika, ki jo še naprej iščeš, ali pred katero še naprej bežiš.",
      cost: "Morda se znajdeš, kako ponavljaš ravno tisto dinamiko, ki si prisegel, da je nikoli ne boš ponovil, ne da bi to kdaj zares izbral.",
      choice: "To je resnično tvoje, da ga obdržiš ali končaš. Vzorec ne zahteva tvojega sodelovanja za vedno.",
    },
    work_life: {
      pattern:
        "Kako si se naučil obravnavati počitek, ambicijo in svojo lastno vrednost skozi delo — običajno privzeto z opazovanjem, kako so odrasli okoli tebe obravnavali svoje, ne s čimer koli, kar so dejansko rekli.",
      cost: "To se lahko spremeni bodisi v nenehno preobremenjenost bodisi v nenehen dvom, ali delaš dovolj — nič od tega dejansko nisi izbral.",
      choice: "Počitek, ambicija in vrednost ne rabijo obdržati natančne oblike, v kateri so ti bili predani.",
    },
    body: {
      pattern:
        "Kaj si se naučil o poslušanju bolečine, počitka in svojih lastnih telesnih meja — pogosto naučeno manj z besedami in bolj s tem, kar je bilo prikazano v tišini.",
      cost: "To lahko pomeni, da se resnični signali ignorirajo, dokler niso preglasni, da bi jih zgrešil.",
      choice: "Lahko se odločiš, da boš poslušal prej, kot so te kdaj naučili.",
    },
  },
};

type FamilyUIStrings = {
  heading: string;
  hint: string;
  inheritedLabel: string;
  costLabel: string;
  choiceLabel: string;
  yourPatternLabel: string;
  fatherLabel: string;
  motherLabel: string;
  youLabel: string;
  // "{tier}" is substituted with the translated tier word.
  tierPhrase: string;
  tierLabels: Record<SephirahTier, string>;
  themes: Record<FamilyTheme, string>;
};

const FAMILY_STRINGS: Record<string, FamilyUIStrings> = {
  en: {
    heading: "Where it comes from",
    hint: "Dark themes are things you haven't spoken yet — that's information too, not something missing. This carries across every conversation.",
    inheritedLabel: "What was likely inherited",
    costLabel: "What it's costing you now",
    choiceLabel: "Yours to decide",
    yourPatternLabel: "Your pattern",
    fatherLabel: "Father",
    motherLabel: "Mother",
    youLabel: "You",
    tierPhrase: "{tier} so far",
    tierLabels: { lightly_touched: "lightly touched", returned_to: "returned to", deeply_worked: "deeply worked" },
    themes: { money: "Money", love: "Love", work_life: "Work / Life", body: "Body" },
  },
  es: {
    heading: "De dónde viene",
    hint: "Los temas oscuros son cosas que aún no has dicho — eso también es información, no algo que falte. Esto se mantiene a través de cada conversación.",
    inheritedLabel: "Lo que probablemente heredaste",
    costLabel: "Lo que te está costando ahora",
    choiceLabel: "Es tuyo decidir",
    yourPatternLabel: "Tu patrón",
    fatherLabel: "Padre",
    motherLabel: "Madre",
    youLabel: "Tú",
    tierPhrase: "{tier} hasta ahora",
    tierLabels: { lightly_touched: "apenas tocado", returned_to: "al que has vuelto", deeply_worked: "profundamente trabajado" },
    themes: { money: "Dinero", love: "Amor", work_life: "Trabajo / Vida", body: "Cuerpo" },
  },
  fr: {
    heading: "D'où ça vient",
    hint: "Les thèmes sombres sont des choses que tu n'as pas encore dites — c'est aussi une information, pas quelque chose qui manque. Cela se poursuit à travers chaque conversation.",
    inheritedLabel: "Ce qui a probablement été hérité",
    costLabel: "Ce que ça te coûte maintenant",
    choiceLabel: "À toi de décider",
    yourPatternLabel: "Ton schéma",
    fatherLabel: "Père",
    motherLabel: "Mère",
    youLabel: "Toi",
    tierPhrase: "{tier} jusqu'à présent",
    tierLabels: { lightly_touched: "à peine effleuré", returned_to: "revisité", deeply_worked: "profondément travaillé" },
    themes: { money: "Argent", love: "Amour", work_life: "Travail / Vie", body: "Corps" },
  },
  de: {
    heading: "Woher es kommt",
    hint: "Dunkle Themen sind Dinge, die du noch nicht ausgesprochen hast — auch das ist eine Information, kein Fehlen. Das bleibt über jedes Gespräch hinweg bestehen.",
    inheritedLabel: "Was wahrscheinlich geerbt wurde",
    costLabel: "Was es dich jetzt kostet",
    choiceLabel: "Deine Entscheidung",
    yourPatternLabel: "Dein Muster",
    fatherLabel: "Vater",
    motherLabel: "Mutter",
    youLabel: "Du",
    tierPhrase: "bisher {tier}",
    tierLabels: { lightly_touched: "leicht berührt", returned_to: "wieder aufgegriffen", deeply_worked: "tief bearbeitet" },
    themes: { money: "Geld", love: "Liebe", work_life: "Arbeit / Leben", body: "Körper" },
  },
  pt: {
    heading: "De onde vem",
    hint: "Temas escuros são coisas que você ainda não disse — isso também é informação, não algo que falta. Isso persiste em todas as conversas.",
    inheritedLabel: "O que provavelmente foi herdado",
    costLabel: "O que isso está custando a você agora",
    choiceLabel: "É você quem decide",
    yourPatternLabel: "Seu padrão",
    fatherLabel: "Pai",
    motherLabel: "Mãe",
    youLabel: "Você",
    tierPhrase: "{tier} até agora",
    tierLabels: { lightly_touched: "levemente tocado", returned_to: "retomado", deeply_worked: "profundamente trabalhado" },
    themes: { money: "Dinheiro", love: "Amor", work_life: "Trabalho / Vida", body: "Corpo" },
  },
  it: {
    heading: "Da dove viene",
    hint: "I temi scuri sono cose che non hai ancora detto — anche questa è un'informazione, non qualcosa che manca. Questo persiste attraverso ogni conversazione.",
    inheritedLabel: "Cosa è stato probabilmente ereditato",
    costLabel: "Cosa ti sta costando ora",
    choiceLabel: "Sta a te decidere",
    yourPatternLabel: "Il tuo schema",
    fatherLabel: "Padre",
    motherLabel: "Madre",
    youLabel: "Tu",
    tierPhrase: "{tier} finora",
    tierLabels: { lightly_touched: "appena sfiorato", returned_to: "ripreso", deeply_worked: "lavorato a fondo" },
    themes: { money: "Denaro", love: "Amore", work_life: "Lavoro / Vita", body: "Corpo" },
  },
  he: {
    heading: "מאיפה זה מגיע",
    hint: "נושאים חשוכים הם דברים שעדיין לא אמרת — גם זה מידע, לא משהו חסר. זה נמשך בכל שיחה.",
    inheritedLabel: "מה כנראה עבר בירושה",
    costLabel: "מה זה עולה לך עכשיו",
    choiceLabel: "שלך להחליט",
    yourPatternLabel: "התבנית שלך",
    fatherLabel: "אבא",
    motherLabel: "אמא",
    youLabel: "אתה",
    tierPhrase: "{tier} עד כה",
    tierLabels: { lightly_touched: "נגעת בזה קלות", returned_to: "חזרת אליו", deeply_worked: "עובד לעומק" },
    themes: { money: "כסף", love: "אהבה", work_life: "עבודה / חיים", body: "גוף" },
  },
  ar: {
    heading: "من أين يأتي",
    hint: "المواضيع المظلمة هي أشياء لم تتحدث عنها بعد — وهذه أيضًا معلومة، وليست شيئًا ناقصًا. هذا يستمر عبر كل محادثة.",
    inheritedLabel: "ما تم توريثه على الأرجح",
    costLabel: "ما يكلفك الآن",
    choiceLabel: "لك أن تقرر",
    yourPatternLabel: "نمطك",
    fatherLabel: "الأب",
    motherLabel: "الأم",
    youLabel: "أنت",
    tierPhrase: "{tier} حتى الآن",
    tierLabels: { lightly_touched: "لُمس بخفة", returned_to: "عاد إليه", deeply_worked: "عُمل عليه بعمق" },
    themes: { money: "المال", love: "الحب", work_life: "العمل / الحياة", body: "الجسد" },
  },
  hi: {
    heading: "यह कहाँ से आता है",
    hint: "अंधेरे विषय वे चीज़ें हैं जो तुमने अभी तक नहीं कहीं — यह भी जानकारी है, कुछ छूटा हुआ नहीं। यह हर बातचीत में बना रहता है।",
    inheritedLabel: "जो शायद विरासत में मिला",
    costLabel: "अभी इसकी तुम्हें क्या कीमत चुकानी पड़ रही है",
    choiceLabel: "यह तय करना तुम्हारा है",
    yourPatternLabel: "तुम्हारा पैटर्न",
    fatherLabel: "पिता",
    motherLabel: "माँ",
    youLabel: "तुम",
    tierPhrase: "अब तक {tier}",
    tierLabels: { lightly_touched: "हल्के से छुआ", returned_to: "फिर से लौटा", deeply_worked: "गहराई से काम किया" },
    themes: { money: "पैसा", love: "प्रेम", work_life: "काम / जीवन", body: "शरीर" },
  },
  zh: {
    heading: "它从何而来",
    hint: "暗淡的主题是你还没说出口的事——这也是一种信息，不是缺失。这会延续到每一次对话中。",
    inheritedLabel: "可能继承来的东西",
    costLabel: "它现在正在让你付出的代价",
    choiceLabel: "由你决定",
    yourPatternLabel: "你的模式",
    fatherLabel: "父亲",
    motherLabel: "母亲",
    youLabel: "你",
    tierPhrase: "目前{tier}",
    tierLabels: { lightly_touched: "轻微触及", returned_to: "反复回到", deeply_worked: "深入梳理过" },
    themes: { money: "金钱", love: "爱情", work_life: "工作 / 生活", body: "身体" },
  },
  ja: {
    heading: "それがどこから来ているか",
    hint: "暗いテーマは、まだ口にしていないことです——それも情報の一つであり、欠けているわけではありません。これはすべての会話にわたって続きます。",
    inheritedLabel: "おそらく受け継いだもの",
    costLabel: "それが今あなたに何を代償として払わせているか",
    choiceLabel: "決めるのはあなた次第",
    yourPatternLabel: "あなたのパターン",
    fatherLabel: "父",
    motherLabel: "母",
    youLabel: "あなた",
    tierPhrase: "これまで{tier}",
    tierLabels: { lightly_touched: "軽く触れた", returned_to: "何度か戻った", deeply_worked: "深く向き合った" },
    themes: { money: "お金", love: "愛", work_life: "仕事 / 生活", body: "身体" },
  },
  ru: {
    heading: "Откуда это идёт",
    hint: "Тёмные темы — это то, о чём ты ещё не рассказал — это тоже информация, а не что-то недостающее. Это сохраняется через каждый разговор.",
    inheritedLabel: "Что, вероятно, было унаследовано",
    costLabel: "Чего это стоит тебе сейчас",
    choiceLabel: "Тебе решать",
    yourPatternLabel: "Твой паттерн",
    fatherLabel: "Отец",
    motherLabel: "Мать",
    youLabel: "Ты",
    tierPhrase: "пока что {tier}",
    tierLabels: { lightly_touched: "слегка затронуто", returned_to: "возвращались к этому", deeply_worked: "глубоко проработано" },
    themes: { money: "Деньги", love: "Любовь", work_life: "Работа / Жизнь", body: "Тело" },
  },
  sq: {
    heading: "Nga vjen",
    hint: "Temat e errëta janë gjëra që nuk i ke thënë ende — edhe kjo është informacion, jo diçka që mungon. Kjo vazhdon përgjatë çdo bisede.",
    inheritedLabel: "Çfarë ka gjasa të jetë trashëguar",
    costLabel: "Çfarë po të kushton tani",
    choiceLabel: "Është vendimi yt",
    yourPatternLabel: "Modeli yt",
    fatherLabel: "Babai",
    motherLabel: "Nëna",
    youLabel: "Ti",
    tierPhrase: "deri tani {tier}",
    tierLabels: { lightly_touched: "prekur lehtë", returned_to: "iu rikthye", deeply_worked: "punuar thellë" },
    themes: { money: "Paratë", love: "Dashuria", work_life: "Puna / Jeta", body: "Trupi" },
  },
  el: {
    heading: "Από πού προέρχεται",
    hint: "Τα σκοτεινά θέματα είναι πράγματα που δεν έχεις πει ακόμα — κι αυτό είναι πληροφορία, όχι κάτι που λείπει. Αυτό συνεχίζεται σε κάθε συνομιλία.",
    inheritedLabel: "Τι πιθανότατα κληρονομήθηκε",
    costLabel: "Τι σου κοστίζει τώρα",
    choiceLabel: "Δικιά σου απόφαση",
    yourPatternLabel: "Το μοτίβο σου",
    fatherLabel: "Πατέρας",
    motherLabel: "Μητέρα",
    youLabel: "Εσύ",
    tierPhrase: "{tier} μέχρι τώρα",
    tierLabels: { lightly_touched: "ελαφρώς αγγιγμένο", returned_to: "επέστρεψες σε αυτό", deeply_worked: "δουλεμένο σε βάθος" },
    themes: { money: "Χρήμα", love: "Αγάπη", work_life: "Δουλειά / Ζωή", body: "Σώμα" },
  },
  hy: {
    heading: "Որտեղից է դա գալիս",
    hint: "Մութ թեմաները այն բաներն են, որոնց մասին դեռ չես խոսել — դա նույնպես տեղեկատվություն է, ոչ թե բացակայող բան։ Սա շարունակվում է յուրաքանչյուր զրույցում։",
    inheritedLabel: "Ինչն է հավանաբար ժառանգված",
    costLabel: "Ինչ է դա հիմա քեզ արժենում",
    choiceLabel: "Քո ընտրությունն է",
    yourPatternLabel: "Քո օրինաչափությունը",
    fatherLabel: "Հայր",
    motherLabel: "Մայր",
    youLabel: "Դու",
    tierPhrase: "մինչ այժմ {tier}",
    tierLabels: { lightly_touched: "թեթևակի շոշափված", returned_to: "վերադարձել ես", deeply_worked: "խորապես մշակված" },
    themes: { money: "Փող", love: "Սեր", work_life: "Աշխատանք / Կյանք", body: "Մարմին" },
  },
  sr: {
    heading: "Odakle to dolazi",
    hint: "Tamne teme su stvari koje još nisi rekao — i to je informacija, ne nešto što nedostaje. Ovo se nastavlja kroz svaki razgovor.",
    inheritedLabel: "Šta je verovatno nasleđeno",
    costLabel: "Šta te to sada košta",
    choiceLabel: "Na tebi je da odlučiš",
    yourPatternLabel: "Tvoj obrazac",
    fatherLabel: "Otac",
    motherLabel: "Majka",
    youLabel: "Ti",
    tierPhrase: "do sada {tier}",
    tierLabels: { lightly_touched: "lako dotaknuto", returned_to: "vraćao si se tome", deeply_worked: "duboko obrađeno" },
    themes: { money: "Novac", love: "Ljubav", work_life: "Posao / Život", body: "Telo" },
  },
  hr: {
    heading: "Odakle to dolazi",
    hint: "Tamne teme su stvari koje još nisi rekao — i to je informacija, ne nešto što nedostaje. Ovo se nastavlja kroz svaki razgovor.",
    inheritedLabel: "Što je vjerojatno naslijeđeno",
    costLabel: "Što te to sada košta",
    choiceLabel: "Na tebi je da odlučiš",
    yourPatternLabel: "Tvoj obrazac",
    fatherLabel: "Otac",
    motherLabel: "Majka",
    youLabel: "Ti",
    tierPhrase: "dosad {tier}",
    tierLabels: { lightly_touched: "lako dotaknuto", returned_to: "vraćao si se tome", deeply_worked: "duboko obrađeno" },
    themes: { money: "Novac", love: "Ljubav", work_life: "Posao / Život", body: "Tijelo" },
  },
  bs: {
    heading: "Odakle to dolazi",
    hint: "Tamne teme su stvari koje još nisi rekao — i to je informacija, ne nešto što nedostaje. Ovo se nastavlja kroz svaki razgovor.",
    inheritedLabel: "Šta je vjerovatno naslijeđeno",
    costLabel: "Šta te to sada košta",
    choiceLabel: "Na tebi je da odlučiš",
    yourPatternLabel: "Tvoj obrazac",
    fatherLabel: "Otac",
    motherLabel: "Majka",
    youLabel: "Ti",
    tierPhrase: "dosad {tier}",
    tierLabels: { lightly_touched: "lako dotaknuto", returned_to: "vraćao si se tome", deeply_worked: "duboko obrađeno" },
    themes: { money: "Novac", love: "Ljubav", work_life: "Posao / Život", body: "Tijelo" },
  },
  bg: {
    heading: "Откъде идва",
    hint: "Тъмните теми са неща, които все още не си казал — и това е информация, а не нещо липсващо. Това продължава през всеки разговор.",
    inheritedLabel: "Какво вероятно е наследено",
    costLabel: "Какво ти коства това сега",
    choiceLabel: "Твое е да решиш",
    yourPatternLabel: "Твоят модел",
    fatherLabel: "Баща",
    motherLabel: "Майка",
    youLabel: "Ти",
    tierPhrase: "досега {tier}",
    tierLabels: { lightly_touched: "леко докоснато", returned_to: "върнал си се към него", deeply_worked: "задълбочено обработено" },
    themes: { money: "Пари", love: "Любов", work_life: "Работа / Живот", body: "Тяло" },
  },
  mk: {
    heading: "Од каде доаѓа тоа",
    hint: "Темните теми се работи што сè уште не си ги кажал — и тоа е информација, а не нешто што недостасува. Ова продолжува низ секој разговор.",
    inheritedLabel: "Што веројатно е наследено",
    costLabel: "Што те чини тоа сега",
    choiceLabel: "На тебе ти е да одлучиш",
    yourPatternLabel: "Твојот образец",
    fatherLabel: "Татко",
    motherLabel: "Мајка",
    youLabel: "Ти",
    tierPhrase: "досега {tier}",
    tierLabels: { lightly_touched: "лесно допрено", returned_to: "си се вратил на тоа", deeply_worked: "длабоко обработено" },
    themes: { money: "Пари", love: "Љубов", work_life: "Работа / Живот", body: "Тело" },
  },
  ro: {
    heading: "De unde vine",
    hint: "Temele întunecate sunt lucruri pe care încă nu le-ai spus — și asta e tot o informație, nu ceva care lipsește. Asta continuă în fiecare conversație.",
    inheritedLabel: "Ce a fost probabil moștenit",
    costLabel: "Ce te costă asta acum",
    choiceLabel: "E alegerea ta",
    yourPatternLabel: "Tiparul tău",
    fatherLabel: "Tată",
    motherLabel: "Mamă",
    youLabel: "Tu",
    tierPhrase: "până acum {tier}",
    tierLabels: { lightly_touched: "atins ușor", returned_to: "revenit asupra lui", deeply_worked: "lucrat în profunzime" },
    themes: { money: "Bani", love: "Iubire", work_life: "Muncă / Viață", body: "Corp" },
  },
  sl: {
    heading: "Od kod prihaja",
    hint: "Temne teme so stvari, ki jih še nisi povedal — tudi to je informacija, ne nekaj manjkajočega. To se nadaljuje skozi vsak pogovor.",
    inheritedLabel: "Kaj je bilo verjetno podedovano",
    costLabel: "Kaj te to zdaj stane",
    choiceLabel: "Tvoja odločitev",
    yourPatternLabel: "Tvoj vzorec",
    fatherLabel: "Oče",
    motherLabel: "Mati",
    youLabel: "Ti",
    tierPhrase: "doslej {tier}",
    tierLabels: { lightly_touched: "rahlo dotaknjeno", returned_to: "vrnil si se k temu", deeply_worked: "poglobljeno obdelano" },
    themes: { money: "Denar", love: "Ljubezen", work_life: "Delo / Življenje", body: "Telo" },
  },
};

function ThemeDetail({
  theme,
  state,
  userId,
  lang,
  onClose,
  closeLabel,
}: {
  theme: FamilyTheme;
  state: FamilyPatternState;
  userId: string | null;
  lang: string;
  onClose: () => void;
  closeLabel: string;
}) {
  const f = FAMILY_STRINGS[lang] || FAMILY_STRINGS.en;
  const wisdom = (PATTERN_WISDOM[lang] || PATTERN_WISDOM.en)[theme];
  const [reflection, setReflection] = useState<string | null>(null);
  const [loadingReflection, setLoadingReflection] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoadingReflection(false);
      return;
    }
    setLoadingReflection(true);
    fetch(
      `/api/reflection?userId=${encodeURIComponent(userId)}&system=family&node=${theme}&lang=${encodeURIComponent(lang)}`
    )
      .then((r) => r.json())
      .then((data) => setReflection(typeof data.reflection === "string" ? data.reflection : null))
      .catch(() => setReflection(null))
      .finally(() => setLoadingReflection(false));
  }, [userId, theme, lang]);

  return (
    <div className="tree-detail-overlay" onClick={onClose}>
      <div className="tree-detail-card" onClick={(e) => e.stopPropagation()}>
        <p className="tree-detail-name">{f.themes[theme]}</p>
        <p className="tree-detail-tier">{f.tierPhrase.replace("{tier}", f.tierLabels[state.tier])}</p>
        <div className="tree-detail-block">
          <p className="tree-detail-label">{f.inheritedLabel}</p>
          <p className="tree-detail-text">{wisdom.pattern}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">{f.costLabel}</p>
          <p className="tree-detail-text">{wisdom.cost}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">{f.choiceLabel}</p>
          <p className="tree-detail-text">{wisdom.choice}</p>
        </div>
        {(loadingReflection || reflection) && (
          <div className="tree-detail-block">
            <p className="tree-detail-label">{f.yourPatternLabel}</p>
            <p className="tree-detail-text tree-detail-reflection">
              {loadingReflection ? "···" : reflection}
            </p>
          </div>
        )}
        <button type="button" className="tree-detail-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

// Family Constellation: a second, separate long-arc symbol alongside the
// Tree of Life -- literal/biographical where the Tree is abstract. "You"
// and the two ancestral lines (Father/Mother) are fixed structural
// anchors, always visible, never tappable for their own detail. A theme
// lights up once a real pattern is disclosed, connecting two ways: a
// solid line back to "You", and a dashed line back to whichever
// ancestral line the AI judged it traces to -- never a fixed lookup.
export default function FamilyConstellation({
  state,
  userId,
  lang,
  eyebrowLabel,
  closeLabel,
  onClose,
}: {
  state: FamilyState;
  userId: string | null;
  lang: string;
  eyebrowLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const [openTheme, setOpenTheme] = useState<FamilyTheme | null>(null);
  const f = FAMILY_STRINGS[lang] || FAMILY_STRINGS.en;

  return (
    <div className="tree-overlay">
      <Image
        src="/backgrounds/archive-corridor.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="tree-bg-image"
      />
      <div className="tree-bg-scrim" aria-hidden="true" />
      <div className="tree-eyebrow">{eyebrowLabel}</div>
      <div className="tree-card">
        <p className="tree-heading">{f.heading}</p>
        <svg viewBox="0 0 310 300" className="tree-svg" aria-hidden="true">
          {/* Once broken, the ancestral trace-line is gone -- the pattern
              no longer needs to be explained by where it came from. */}
          {THEME_ORDER.map((theme) => {
            const s = state[theme];
            if (!s || !s.tracesTo || s.broken) return null;
            const anchor = s.tracesTo === "father" ? FATHER_POSITION : MOTHER_POSITION;
            const node = THEMES[theme];
            return (
              <line
                key={`trace-${theme}`}
                x1={node.x}
                y1={node.y}
                x2={anchor.x}
                y2={anchor.y}
                className="tree-path"
                stroke="var(--accent)"
                strokeOpacity={0.5}
                strokeWidth={0.9}
                strokeDasharray="3 3"
              />
            );
          })}
          {THEME_ORDER.map((theme) => {
            const s = state[theme];
            if (!s) return null;
            const node = THEMES[theme];
            return (
              <line
                key={`you-${theme}`}
                x1={YOU_POSITION.x}
                y1={YOU_POSITION.y}
                x2={node.x}
                y2={node.y}
                className="tree-path"
                stroke={s.broken ? "#e8b83c" : "var(--accent)"}
                strokeOpacity={s.broken ? 1 : 0.85}
                strokeWidth={s.broken ? 1.8 : 1.4}
              />
            );
          })}

          <circle
            cx={FATHER_POSITION.x}
            cy={FATHER_POSITION.y}
            r={5}
            className="tree-node-dot"
            fill="var(--surface-raised)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={FATHER_POSITION.x} y={FATHER_POSITION.y - 12} textAnchor="middle" className="tree-node-label">
            {f.fatherLabel}
          </text>

          <circle
            cx={MOTHER_POSITION.x}
            cy={MOTHER_POSITION.y}
            r={5}
            className="tree-node-dot"
            fill="var(--surface-raised)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={MOTHER_POSITION.x} y={MOTHER_POSITION.y - 12} textAnchor="middle" className="tree-node-label">
            {f.motherLabel}
          </text>

          <circle cx={YOU_POSITION.x} cy={YOU_POSITION.y} r={9} fill="var(--accent)" opacity={0.18} />
          <circle
            cx={YOU_POSITION.x}
            cy={YOU_POSITION.y}
            r={6}
            className="tree-node-dot"
            fill="var(--accent-strong)"
            fillOpacity={0.9}
            stroke="var(--accent)"
            strokeWidth={1}
          />
          <text x={YOU_POSITION.x} y={YOU_POSITION.y - 14} textAnchor="middle" className="tree-node-label">
            {f.youLabel}
          </text>

          {THEME_ORDER.map((theme) => {
            const node = THEMES[theme];
            const s = state[theme];
            const depth = s ? TIER_DEPTH[s.tier] : 0;
            return (
              <g key={theme}>
                {s && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={11 + depth * 9}
                    fill="var(--accent)"
                    opacity={0.08 + depth * 0.2}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={s ? 5 + depth * 2.5 : 5}
                  className="tree-node-dot"
                  fill={s ? "var(--accent-strong)" : "var(--surface-raised)"}
                  fillOpacity={s ? 0.55 + depth * 0.45 : 1}
                  stroke={s ? "var(--accent)" : "var(--border)"}
                  strokeWidth={1}
                  onClick={() => s && setOpenTheme(theme)}
                />
                <text x={node.x} y={node.y + 20} textAnchor="middle" className="tree-node-label">
                  {f.themes[theme]}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="tree-hint">{f.hint}</p>
        <button type="button" className="tree-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
      {openTheme && state[openTheme] && (
        <ThemeDetail
          theme={openTheme}
          state={state[openTheme]!}
          userId={userId}
          lang={lang}
          onClose={() => setOpenTheme(null)}
          closeLabel={closeLabel}
        />
      )}
    </div>
  );
}

// Brightness/size step per tier -- depth, not a tap count. Same shape as
// TreeOfLife.tsx's TIER_DEPTH; kept separate rather than shared since
// each is a tiny, purely presentational constant local to its own diagram.
const TIER_DEPTH: Record<SephirahTier, number> = {
  lightly_touched: 0.35,
  returned_to: 0.68,
  deeply_worked: 1,
};
