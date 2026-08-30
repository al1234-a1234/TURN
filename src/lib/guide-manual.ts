/**
 * نصّ دليلَي الاستخدام — الاستقبال والمالك.
 *
 * ── ولماذا في `lib` لا داخل الصفحة ──
 * ليصير قابلًا للاختبار. ودليلٌ يكذب أخطرُ من لا دليل: مضيفٌ يقرأ «أوقف
 * الطابور ليختفي الفرع» فيوقفه ظانًّا أنّه أغلق المطعم — والعملاء يتوافدون.
 * فالاختبار يحرس أنّ كلّ بندٍ يذكر «ماذا» و«متى»، وأنّ الثلاثة المتشابهة
 * (إغلاق الفرع · إيقاف الطابور · مزدحم الآن) يذكر كلٌّ منها فرقَه عن أخويه.
 *
 * ── والنصوص مطابقةٌ لما على الشاشة حرفيًّا ──
 * كلّ اسم زرٍّ هنا منسوخٌ من `status-toggle` و`queue-actions` و`walkin-form`
 * و`manage`. فمن يقرأ الدليل يبحث عن الكلمة نفسها لا عن مرادفها.
 */
export type Bilingual = readonly [ar: string, en: string];

export type ManualEntry = {
  /** اسم الزرّ أو الإعداد كما هو على الشاشة حرفيًّا. */
  title: Bilingual;
  /** ماذا يفعل. */
  what: Bilingual;
  /** متى يُستخدم. */
  when: Bilingual;
  /** الفرق عن الميزة المشابهة — إن وُجدت مشابهة تُلتبس بها. */
  vs?: Bilingual;
};

export type ManualSection = {
  id: string;
  title: Bilingual;
  intro?: Bilingual;
  entries: readonly ManualEntry[];
};

/* ═══════════════ دليل الاستقبال ═══════════════ */

/**
 * الثلاثة التي تُخلط: أخطر التباسٍ في الشاشة كلّها.
 * وهو أوّل قسمٍ عمدًا — لا في آخر الصفحة حيث لا يصل أحد.
 */
const THE_THREE: readonly ManualEntry[] = [
  {
    title: ["أغلق الفرع الآن", "Close branch now"],
    what: [
      "يوقف كلّ شيء: الفرع يظهر للعميل «مغلق»، ولا يستطيع أخذ دورٍ إطلاقًا. والحجز المسبق يبقى متاحًا إن كان مفعّلًا.",
      "Stops everything: guests see “closed” and cannot take a turn at all. Advance booking stays available if enabled.",
    ],
    when: [
      "انتهى الدوام، أو ظرفٌ طارئ أقفل المطعم.",
      "The shift ended, or something forced the restaurant to shut.",
    ],
    vs: [
      "أقوى من «إيقاف الطابور»: ذاك يُبقي الفرع مفتوحًا ويستقبل الداخلين، وهذا يقول «لا أحد يدخل».",
      "Stronger than “pause the queue”: that keeps the branch open and seating; this says “nobody comes in”.",
    ],
  },
  {
    title: ["افتح الطابور / الطابور مفتوح — اضغط لإيقافه", "Open the queue / Queue is open — tap to pause"],
    what: [
      "يقرّر: هل يأخذ العميل دورًا أم يدخل مباشرة؟ والفرع في الحالتين مفتوحٌ ومعروضٌ ويستقبل.",
      "Decides whether guests take a turn or walk straight in. Either way the branch stays open, listed, and seating.",
    ],
    when: [
      "افتحه عند بداية الازدحام. وأوقفه حين يفرغ المطعم — كي لا يأخذ أحدٌ دورًا رقمه ١ في مطعمٍ خالٍ فيظنّ غيرُه أنّ فيه زحمة فلا يجيء.",
      "Open it when the rush starts. Pause it when the place empties — so nobody takes turn #1 in an empty restaurant and scares others off.",
    ],
    vs: [
      "ليس إغلاقًا: الفرع يبقى ظاهرًا للعميل ويستقبله، والفرق أنّ لا دورَ يُؤخذ. ومن هو في الطابور فعلًا يبقى فيه ولا يُشطب.",
      "Not a closure: the branch stays visible and seating; only turn-taking stops. Anyone already in the queue stays.",
    ],
  },
  {
    title: ["علّم الفرع مزدحمًا الآن", "Mark branch busy now"],
    what: [
      "لافتةٌ للعميل فقط: «المطعم مزدحم الآن». لا تمنع دورًا ولا تُغلق شيئًا.",
      "A label for guests only: “busy right now.” It blocks nothing and closes nothing.",
    ],
    when: [
      "الطابور طويلٌ وتريد أن يعرف العميل قبل أن يقرّر المجيء.",
      "The queue is long and you want guests to know before they set out.",
    ],
    vs: [
      "أضعف الثلاثة: لا تمنع شيئًا. «إيقاف الطابور» يمنع الدور، و«إغلاق الفرع» يمنع كلّ شيء.",
      "The weakest of the three: it prevents nothing. Pausing blocks turns; closing blocks everything.",
    ],
  },
];

