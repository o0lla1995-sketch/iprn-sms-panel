# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: دراسة شاملة للوحة SMS Platform (sms.carefulsupport.com) بحساب المستخدم — جميع الصفحات — وإنتاج تقرير PDF عربي RTL شامل (20+ صفحة) وفق متطلبات المستخدم: فهم شامل + تركيز على محور الإرسال + متطلبات التفعيل والمهام معاً + بدون لقطات شاشة.

Work Log:
- حمّل مهارتي agent-browser وpdf، ثم استوضح المتطلبات عبر AskUserQuestion (فهم شامل، PDF، 20+ صفحة، محور الإرسال، كلا المعنيين للمطلوب، بلا صور).
- سجّل الدخول إلى sms.carefulsupport.com بحساب Abass (#25) واستكشف الصفحات الـ12 كاملة: Dashboard، Outbound Messages/Connectors، Settlement Rates، Price lists، Numbers (27,506 رقم، Mine=0)، Release history، Profiles، Access List (250 صف)، Inbound Connectors (ربط system_id 450 «Connecting»، مفتاح API، Dry-run ×2: has_route=false)، Billing (رصيد 0، حد دفع 200$)، Support (استُجوب المساعد مرتين).
- استقرأ نموذج العمل: منصة Wholesale+PRN، دور المستخدم مورد/Supplier؛ عائقان: خادم vemail.pp.ua:2775 (ETIMEOUT منذ 9/30) وصفر أرقام ممدّدة/مسارات؛ قاعدة DLR (EXPIRED خلال 24 ساعة) والسحب التلقائي بعد 7 أيام خمول.
- قرأ ملفات مهارة PDF كاملة (SKILL + fonts + creative-flow + overflow + cover + pagination + typography + palette + cover-backgrounds + charts + geometry).
- أثبت بالتجربة أن Paged.js يُفقد محتوى RTL، فاعتمد html2pdf-next.js --nopaged؛ وأثبت أن break-after:page مع غلاف بارتفاع صفحة كامل يولّد صفحة فارغة — الحل: غلاف 720×1020 بلا break-after + box-decoration-break:clone (تم اختباره: يمنح كل صفحة هوامشها).
- بنى التقرير من 6 أجزاء HTML (قالب الغلاف 07 Crystal Blue RTL معكوس، خط Cairo + JetBrains Mono): فهرس بأرقام حقيقية (تمريرتان عبر نمط anchored ^NN§$ للاستخراج البصري المعكوس)، 10 أقسام، 8 جداول، مخطط تدفق SVG، بطاقات إحصاء.
- أصلح امتلاء الصفحات: جعل الجداول >8 صفوف splittable (رفع ص22 من 34% إلى 90%) وأضاف قسم مؤشرات النجاح 30/60/90 + بطاقة خلاصة (الصفحة الأخيرة 60%).
- رقّم الصفحات (غلاف مخفي، فهرس i، متن 1–22) عبر pypdf+reportlab، وضبط البيانات الوصفية.
- QA: poster_validate PASS، pdf_qa — 10 فحوص ناجحة (تحذيرات CJK الإيجابيات الكاذبة موثقة)، font.check صفر مشاكل، تدقيق هندسي للغلاف (إطار #4DA8DA 45.7pt، خلفية #0a1628 full-bleed).

Stage Summary:
- المخرجات: download/دراسة_لوحة_SMS_Platform.pdf (24 صفحة، 1.5MB) + download/دراسة_لوحة_SMS_Platform.html (مصدر قابل للتعديل).
- الملفات المساندة: scripts/report/part1..6.html، scripts/report_final.pdf، scripts/report_numbered.pdf، scripts/stamp_pages.py، explore/*.txt (لقطات نصية للصفحات الـ12).
- قرار فني مفتاح: محرك التحويل nopaged (متوافق RTL) بديلاً عن Paged.js؛ إخفاء ذيل مفتاح API في التقرير عمداً لأسباب أمنية.

---
Task ID: 2
Agent: Super Z (main agent)
Task: بناء لوحة IPRN SMS TRAFFIC خاصة متعددة الأدوار فوق حساب المستخدم في منصة الجملة (sms.carefulsupport.com) بنموذج هامش 30% مخفي، ونشرها على Coolify عبر GitHub.

Work Log:
- درس صفحات المنصة الـ12 من بيانات الاستكشاف السابقة (explore/*.txt) واستخلص النموذج التشغيلي: مورد/Supplier يشغّل SMSC، والمنصة ترتبط به (Outbound Connectors: 35.224.28.251، generic-smpp34، MO mode SAME_BIND)، ويدفع Vendor Rate لكل رسالة محمولة (تسوية AP: حد 200$، أسبوعي خصم 30% / شهري كامل)، بقاعدة DLR 24 ساعة وقاعدة 7 أيام خمول.
- بنى اللوحة كاملة على Next.js 16 + Prisma/SQLite: 3 أدوار (ADMIN/AGENT/USER)، محرك أسعار (كسب المستخدم = السعر الحقيقي × (1−الهامش%))، هامش مخفي لا يظهر في أي صفحة أو API لغير الأدمن (تحقق آلي: 0 تسريب)، عمولات وكلاء من حصة الأدمن، محفظة وقيود، طلبات سحب بجدولة أسبوعي/شهري، أرقام مع عدّاد 7 أيام، ترافيك P2P/A2P بتصدير وحذف ناعم، REST API للمستخدمين (x-api-key)، تدقيق، دليل تشغيل.
- بوابة SMPP مدمجة (instrumentation): تستقبل ربط المنصة (submit_sm) وترد بإيصالات DELIVRD تلقائية، وتربط مستخدمي اللوحة كمستقبلين (deliver_sm)؛ + مستقبل vendor-copy MO webhook بمسار سري + مستقبل HTTP_PUSH.
- اختبر E2E محليًا: دورة SMPP كاملة (bind→submit→تسجيل 0.0084 مستخدم/0.0036 هامش→DLR)، webhook (إنشاء/403/كشف تكرار)، REST API (تسريب صفري للمستخدم)، وواجهة كاملة عبر agent-browser بثلاث أدوار.
- نشر على GitHub (o0lla1995-sketch/iprn-sms-panel، عام بلا أسرار) ثم Coolify عبر REST API (رمز Root): مشروع IPRN SMS Panel + تطبيق + نطاق https مع شهادة LE + تخزين دائم /app/db + متغيرات بيئة إنتاجية.
- عالج أخطاء النشر: عدم تطابق محرك Prisma (binaryTargets متعددة)، HOSTNAME=0.0.0.0 لـ next standalone، كوكي Secure تكيّفي مع مخطط URL، بذر خلفي غير معطّل، إعادة تشغيل بروكسي Traefik.
- تحقق إنتاجي نهائي: HTTPS 200 + جلسة أدمن كاملة + webhook إنتاجي (created/403) + لقطة شاشة.

Stage Summary:
- المخرجات الحية: https://wmjkooqf85srmiokr7g1aljm.130.61.171.201.sslip.io (أدمن admin@iprn.local / كلمة المرور في متغير Coolify: ADMIN_PASSWORD — لا تُخزَّن هنا) + مستودع GitHub + 8 خطوات دليل تشغيل داخل اللوحة.
- البيانات السرية في متغيرات Coolify فقط (كلمة أدمن، مفتاح API للمنصة، أسرار SMPP/webhook).
- عائق متبقٍ خارج سيطرة اللوحة: جدار حماية الخادم يمنع المنفذ 2775 خارجيًا — على المستخدم فتحه ليربط بمنصة الجملة، ثم إدخال بيانات الموصل من صفحة Settings→Upstream (cheat-sheet جاهز) وتخصيص المسارات من صفحات المنصة.

---
Task ID: 4-b
Agent: Super Z (main agent)
Task: ترقية جراحية للوحة IPRN SMS القائمة (بدون إعادة إنشاء أو نشر): ترقية صفحة الأرقام (استيراد جماعي بالتسعير التلقائي + عرض «معرّضة للخطر» ≤3 أيام + أعمدة إحصاءات لكل رقم + تحسين تصفح المجمّع)، وضع LIVE لصفحة الترافيك (تحديث كل 5 ثوانٍ)، بطاقة «Platform link» للأدمن، اختبار «تسريب صفري» للهامش المخفي، وبناء ناجح.

Work Log:
- درس الكود القائم أولاً (schema, ingest/rates/settings/auth, smpp/gateway, صفحات panel وactions وAPI) وحدّد قواعد الحماية: trueCost/marginKept/trueRate لا تظهر أبداً لغير الأدمن.
- Numbers: أضاف importNumbers (CSV أو أسطر JSON — الحقول number,destination,class,capability,model + عمود rate اختياري يتجاوز التسعير) مع تسعير تلقائي من RateGroup (مطابقة تامة أولاً ثم جزئية، أعلى trueRate يفوز)، idempotent (تخطي الموجود)، source=IMPORT — وواجهة ImportNumbersCard (client) بنتيجة فورية added/existed/priced/unpriced.
- Numbers: تبويب «At risk (≤3d)» لكل الأدوار (تصفية lastTrafficAt countdown ≤3 أيام عبر trafficState) مع تنبيه أحمر، ومكوّن CountdownBadge بارز (نبض تحذيري للأحمر، كهرماني للتحذير) في كل قوائم الأرقام + لوحة المستخدم، وأعمدة إحصاءات: Traffic 24h/7d + أرباح 7 أيام (أدمن: user/margin/true — مستخدم/وكيل: المشتق فقط بأدوارهم)، وتصفح مجموع محسّن (بحث رقم/وجهة + فلتر وجهة + فلتر class) وزر «Rent this number» بارز.
- Traffic: نقطة /api/panel/traffic/live (جلسة، نفس فلاتر الصفحة، وسمّ isNew عبر ?since=) + TrafficTable (client) بمفتاح LIVE: تحديث كل 5 ثوانٍ، مؤشر نابض + عدّاد «N new» + إبراز الصفوف الجديدة (bg-emerald) — الفلاتر/التصدير/الحذف كما هي دون تغيير.
- Dashboard (أدمن): بطاقة «Platform link» — حالة بوابة SMPP (gatewayStatus + فحص TCP gatewayListening)، تكوين webhook النسخ الاحتياطي (public_url + mo_webhook_secret)، آخر RawEvent (المصدر + العمر)، عدد الأرقام الممصّدة، وعدد المعرّضة للخطر مع رابط للتبويب. ملخص الهامش بقي أدمن-فقط.
- إصلاح دقة حالة البوابة: نقل حالة gateway.ts إلى globalThis (حزم instrumentation وroutes نسخ وحدات منفصلة) + فحص TCP احتياطي؛ أُعيد اختبار دورة SMPP كاملة (bind→submit→DLR) بنجاح.
- تقوية الضمانة: مفاتيح marginKept/trueValue تُحذف كلياً من حمولة مخططات المستخدم/الوكيل (كانت تمر كقيم صفرية في RSC payload) — كشفها فحص التسريب الجديد.
- zero-leak: scripts/zero-leak-check.ts (bun run check:leak) — فحص ثابت لكل src/app + src/components/panel (كل سطر يحوي رمزاً محظوراً يجب أن يحمل حارس isAdmin أو قائمة مراجعة موثّقة) + 42 مسباراً حياً (صفحات/CSV/API بجلسات USER وAGENT + تحقق إعادة توجيه صفحات الأدمن) — النتيجة: PASS صفر تسريب.
- بذور بيانات تجريبية محلياً (SEED_DEMO) لتعبئة العروض + رسائل اختبار عبر webhook/SMPP الحقيقيين للتحقق من LIVE والاستيراد E2E بالمتصفح.
- لاحظ: خادم dev قُتل بـ OOM أثناء التحقق بالمتصفح (chrome + next-server) — أُعيد تشغيله في الخلفية وهو سليم؛ البناء أُجري أثناء توقفه.

Stage Summary:
- الملفات: countdown-badge.tsx وimport-form.tsx وtraffic-table.tsx وtraffic/types.ts وapi/panel/traffic/live/route.ts وscripts/zero-leak-check.ts (جديدة)؛ numbers/page.tsx + actions.ts، traffic/page.tsx، dashboard/page.tsx، charts.tsx، smpp/gateway.ts، package.json (معدّلة)؛ worklog.md (إلحاق فقط).
- النتائج: bun run build ✓ (16/16 صفحة)، bun run lint ✓، tsc --noEmit: صفر أخطاء في src/، smpp-test.ts ✓ (دورة كاملة)، zero-leak: PASS (ثابت 0 تسريب + 42/42 مسباراً نظيفاً)، التصدير: أدمن يشمل true_value/margin_kept والمستخدم user_earning فقط.
- انحرافات موثّقة: إصلاح حالة البوابة (globalThis + TCP probe)، حذف مفاتيح الهامش من حمولات غير الأدمن (تقوية)، tests/*.sh خاصة ببنية sandbox (‎.zscripts غير موجودة) فلم تُشغَّل، وبعض رسائل الاختبار بقيت في سجل الترافيك المحلي كأثر للتحقق.

---
Task ID: 5
Agent: Super Z (sub agent)
Task: نشر الترقية (Task 4-b) على Coolify — مراجعة أمنية قبل الالتزام، دفع إلى GitHub، تشغيل النشر، والتحقق الإنتاجي.

Work Log:
- مراجعة أمنية: كشف الفحص أن مدخل Task 2 في worklog.md يحمل كلمة مرور الأدمن الحية داخل التزام محلي غير مدفوع (b639bec) — أُسقط الالتزام (reset إلى قمة البعيد 4204864) وحُجبت الكلمة (تشير الآن إلى ADMIN_PASSWORD في Coolify فقط) قبل أي دفع، فلم تصل للمستودع العام أبداً.
- كشف تسريب قائم: explore/inbound_connectors.txt كان يحمل مفتاح المنصة الحقيقي vendor_cd322… (معلن منذ Task 1) وexplore/session.json يحمل JWT منتهك — أُزيل المفتاح من كامل التاريخ عبر git filter-branch + force-push (نسخة احتياطية /tmp/iprn-backup.bundle)، وأُخرجت session.json وtool-results/* وtsconfig.tsbuildinfo من التتبع والتاريخ، وأُضيف tool-results/ وtsconfig.tsbuildinfo إلى .gitignore. التحقق بعد الدفع: raw.githubusercontent يعيد 404 للملفات المحذوفة وصفر أسرار في كل الالتزامات.
- التزام الترقية: 41f0050 (قبل إعادة الكتابة) → 8fc3ac1 نهائياً "Panel UX upgrades: bulk import, at-risk view, live traffic, platform link card, zero-leak hardening" (19 ملفاً: 6 جديدة + 9 معدلة + 3 حذف تتبع) ودفع إلى main.
- Coolify v4.4.6: نقاط REST لتسجيل الدخول (‎/api/auth/login وجميع variants عائلتها) ترد 404 — لا يوجد تسجيل دخول بالإيميل عبر API في هذه النسخة؛ الاعتماد البديل على agent-browser: دخول الواجهة → مشروع IPRN SMS Panel → تطبيق iprn-panel → زر Deploy → نشر zvpfffbvqts58gygjzldpl0l (بنى commit 8fc3ac19 من main مباشرة).
- تحقق إنتاجي: النشر Success/Finished؛ ‎/api/panel/traffic/live يعيد 401 JSON دون جلسة (كان 404 قبله) و‎{ok:true, rows:[]} بجلسة أدمن؛ صفحة Numbers تعرض تبويب "At risk (≤3d)" وبطاقة الاستيراد الجماعي (Import list / Import & auto-price)؛ مفتاح LIVE في صفحة الترافيك؛ بطاقة "Platform link" في لوحة الأدمن (البوابة تستمع :2775)؛ قاعدة البيانات دائمة: 99 مجموعة أسعار + مستخدمان (admin@iprn.local, test@gmail.com)؛ تسجيل خروج ثم دخول نظيف بكلمة ADMIN_PASSWORD ناجح.
- توصية أمنية: تدوير مفتاح المنصة (Inbound Connectors في sms.carefulsupport.com) لأنه كان معلناً في المستودع العام — إزالة التاريخ تمنع الوصول العادي لكن النسخ المستنسخة سابقاً/كاش GitHub قد تبقى حتى GC.

Stage Summary:
- النتيجة: https://wmjkooqf85srmiokr7g1aljm.130.61.171.201.sslip.io يعمل على 8fc3ac1 بكل ميزات الترقية والتحقق البعيد إنتاجياً ناجحاً.
- المنهجية: REST API غير متاح للمصادقة في v4.4.6 → UI عبر agent-browser (الجلسة دائمة)؛ نشر بالزر Deploy في صفحة التطبيق.
- أثر جانبي مقصود: تنظيف أمني شامل للتاريخ (مفتاح vendor_ + JWT منتهي + أدوات/مصنوعات بناء) مع نسخة احتياطية محلية كاملة قبل إعادة الكتابة.
