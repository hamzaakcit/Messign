export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  documentType: string;
  content: any;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "meeting-note",
    name: "Toplantı Notu",
    description: "Standart toplantı notu formatı",
    icon: "FileText",
    documentType: "MEETING_NOTE",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Toplantı Notu" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tarih & Katılımcılar" }] },
        { type: "paragraph", content: [{ type: "text", text: "Tarih: " }] },
        { type: "paragraph", content: [{ type: "text", text: "Katılımcılar: " }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Gündem" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Gündem maddesi 1" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Gündem maddesi 2" }] }] },
        ]},
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Kararlar" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Aksiyon Maddeleri" }] },
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Aksiyon 1 - Sorumlu: " }] }] },
        ]},
      ],
    },
  },
  {
    id: "technical-spec",
    name: "Teknik Spesifikasyon",
    description: "RFC ve teknik tasarım dokümanı",
    icon: "Code",
    documentType: "SPECIFICATION",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Teknik Spesifikasyon" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Özet" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bu doküman ..." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Motivasyon" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tasarım" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Alternatifler" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Uygulama Planı" }] },
        { type: "paragraph" },
      ],
    },
  },
  {
    id: "sop",
    name: "Standart İşlem Prosedürü",
    description: "Adım adım iş prosedürü",
    icon: "ClipboardList",
    documentType: "SOP",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "SOP: [Prosedür Adı]" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Amaç" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Kapsam" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sorumluluklar" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Prosedür Adımları" }] },
        { type: "orderedList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Adım 1: " }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Adım 2: " }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Adım 3: " }] }] },
        ]},
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Referanslar" }] },
        { type: "paragraph" },
      ],
    },
  },
  {
    id: "guide",
    name: "Rehber",
    description: "Genel amaçlı rehber dokümanı",
    icon: "BookOpen",
    documentType: "GUIDE",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Rehber: [Konu]" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Giriş" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bu rehber ..." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Ön Koşullar" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Gereksinim 1" }] }] },
        ]},
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Adımlar" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sonuç" }] },
        { type: "paragraph" },
      ],
    },
  },
  {
    id: "faq",
    name: "SSS (FAQ)",
    description: "Sıkça sorulan sorular",
    icon: "HelpCircle",
    documentType: "FAQ",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Sıkça Sorulan Sorular" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Soru 1?" }] },
        { type: "paragraph", content: [{ type: "text", text: "Cevap: " }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Soru 2?" }] },
        { type: "paragraph", content: [{ type: "text", text: "Cevap: " }] },
      ],
    },
  },
];