const RECEPTION_ENTRIES: readonly ManualEntry[] = [
  {
    title: ["أضف للطابور", "Add to queue"],
    what: [
      "يضع عميلًا واقفًا أمامك في الطابور بنفسك. الاسم اختياريّ وعدد الأشخاص مطلوب.",
      "Puts a guest standing in front of you into the queue yourself. Name optional, party size required.",
    ],
    when: [
      "عميلٌ لا يملك جوّالًا، أو لا يريد استعماله، أو جاء والطابور موقوف وتريد إدخاله.",
      "A guest without a phone, unwilling to use one, or arriving while the queue is paused.",
    ],
  },
  {
    title: ["تنبيه العميل (نبّه)", "Notify the guest"],
    what: [
      "يُرسل إشعارًا إلى جوّاله «دورك اقترب» ويعلّم صفَّه في الشاشة أنّه نُبّه.",
      "Sends “your turn is near” to their phone and marks the row as notified.",
    ],
    when: [
      "قبل أن تجهز الطاولة بدقائق، ليتحرّك نحو الاستقبال.",
      "A few minutes before the table is ready, so they start heading over.",
    ],
    vs: [
      "لا يُخرجه من الطابور — «جلوس» هو الذي يُخرجه.",
      "It does not remove them from the queue — “Seat” does.",
    ],
  },
  {
    title: ["جلوس", "Seat"],
    what: [
      "يُخرج الصفّ من الطابور ويحسبه ضمن «خدمناهم اليوم»، ويُبلّغ من خلفه أنّ دورهم تقدّم.",
      "Removes the row, counts it in “served today”, and tells everyone behind that they moved up.",
    ],
    when: ["جلس العميل فعلًا على الطاولة.", "The guest actually sat down."],
    vs: [
      "«إزالة» تُخرجه أيضًا لكن بلا احتسابه مخدومًا — فالفرق يظهر في تقاريرك.",
      "“Remove” also takes them out but doesn't count them as served — the difference shows in your reports.",
    ],
  },
  {
    title: ["إزالة", "Remove"],
    what: [
      "يُخرج الصفّ من الطابور بلا أن يُحسب مخدومًا، ويُبلّغ من خلفه أنّ دورهم تقدّم.",
      "Takes the row out without counting it as served, and tells those behind that they moved up.",
    ],
    when: [
      "العميل مشى، أو لم يحضر حين نودي.",
      "The guest left, or didn't show up when called.",
    ],
  },
  {
    title: ["اتصال مباشر · تذكير واتساب", "Call directly · WhatsApp reminder"],
    what: [
      "يفتحان الاتّصال أو واتساب برقم العميل جاهزًا. لا يغيّران حالة صفّه.",
      "Open a call or WhatsApp with the guest's number ready. Neither changes their row.",
    ],
    when: [
      "نُبّه ولم يحضر، أو يحتاج كلمةً لا إشعارًا.",
      "They were notified and didn't come, or need a word rather than a notification.",
    ],
  },
  {
    title: ["العدّاد والسقف", "The counter and the cap"],
    what: [
      "العدّاد يعرض عدد الواقفين الآن في كلّ قسم. والسقف — إن ضبطه المالك — يمنع دخول أحدٍ جديدٍ بعد بلوغ الرقم.",
      "The counter shows how many are waiting now in each area. The cap — if the owner set one — blocks new joins once it's reached.",
    ],
    when: [
      "اقرأ العدّاد قبل أن تَعِد عميلًا بمدّة. وإن بلغ السقف رأى العميل «الطابور ممتلئ» ولم يستطع الانضمام.",
      "Read the counter before promising a wait time. At the cap, guests see “queue is full” and cannot join.",
    ],
    vs: [
      "السقف يضبطه المالك من «الإدارة» لا من شاشتك، ويسري على العميل لا عليك: تستطيع أنت أن تضيف يدويًّا فوقه.",
      "The owner sets the cap in Management, not here. It applies to guests, not to you — you can still add manually.",
    ],
  },
];

