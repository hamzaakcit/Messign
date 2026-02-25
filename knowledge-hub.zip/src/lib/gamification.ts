export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: string;
}

export const BADGES: Badge[] = [
  {
    id: "first_document",
    name: "İlk Doküman",
    description: "İlk dokümanını oluşturdun!",
    icon: "FileText",
    condition: "documents >= 1",
  },
  {
    id: "ten_documents",
    name: "Bilgi Paylaşımcı",
    description: "10 doküman oluşturdun!",
    icon: "Award",
    condition: "documents >= 10",
  },
  {
    id: "hundred_comments",
    name: "Yorum Ustası",
    description: "100 yorum yazdın!",
    icon: "MessageSquare",
    condition: "comments >= 100",
  },
  {
    id: "knowledge_hero",
    name: "Bilgi Kahramanı",
    description: "50+ doküman oluşturdun!",
    icon: "Trophy",
    condition: "documents >= 50",
  },
  {
    id: "reviewer",
    name: "İnceleme Uzmanı",
    description: "20 doküman incelendi",
    icon: "CheckCircle",
    condition: "reviews >= 20",
  },
];

export function checkBadges(stats: {
  documents: number;
  comments: number;
  reviews: number;
}): Badge[] {
  const earned: Badge[] = [];

  if (stats.documents >= 1) {
    earned.push(BADGES.find((b) => b.id === "first_document")!);
  }
  if (stats.documents >= 10) {
    earned.push(BADGES.find((b) => b.id === "ten_documents")!);
  }
  if (stats.comments >= 100) {
    earned.push(BADGES.find((b) => b.id === "hundred_comments")!);
  }
  if (stats.documents >= 50) {
    earned.push(BADGES.find((b) => b.id === "knowledge_hero")!);
  }
  if (stats.reviews >= 20) {
    earned.push(BADGES.find((b) => b.id === "reviewer")!);
  }

  return earned;
}
