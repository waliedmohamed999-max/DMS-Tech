/**
 * Starting text for a contract written directly (no quotation). Only a draft the user edits before review —
 * not legal advice; the PDF says it is signed outside the system.
 */
export const CONTRACT_TEMPLATE = {
  ar: {
    payment: "• 50% دفعة مقدّمة عند توقيع العقد.\n• 50% عند التسليم النهائي.\n• تُستحق كل فاتورة خلال 7 أيام من تاريخ إصدارها.\n• الأسعار لا تشمل ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك.",
    terms: [
      "1. الالتزامات: يلتزم مقدّم الخدمة بتنفيذ نطاق العمل الموضّح في هذا العقد بالجودة المتفق عليها، ويلتزم العميل بتوفير المحتوى والمعلومات والصلاحيات اللازمة في الوقت المناسب.",
      "2. المدة والتسليم: تبدأ المدة من تاريخ البدء المذكور، ويُمدَّد موعد التسليم بقدر أي تأخير في توفير متطلبات العميل.",
      "3. التعديلات: أي عمل خارج نطاق العمل يُسعَّر ويُعتمد كتابيًا قبل البدء فيه.",
      "4. الملكية الفكرية: تنتقل ملكية المخرجات النهائية للعميل بعد سداد كامل قيمة العقد، ويحق لمقدّم الخدمة عرضها ضمن أعماله ما لم يُتفق كتابيًا على خلاف ذلك.",
      "5. السرية: يلتزم الطرفان بالحفاظ على سرية المعلومات المتبادلة خلال مدة العقد وبعد انتهائه.",
      "6. الإنهاء: يحق لأي طرف إنهاء العقد بإشعار كتابي مدته 30 يومًا، مع سداد قيمة الأعمال المنجزة حتى تاريخ الإنهاء.",
      "7. القانون الواجب التطبيق: يخضع هذا العقد لأنظمة المملكة العربية السعودية، وتُحل النزاعات وديًا أولًا ثم أمام الجهة القضائية المختصة."
    ].join("\n"),
    scope: "• \n• \n• "
  },
  en: {
    payment: "• 50% advance payment on signature.\n• 50% on final delivery.\n• Each invoice is due within 7 days of issue.\n• Prices exclude VAT unless stated otherwise.",
    terms: [
      "1. Obligations: the provider delivers the scope of work at the agreed quality; the client provides content, information and access in good time.",
      "2. Term and delivery: the term starts on the start date; delivery moves by any delay in the client's inputs.",
      "3. Changes: work outside the scope is priced and approved in writing before it starts.",
      "4. Intellectual property: final deliverables pass to the client once the contract value is paid in full; the provider may show them in its portfolio unless agreed otherwise in writing.",
      "5. Confidentiality: both parties keep shared information confidential during and after the contract.",
      "6. Termination: either party may terminate with 30 days' written notice; work completed up to that date is paid.",
      "7. Governing law: the laws of the Kingdom of Saudi Arabia; disputes are settled amicably first, then before the competent court."
    ].join("\n"),
    scope: "• \n• \n• "
  }
} as const;