const RECEPTION_MESSAGES: readonly ManualEntry[] = [
  {
    title: ["«تعذّر الحفظ — حدّث الصفحة وحاول ثانية»", "“Couldn't save — refresh and retry”"],
    what: [
      "لم تصل ضغطتك إلى الخادم. الحالة لم تتغيّر — ما تراه هو الحقيقة.",
      "Your tap didn't reach the server. Nothing changed — what you see is the truth.",
    ],
    when: [
      "حدّث الصفحة واضغط ثانية. إن تكرّرت ثلاث مرّات فالشبكة هي السبب غالبًا: جرّب بيانات الجوّال بدل الواي فاي.",
      "Refresh and tap again. If it repeats three times it's usually the network — try mobile data instead of Wi‑Fi.",
    ],
  },
  {
    title: ["«⏱ خارج أوقات الدوام المضبوطة»", "“⏱ Outside configured hours”"],
    what: [
      "الفرع يظهر للعميل مغلقًا تلقائيًّا بسبب ساعات الدوام، لا بسبب ضغطةٍ منك.",
      "The branch shows as closed automatically because of opening hours, not because of anything you tapped.",
    ],
    when: [
      "إن كان المطعم يعمل فعلًا فالساعات خاطئة — أبلغ المالك ليصحّحها من «الإدارة».",
      "If the restaurant is actually open, the hours are wrong — tell the owner to fix them in Management.",
    ],
  },
  {
    title: ["الصفّ اختفى وأنا أضغط عليه", "A row vanished as I tapped it"],
    what: [
      "أحدهم سبقك: العميل ألغى دوره من جوّاله، أو زميلٌ أجلسه من جهازٍ آخر.",
      "Someone got there first: the guest cancelled from their phone, or a colleague seated them on another device.",
    ],
    when: [
      "لا تُعِد الضغط — الشاشة تُحدّث نفسها. اقرأها من جديد وتابع.",
      "Don't tap again — the screen refreshes itself. Read it again and carry on.",
    ],
  },
];

/* ═══════════════ دليل المالك ═══════════════ */

