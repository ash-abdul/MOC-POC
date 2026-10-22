// Reference data: starting rule values (section 5), lists (AD-03), templates (AD-05), calendar (AD-04),
// cluster / schools / areas (section 7). All of it is editable on screen after seeding.

export const SETTINGS = {
  grade_age_rules: { cutoff: '12-31', ages: { KG1: 4, KG2: 5, G1: 6 } },                // BR-01
  transfer_grade_rule: 'next_after_last_completed',                                       // BR-02
  eligible_schools_rule: 'catchment_and_grade',                                           // BR-03
  max_preferences: 3,                                                                     // BR-04
  priority_order: ['sod', 'sibling', 'national', 'distance', 'submitted'],                // BR-05
  decision_sla_working_days: 2,                                                           // BR-06
  info_response_working_days: 5,                                                          // BR-07
  offer_acceptance_working_days: 5,                                                       // BR-08
  bus_seat_hold: { hold_from: 'submission', confirm_on: 'acceptance', release_on: ['decline', 'lapse', 'withdrawal', 'rejection'] }, // BR-09
  utility_bill_max_age_months: 3,                                                         // BR-10
  max_active_applications_per_child: 1,                                                   // BR-11
  capacity_warning_threshold: 90,                                                         // BR-12
  exceptional_transfer_approver: 'cluster_officer',                                       // BR-14
  limited_seat_pct: 10,
  out_of_catchment_suggestions: 3,
  working_weekdays: [1, 2, 3, 4, 5],
  max_file_mb: 5,
  allowed_file_types: ['pdf', 'jpg', 'jpeg', 'png'],
  default_emirate: 'SHJ',
  demo_clock_offset_days: 0,
  // Section 6 – R required, C if applicable, E renewal: only if expired, M renewal: only if moved, - not required
  doc_matrix: {
    guardian_eid:         { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'E', renewal_moved: 'E' },
    guardian_passport:    { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'E', renewal_moved: 'E' },
    child_eid:            { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'E', renewal_moved: 'E' },
    child_passport:       { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'E', renewal_moved: 'E' },
    birth_certificate:    { new: 'R', private: 'R', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    child_photo:          { new: 'R', private: 'R', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    vaccination:          { new: 'R', private: 'C', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    school_reports:       { new: '-', private: 'R', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    transfer_certificate: { new: '-', private: 'R', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    equivalency:          { new: '-', private: '-', other_emirate: '-', abroad: 'R', renewal: '-', renewal_moved: '-' },
    sod_reports:          { new: 'C', private: 'C', other_emirate: 'C', abroad: 'C', renewal: 'C', renewal_moved: 'C' },
    custody_order:        { new: 'C', private: 'C', other_emirate: 'C', abroad: 'C', renewal: 'C', renewal_moved: 'C' },
    tenancy:              { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'M', renewal_moved: 'R' },
    utility_bill:         { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: 'M', renewal_moved: 'R' },
  },
  doc_conditions: { guardian_passport: 'non_uae_guardian', child_passport: 'non_uae_child', sod_reports: 'sod', custody_order: 'sole_custody' },
};

const L = (code, en, ar, parent) => ({ code, en, ar, parent });
export const LISTS = {
  doc_type: [
    L('guardian_eid', 'Guardian Emirates ID (both guardians)', 'الهوية الإماراتية لولي الأمر (كلا الوالدين)'),
    L('guardian_passport', 'Guardian passport', 'جواز سفر ولي الأمر'),
    L('child_eid', 'Child Emirates ID', 'الهوية الإماراتية للطفل'),
    L('child_passport', 'Child passport', 'جواز سفر الطفل'),
    L('birth_certificate', 'Birth certificate', 'شهادة الميلاد'),
    L('child_photo', 'Child photo', 'صورة شخصية للطفل'),
    L('vaccination', 'Vaccination record', 'سجل التطعيمات'),
    L('school_reports', "Last 2 years' school reports", 'التقارير المدرسية لآخر سنتين'),
    L('transfer_certificate', 'Transfer certificate', 'شهادة النقل'),
    L('equivalency', 'Equivalency certificate', 'شهادة المعادلة'),
    L('sod_reports', 'Student of determination reports', 'تقارير الطالب من أصحاب الهمم'),
    L('custody_order', 'Custody or guardianship order', 'أمر الحضانة أو الولاية'),
    L('tenancy', 'Tenancy contract or title deed', 'عقد الإيجار أو سند الملكية'),
    L('utility_bill', 'Utility bill (last 3 months)', 'فاتورة خدمات (آخر 3 أشهر)'),
    L('host_documents', 'Host residence documents (relatives / employer housing)', 'مستندات سكن المضيف (أقارب / سكن جهة العمل)'),
    L('exceptional_support', 'Supporting document for exceptional transfer', 'مستند داعم لطلب النقل الاستثنائي'),
  ],
  reject_reason: [
    L('illegible', 'Document illegible', 'المستند غير واضح'),
    L('expired', 'Document expired', 'المستند منتهي الصلاحية'),
    L('name_mismatch', 'Name does not match guardian / child', 'الاسم لا يطابق ولي الأمر / الطفل'),
    L('wrong_document', 'Wrong document type', 'نوع مستند غير صحيح'),
    L('bill_too_old', 'Utility bill older than 3 months', 'فاتورة الخدمات أقدم من 3 أشهر'),
    L('not_eligible_age', 'Child not eligible for the grade', 'الطفل غير مؤهل للصف'),
    L('outside_catchment', 'Residence outside catchment', 'السكن خارج النطاق الجغرافي'),
    L('duplicate', 'Duplicate application', 'طلب مكرر'),
    L('false_information', 'Incorrect information provided', 'معلومات غير صحيحة'),
  ],
  info_reason: [
    L('missing_document', 'Missing document', 'مستند ناقص'),
    L('unclear_document', 'Document unclear – please re-upload', 'المستند غير واضح – يرجى إعادة الرفع'),
    L('address_verification', 'Address verification needed', 'مطلوب التحقق من العنوان'),
    L('custody_clarification', 'Custody / guardianship clarification', 'توضيح الحضانة / الولاية'),
    L('other', 'Other', 'أخرى'),
  ],
  exceptional_reason: [
    L('family_relocation', 'Family relocated within the emirate', 'انتقال الأسرة داخل الإمارة'),
    L('medical', 'Medical reasons', 'أسباب طبية'),
    L('safety', 'Child safety / wellbeing', 'سلامة الطفل / رفاهيته'),
    L('custody_change', 'Change of custody', 'تغيير الحضانة'),
    L('other', 'Other', 'أخرى'),
  ],
  leave_reason: [
    L('private_school', 'Moved to a private school', 'الانتقال إلى مدرسة خاصة'),
    L('other_emirate', 'Moved to another emirate', 'الانتقال إلى إمارة أخرى'),
    L('outside_uae', 'Moved outside the UAE', 'الانتقال إلى خارج الدولة'),
    L('home_schooling', 'Home schooling', 'التعليم المنزلي'),
    L('other', 'Other', 'أخرى'),
  ],
  leave_subreason: [
    L('fees', 'Fees', 'الرسوم', 'private_school'),
    L('quality', 'Quality or curriculum', 'الجودة أو المنهج', 'private_school'),
    L('distance', 'Distance or location', 'المسافة أو الموقع', 'private_school'),
    L('facilities', 'School facilities', 'مرافق المدرسة', 'private_school'),
    L('ps_other', 'Other', 'أخرى', 'private_school'),
    L('oe_relocation', 'Family relocation', 'انتقال الأسرة', 'other_emirate'),
    L('oe_work', 'Work', 'العمل', 'other_emirate'),
    L('oe_other', 'Other', 'أخرى', 'other_emirate'),
    L('ou_relocation', 'Family relocation', 'انتقال الأسرة', 'outside_uae'),
    L('ou_residence_end', 'End of residence', 'انتهاء الإقامة', 'outside_uae'),
    L('ou_other', 'Other', 'أخرى', 'outside_uae'),
    L('hs_health', 'Health', 'الصحة', 'home_schooling'),
    L('hs_choice', 'Family choice', 'اختيار الأسرة', 'home_schooling'),
    L('hs_other', 'Other', 'أخرى', 'home_schooling'),
  ],
  nationality: [
    L('AE', 'United Arab Emirates', 'الإمارات العربية المتحدة'), L('EG', 'Egypt', 'مصر'), L('JO', 'Jordan', 'الأردن'),
    L('SY', 'Syria', 'سوريا'), L('SD', 'Sudan', 'السودان'), L('YE', 'Yemen', 'اليمن'), L('OM', 'Oman', 'عُمان'),
    L('IN', 'India', 'الهند'), L('PK', 'Pakistan', 'باكستان'), L('LB', 'Lebanon', 'لبنان'), L('PS', 'Palestine', 'فلسطين'),
  ],
};

const T = (key, subject_en, subject_ar, body_en, body_ar) => ({ key, subject_en, subject_ar, body_en, body_ar });
export const TEMPLATES = [
  T('application_submitted', 'Application {{ref}} submitted', 'تم تقديم الطلب {{ref}}',
    'Your application has been submitted. You will receive a confirmation within 2 working days. Reference: {{ref}} – {{child}}.',
    'تم تقديم طلبك. ستصلك رسالة تأكيد خلال يومي عمل. الرقم المرجعي: {{ref}} – {{child}}.'),
  T('new_in_queue', 'New application {{ref}} in your queue', 'طلب جديد {{ref}} في قائمتك',
    'Application {{ref}} for {{child}} is waiting for review at {{school}}. First decision is due within 2 working days.',
    'الطلب {{ref}} للطالب {{child}} بانتظار المراجعة في {{school}}. يجب اتخاذ القرار الأول خلال يومي عمل.'),
  T('sla_due_today', 'Application {{ref}} is due today', 'الطلب {{ref}} مستحق اليوم',
    'The first decision on application {{ref}} is due today.', 'يجب اتخاذ القرار الأول بشأن الطلب {{ref}} اليوم.'),
  T('sla_overdue', 'OVERDUE: application {{ref}}', 'متأخر: الطلب {{ref}}',
    'Application {{ref}} at {{school}} has passed the 2-working-day decision deadline.', 'تجاوز الطلب {{ref}} في {{school}} مهلة القرار البالغة يومي عمل.'),
  T('info_requested', 'Action required: information requested for {{ref}}', 'إجراء مطلوب: طلب معلومات للطلب {{ref}}',
    'The school needs more information for {{child}} ({{ref}}): {{reason}}. {{note}} Please respond by {{due}}. The decision clock is paused until you respond.',
    'تحتاج المدرسة إلى معلومات إضافية للطالب {{child}} ({{ref}}): {{reason}}. {{note}} يرجى الرد قبل {{due}}. يتوقف احتساب مهلة القرار حتى ردك.'),
  T('info_reminder', 'Reminder: respond to {{ref}} by {{due}}', 'تذكير: الرد على الطلب {{ref}} قبل {{due}}',
    'Your response to the information request on {{ref}} is due on {{due}}. If there is no response the application will close.',
    'موعد الرد على طلب المعلومات للطلب {{ref}} هو {{due}}. سيتم إغلاق الطلب في حال عدم الرد.'),
  T('info_provided', 'Parent responded on {{ref}}', 'رد ولي الأمر على الطلب {{ref}}',
    'The parent has provided the requested information for {{ref}}. The decision clock has resumed.', 'قدم ولي الأمر المعلومات المطلوبة للطلب {{ref}}. استؤنف احتساب مهلة القرار.'),
  T('offer_made', 'Offer of a place – {{ref}}', 'عرض مقعد دراسي – {{ref}}',
    '{{child}} has been offered a place at {{school}}, {{grade}} section {{section}}. Please accept or decline by {{due}}.',
    'تم عرض مقعد على {{child}} في {{school}}، {{grade}} الشعبة {{section}}. يرجى القبول أو الرفض قبل {{due}}.'),
  T('offer_accepted', 'Place confirmed – {{ref}}', 'تم تأكيد المقعد – {{ref}}',
    'You accepted the place for {{child}} at {{school}}, {{grade}} section {{section}}. Your offer letter is available in the portal.',
    'قبلت المقعد للطالب {{child}} في {{school}}، {{grade}} الشعبة {{section}}. خطاب العرض متاح في البوابة.'),
  T('offer_accepted_school', 'Offer accepted – {{ref}}', 'تم قبول العرض – {{ref}}',
    'The parent accepted the place for {{child}} ({{grade}}-{{section}}).', 'قبل ولي الأمر المقعد للطالب {{child}} ({{grade}}-{{section}}).'),
  T('offer_declined_school', 'Offer declined – {{ref}}', 'تم رفض العرض – {{ref}}',
    'The parent declined the offer on {{ref}}. The seat has been released.', 'رفض ولي الأمر العرض للطلب {{ref}}. تم تحرير المقعد.'),
  T('offer_lapsed', 'Offer lapsed – {{ref}}', 'انتهت صلاحية العرض – {{ref}}',
    'The offer on {{ref}} was not accepted within 5 working days and has lapsed. The seat has been released.',
    'لم يتم قبول العرض للطلب {{ref}} خلال 5 أيام عمل وانتهت صلاحيته. تم تحرير المقعد.'),
  T('application_closed', 'Application {{ref}} closed', 'تم إغلاق الطلب {{ref}}',
    'Application {{ref}} was closed because the requested information was not received in time.', 'تم إغلاق الطلب {{ref}} لعدم استلام المعلومات المطلوبة في الوقت المحدد.'),
  T('application_rejected', 'Application {{ref}} – decision', 'الطلب {{ref}} – القرار',
    'We are sorry, application {{ref}} could not be accepted. Reason: {{reason}}.', 'نأسف، لم يتم قبول الطلب {{ref}}. السبب: {{reason}}.'),
  T('bus_confirmed', 'Bus seat confirmed – {{ref}}', 'تم تأكيد مقعد الحافلة – {{ref}}',
    'A school bus seat has been confirmed for {{child}}.', 'تم تأكيد مقعد في الحافلة المدرسية للطالب {{child}}.'),
  T('bus_waitlisted', 'Bus seat waitlisted – {{ref}}', 'مقعد الحافلة على قائمة الانتظار – {{ref}}',
    'The bus route for {{child}} is full. The request has been placed on the waiting list.', 'مسار الحافلة للطالب {{child}} ممتلئ. تم وضع الطلب على قائمة الانتظار.'),
  T('passed_next', 'Application {{ref}} moved to your next preference', 'تم تحويل الطلب {{ref}} إلى خيارك التالي',
    'There is no seat at {{from}}. Your application has been passed to {{to}}.', 'لا يوجد مقعد في {{from}}. تم تحويل طلبك إلى {{to}}.'),
  T('escalated_to_cluster', 'Escalation – {{ref}}', 'تصعيد – {{ref}}',
    'Application {{ref}} for {{child}} needs cluster action ({{reason}}).', 'الطلب {{ref}} للطالب {{child}} يحتاج إلى إجراء من المجمع ({{reason}}).'),
  T('parent_escalated', 'Application {{ref}} is with the cluster office', 'الطلب {{ref}} لدى مكتب المجمع',
    'Your application for {{child}} has been referred to the cluster office, which will find a suitable school.', 'تمت إحالة طلبك للطالب {{child}} إلى مكتب المجمع لإيجاد مدرسة مناسبة.'),
  T('cluster_approved', 'Cluster approval – {{ref}}', 'موافقة المجمع – {{ref}}',
    'The cluster office approved your request for {{child}}. It has been sent to the school.', 'وافق مكتب المجمع على طلبك للطالب {{child}} وتم إرساله إلى المدرسة.'),
  T('capacity_warning', 'Capacity warning: {{school}} {{grade}} at {{pct}}%', 'تنبيه السعة: {{school}} {{grade}} بنسبة {{pct}}%',
    '{{school}} grade {{grade}} ({{ay}}) has reached the {{level}}% warning threshold.', 'وصل {{school}} الصف {{grade}} ({{ay}}) إلى حد التنبيه {{level}}%.'),
  T('capacity_full', 'Capacity FULL: {{school}} {{grade}}', 'السعة مكتملة: {{school}} {{grade}}',
    '{{school}} grade {{grade}} ({{ay}}) is at 100% capacity and is closed to new applications.', 'وصل {{school}} الصف {{grade}} ({{ay}}) إلى 100% من السعة وأُغلق أمام الطلبات الجديدة.'),
  T('renewal_window_open', 'Renewal window is open', 'فترة تجديد التسجيل مفتوحة',
    'Please confirm the place of {{child}} for next academic year in the portal.', 'يرجى تأكيد مقعد {{child}} للعام الدراسي القادم عبر البوابة.'),
  T('renewal_confirmed', 'Renewal confirmed – {{ref}}', 'تم تأكيد التجديد – {{ref}}',
    'The place of {{child}} at {{school}} ({{grade}}) is confirmed for next year.', 'تم تأكيد مقعد {{child}} في {{school}} ({{grade}}) للعام القادم.'),
  T('leave_requested', 'Leaving request – {{child}}', 'طلب انسحاب – {{child}}',
    'A parent has notified that {{child}} will leave on {{date}}. Please confirm.', 'أبلغ ولي الأمر أن {{child}} سيغادر بتاريخ {{date}}. يرجى التأكيد.'),
  T('leave_request_received', 'Leaving request received', 'تم استلام طلب الانسحاب',
    'We received your notice that {{child}} will leave on {{date}}. The school will confirm.', 'استلمنا إشعارك بأن {{child}} سيغادر بتاريخ {{date}}. ستقوم المدرسة بالتأكيد.'),
  T('leave_confirmed', 'Leaving confirmed', 'تم تأكيد الانسحاب',
    'The school confirmed that {{child}} leaves on {{date}}.', 'أكدت المدرسة أن {{child}} يغادر بتاريخ {{date}}.'),
  T('guardian_invite', 'You have been added as a guardian', 'تمت إضافتك كولي أمر',
    '{{inviter}} added you as a guardian. Sign in with UAE PASS to confirm.', 'قام {{inviter}} بإضافتك كولي أمر. سجّل الدخول عبر الهوية الرقمية لتأكيد ذلك.'),
  T('guardian_linked', 'Second guardian linked', 'تم ربط ولي الأمر الثاني',
    '{{guardian}} confirmed the link to your family account through UAE PASS.', 'أكد {{guardian}} الارتباط بحساب الأسرة عبر الهوية الرقمية.'),
];

// UAE public holidays (lunar dates are approximate) – AD-04
export const HOLIDAYS = [
  ['2025-12-01', 'Commemoration Day', 'يوم الشهيد'], ['2025-12-02', 'National Day', 'اليوم الوطني'], ['2025-12-03', 'National Day', 'اليوم الوطني'],
  ['2026-01-01', "New Year's Day", 'رأس السنة الميلادية'],
  ['2026-03-19', 'Eid Al Fitr', 'عيد الفطر'], ['2026-03-20', 'Eid Al Fitr', 'عيد الفطر'], ['2026-03-21', 'Eid Al Fitr', 'عيد الفطر'],
  ['2026-05-26', 'Arafat Day', 'يوم عرفة'], ['2026-05-27', 'Eid Al Adha', 'عيد الأضحى'], ['2026-05-28', 'Eid Al Adha', 'عيد الأضحى'], ['2026-05-29', 'Eid Al Adha', 'عيد الأضحى'],
  ['2026-06-16', 'Islamic New Year', 'رأس السنة الهجرية'], ['2026-08-25', "Prophet's Birthday", 'المولد النبوي'],
  ['2026-12-01', 'Commemoration Day', 'يوم الشهيد'], ['2026-12-02', 'National Day', 'اليوم الوطني'], ['2026-12-03', 'National Day', 'اليوم الوطني'],
  ['2027-01-01', "New Year's Day", 'رأس السنة الميلادية'],
  ['2027-03-09', 'Eid Al Fitr', 'عيد الفطر'], ['2027-03-10', 'Eid Al Fitr', 'عيد الفطر'], ['2027-03-11', 'Eid Al Fitr', 'عيد الفطر'],
  ['2027-05-15', 'Arafat Day', 'يوم عرفة'], ['2027-05-16', 'Eid Al Adha', 'عيد الأضحى'], ['2027-05-17', 'Eid Al Adha', 'عيد الأضحى'], ['2027-05-18', 'Eid Al Adha', 'عيد الأضحى'],
];

export const ACADEMIC_YEARS = [
  { code: '2025-26', start_date: '2025-08-25', end_date: '2026-07-03', is_current: 0, is_admission: 0 },
  { code: '2026-27', start_date: '2026-08-24', end_date: '2027-07-02', is_current: 1, is_admission: 0 },
  { code: '2027-28', start_date: '2027-08-23', end_date: '2028-06-30', is_current: 0, is_admission: 1 },
];
export const WINDOWS = [
  ['2026-27', 'new', '2025-09-15', '2026-03-31'], ['2026-27', 'renewal', '2025-10-01', '2025-12-31'], ['2026-27', 'transfer', '2026-03-01', '2026-05-31'],
  ['2027-28', 'new', '2026-09-15', '2027-03-31'], ['2027-28', 'renewal', '2026-10-01', '2026-12-31'], ['2027-28', 'transfer', '2027-03-01', '2027-05-31'],
];

// Sharjah pilot cluster: a 4 x 3 grid of synthetic areas plus one outlying area (Al Suyoh)
const LAT0 = 25.36, LNG0 = 55.38, STEP = 0.03;
export const cell = (r, c) => ({ s: LAT0 - (r + 1) * STEP, n: LAT0 - r * STEP, w: LNG0 + c * STEP, e: LNG0 + (c + 1) * STEP });
export const rect = ({ s, n, w, e }) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
export const block = (r0, r1, c0, c1) => rect({ n: cell(r0, c0).n, s: cell(r1, c0).s, w: cell(r0, c0).w, e: cell(r0, c1).e });
export const SUYOH = { s: 25.215, n: 25.255, w: 55.52, e: 55.57 };

export const AREAS = [
  [0, 0, 'Al Majaz', 'المجاز'], [0, 1, 'Al Qasimia', 'القاسمية'], [0, 2, 'Al Nasserya', 'الناصرية'], [0, 3, 'Al Ramtha', 'الرمثاء'],
  [1, 0, 'Al Taawun', 'التعاون'], [1, 1, 'Al Nahda', 'النهدة'], [1, 2, 'Muwailih Commercial', 'مويلح التجارية'], [1, 3, 'Al Rahmaniya', 'الرحمانية'],
  [2, 0, 'Al Qadisiya', 'القادسية'], [2, 1, 'Al Yarmook', 'اليرموك'], [2, 2, 'Muwaileh', 'مويلح'], [2, 3, 'Al Jurainah', 'الجرينة'],
];

const K = ['KG1', 'KG2'], C1 = ['G1', 'G2', 'G3', 'G4'], C2 = ['G5', 'G6', 'G7', 'G8'], C3 = ['G9', 'G10', 'G11', 'G12'];
// [code, en, ar, row, col, grades, sections per grade, max per section, catchment block [r0,r1,c0,c1] | 'suyoh']
export const SCHOOLS = [
  ['SHJ-S01', 'Al Majaz Kindergarten', 'روضة المجاز', 0, 0, K, 4, 25, [0, 1, 0, 1]],
  ['SHJ-S02', 'Al Nahda Kindergarten', 'روضة النهدة', 1, 1, K, 4, 25, [1, 2, 1, 2]],
  ['SHJ-S03', 'Al Qasimia Primary School', 'مدرسة القاسمية للتعليم الأساسي', 0, 1, [...K, ...C1], 4, 25, [0, 0, 0, 2]],
  ['SHJ-S04', 'Al Taawun Primary School', 'مدرسة التعاون للتعليم الأساسي', 1, 0, [...K, ...C1], 4, 25, [1, 2, 0, 1]],
  ['SHJ-S05', 'Muwaileh Primary School', 'مدرسة مويلح للتعليم الأساسي', 2, 2, [...K, ...C1], 4, 25, [2, 2, 1, 3]],
  ['SHJ-S06', 'Al Rahmaniya Primary School', 'مدرسة الرحمانية للتعليم الأساسي', 1, 3, [...K, ...C1], 4, 25, [0, 1, 2, 3]],
  ['SHJ-S07', 'Al Nahda Cycle 2 School', 'مدرسة النهدة للحلقة الثانية', 1, 1, C2, 4, 28, [0, 2, 0, 1]],
  ['SHJ-S08', 'Al Ramtha Cycle 2 School', 'مدرسة الرمثاء للحلقة الثانية', 0, 3, C2, 4, 28, [0, 2, 2, 3]],
  ['SHJ-S09', 'Al Yarmook Cycle 2 & 3 School', 'مدرسة اليرموك للحلقتين الثانية والثالثة', 2, 1, [...C2, ...C3], 3, 30, [2, 2, 0, 3]],
  ['SHJ-S10', 'Al Qasimia Secondary School', 'مدرسة القاسمية الثانوية', 0, 1, C3, 3, 30, [0, 1, 0, 1]],
  ['SHJ-S11', 'Muwaileh Secondary School', 'مدرسة مويلح الثانوية', 2, 2, C3, 3, 30, [0, 2, 2, 3]],
  ['SHJ-S12', 'Al Suyoh Model School', 'مدرسة السيوح النموذجية', -1, -1, [...K, ...C1, ...C2, ...C3], 2, 25, 'suyoh'],
];

// 6 bus routes – [code, en, ar, capacity, school codes, stop cells]
export const ROUTES = [
  ['R1', 'Al Majaz – Al Nahda', 'المجاز – النهدة', 50, ['SHJ-S01', 'SHJ-S03', 'SHJ-S07', 'SHJ-S10'], [[0, 0], [0, 1], [1, 1], [1, 0]]],
  ['R2', 'Al Taawun – Al Qadisiya', 'التعاون – القادسية', 50, ['SHJ-S02', 'SHJ-S04', 'SHJ-S07'], [[1, 0], [2, 0], [1, 1], [2, 1]]],
  ['R3', 'Muwaileh – Al Yarmook', 'مويلح – اليرموك', 45, ['SHJ-S05', 'SHJ-S09', 'SHJ-S11'], [[2, 1], [2, 2], [2, 3], [1, 2]]],
  ['R4', 'Al Rahmaniya – Al Ramtha', 'الرحمانية – الرمثاء', 40, ['SHJ-S06', 'SHJ-S08', 'SHJ-S11'], [[0, 3], [1, 3], [0, 2], [1, 2]]],
  ['R5', 'Al Suyoh Loop', 'دائرة السيوح', 35, ['SHJ-S12'], ['suyoh']],
  ['R6', 'Al Qasimia – Al Nasserya', 'القاسمية – الناصرية', 45, ['SHJ-S03', 'SHJ-S08', 'SHJ-S10'], [[0, 1], [0, 2], [1, 2]]],
];

export const NAMES = {
  male: [['Mohammed', 'محمد'], ['Ahmed', 'أحمد'], ['Omar', 'عمر'], ['Khalid', 'خالد'], ['Saeed', 'سعيد'], ['Hamad', 'حمد'], ['Rashid', 'راشد'], ['Sultan', 'سلطان'], ['Abdullah', 'عبدالله'], ['Yousef', 'يوسف'], ['Ali', 'علي'], ['Hamdan', 'حمدان'], ['Salem', 'سالم'], ['Majid', 'ماجد'], ['Faisal', 'فيصل'], ['Zayed', 'زايد'], ['Mansour', 'منصور'], ['Ibrahim', 'إبراهيم'], ['Hassan', 'حسن'], ['Tariq', 'طارق'], ['Nasser', 'ناصر'], ['Adel', 'عادل'], ['Karim', 'كريم'], ['Rayan', 'ريان']],
  female: [['Fatima', 'فاطمة'], ['Mariam', 'مريم'], ['Aisha', 'عائشة'], ['Noura', 'نورة'], ['Sara', 'سارة'], ['Hessa', 'حصة'], ['Latifa', 'لطيفة'], ['Shamma', 'شما'], ['Mahra', 'مهرة'], ['Layla', 'ليلى'], ['Reem', 'ريم'], ['Alyazia', 'اليازية'], ['Maitha', 'ميثاء'], ['Huda', 'هدى'], ['Amna', 'آمنة'], ['Salama', 'سلامة'], ['Hind', 'هند'], ['Yasmin', 'ياسمين'], ['Dana', 'دانة'], ['Lina', 'لينا'], ['Rana', 'رنا'], ['Jana', 'جنى']],
  family: [['Al Mansoori', 'المنصوري'], ['Al Hashimi', 'الهاشمي'], ['Al Suwaidi', 'السويدي'], ['Al Ketbi', 'الكتبي'], ['Al Zaabi', 'الزعابي'], ['Al Nuaimi', 'النعيمي'], ['Al Shamsi', 'الشامسي'], ['Al Marzouqi', 'المرزوقي'], ['Al Ali', 'العلي'], ['Al Qasimi', 'القاسمي'], ['Al Mazrouei', 'المزروعي'], ['Al Dhaheri', 'الظاهري'], ['Al Blooshi', 'البلوشي'], ['Al Hammadi', 'الحمادي'], ['Al Kaabi', 'الكعبي'], ['Al Falasi', 'الفلاسي'], ['Al Tunaiji', 'الطنيجي'], ['Al Naqbi', 'النقبي'], ['Haddad', 'حداد'], ['Khoury', 'خوري'], ['Saleh', 'صالح'], ['Mahmoud', 'محمود'], ['Ibrahim', 'إبراهيم'], ['Rahman', 'رحمن'], ['Hussein', 'حسين'], ['Nasser', 'ناصر']],
};