const OWNER_ENTRIES: readonly ManualEntry[] = [
  {
    title: ["أوقات العمل (فتح / إغلاق)", "Opening hours (open / close)"],
    what: [
      "تُغلق الفرع وتفتحه تلقائيًّا كلّ يوم بلا ضغطةٍ من أحد. ويمكن دوامٌ مختلفٌ لبعض الأيّام.",
      "Close and open the branch automatically every day, with per-day overrides.",
    ],
    when: [
      "اضبطها مرّةً وانسها. وبعد منتصف الليل اكتب الإغلاق كما هو (٠١:٠٠ مثلًا) — النظام يفهم أنّه اليوم التالي.",
      "Set it once and forget it. For after-midnight closing write it as-is (e.g. 01:00) — the system understands it's the next day.",
    ],
    vs: [
      "الساعات دائمة، و«أغلق الفرع الآن» استثناءٌ لليلةٍ واحدة يُلغى تلقائيًّا فجرًا.",
      "Hours are permanent; “Close branch now” is a one-night exception that clears at dawn.",
    ],
  },
  {
    title: ["سقف حجم الطابور (اختياري)", "Waitlist size cap (optional)"],
    what: [
      "أقصى عددٍ من المنتظرين في وقتٍ واحد. بعده يرى العميل «الطابور ممتلئ» ولا ينضمّ.",
      "The maximum number waiting at once. Beyond it guests see “queue is full” and can't join.",
    ],
    when: [
      "حين يصير الطابور أطول ممّا تستطيع خدمته، فوعدٌ لا يُوفى أسوأ من رفضٍ صريح. واتركه «بلا سقف» إن لم تكن متأكّدًا.",
      "When the queue grows past what you can serve — an unkept promise is worse than a clear refusal. Leave it “No cap” if unsure.",
    ],
    vs: [
      "السقف رقمٌ دائم، و«إيقاف الطابور» قرارُ لحظة يتّخذه الاستقبال.",
      "The cap is a standing number; pausing the queue is a moment's decision by reception.",
    ],
  },
  {
    title: ["أقصى عدد للمجموعة", "Max party size"],
    what: [
      "أكبر عددٍ يستطيع العميل اختياره لمجموعته.",
      "The largest party size a guest can choose.",
    ],
    when: [
      "حين لا تملك طاولاتٍ تتّسع لأكثر من ذلك — فيُمنع الوعد قبل أن يُقطع.",
      "When you have no tables that large — it prevents the promise before it's made.",
    ],
  },
  {
    title: ["أقسام الجلوس (داخلي / خارجي)", "Seating areas (inside / outside)"],
    what: [
      "طوابيرُ مستقلّة: من ينتظر داخليًّا لا يزاحم من ينتظر خارجيًّا، ولكلّ قسمٍ عدّادُه.",
      "Independent queues: whoever waits inside doesn't compete with those outside, and each area has its own counter.",
    ],
    when: [
      "حين يختلف الانتظار بين قسمين اختلافًا حقيقيًّا. وسمِّ القسم باسمه الذي يعرفه العميل («الروف» لا «خارجي ٢»).",
      "When the wait genuinely differs between two areas. Name it what guests call it (“the roof”, not “outside 2”).",
    ],
  },
  {
    title: ["استقبال قائمة الانتظار", "Accept waitlist"],
    what: [
      "إعدادٌ دائم: هل يعمل هذا الفرع بنظام الدور أصلًا؟ إن أُطفئ يظهر للعميل «استقبال مباشر — بلا حجز دور».",
      "A standing setting: does this branch use turns at all? If off, guests see “walk-in — no queue”.",
    ],
    when: [
      "أطفئه لفرعٍ لا يعمل بالدور إطلاقًا.",
      "Turn it off for a branch that never uses turns.",
    ],
    vs: [
      "دائمٌ لا لحظيّ. لليلةٍ هادئةٍ استعمل «إيقاف الطابور» من شاشة الاستقبال — إطفاء هذا الإعداد يقول للعميل إنّ المطعم لا يعمل بالدور أبدًا.",
      "Permanent, not momentary. For a quiet night use “pause the queue” in Reception instead.",
    ],
  },
  {
    title: ["المنيو والأسعار", "Menu & prices"],
    what: [
      "**الفئة** مجموعةٌ تضمّ أطباقًا (مقبّلات، مشاوي)، و**الصنف** هو الطبق نفسه: له صورة ووصف وسعر.",
      "A **category** groups dishes (starters, grills); an **item** is the dish itself, with photo, description and price.",
    ],
    when: [
      "أنشئ الفئة أوّلًا، ثمّ أضِف الأصناف داخلها بزرّ «+ صنف». فئةٌ بلا أصناف تظهر للعميل فارغة.",
      "Create the category first, then add items inside it with “+ item”. An empty category shows up empty to guests.",
    ],
  },
  {
    title: ["الموظفون والصلاحيات", "Staff & permissions"],
    what: [
      "حسابٌ لكلّ موظّف، ولكلّ حسابٍ ما يستطيع رؤيته وفعله. وحسابٌ مربوطٌ بفرعٍ يرى فرعه وحده.",
      "An account per employee, each with its own permissions. An account tied to one branch sees only that branch.",
    ],
    when: [
      "أعطِ المضيف صلاحيّة «الاستقبال» وحدها — لا يحتاج التقارير ولا الإعدادات، وحصرُ الصلاحيّة يحمي بياناتك ويحمي الموظّف من ضغطةٍ لم يقصدها.",
      "Give a host only the Reception permission — narrower access protects your data and protects them from a tap they didn't mean.",
    ],
  },
];

export const MANUAL: readonly ManualSection[] = [
  {
    id: "three",
    title: ["الثلاثة التي تُخلط — اقرأها أوّلًا", "The three that get mixed up — read first"],
    intro: [
      "«إغلاق الفرع» و«إيقاف الطابور» و«مزدحم الآن» تبدو متشابهة وليست كذلك. من الأقوى إلى الأضعف:",
      "“Close branch”, “pause the queue”, and “busy now” look alike but aren't. Strongest to weakest:",
    ],
    entries: THE_THREE,
  },
  {
    id: "reception",
    title: ["دليل الاستقبال", "Reception guide"],
    entries: RECEPTION_ENTRIES,
  },
  {
    id: "messages",
    title: ["الرسائل التي قد تراها — وماذا تفعل", "Messages you may see — and what to do"],
    entries: RECEPTION_MESSAGES,
  },
];

export const OWNER_MANUAL: readonly ManualSection[] = [
  {
    id: "owner",
    title: ["دليل المالك", "Owner guide"],
    intro: [
      "كلّ ما في دليل الاستقبال يخصّك أيضًا. وهذه إعداداتٌ لا يراها الاستقبال:",
      "Everything in the reception guide applies to you too. These are settings reception doesn't see:",
    ],
    entries: OWNER_ENTRIES,
  },
];
