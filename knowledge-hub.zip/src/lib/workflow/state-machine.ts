import { DocumentStatus } from "@prisma/client";

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: [DocumentStatus.IN_REVIEW, DocumentStatus.ARCHIVED],
  IN_REVIEW: [DocumentStatus.PUBLISHED, DocumentStatus.REJECTED],
  REJECTED: [DocumentStatus.DRAFT],
  PUBLISHED: [DocumentStatus.ARCHIVED],
  ARCHIVED: [],
};

export function validateTransition(
  currentStatus: DocumentStatus,
  targetStatus: DocumentStatus
): boolean {
  return TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export function getAvailableTransitions(
  currentStatus: DocumentStatus
): DocumentStatus[] {
  return TRANSITIONS[currentStatus] ?? [];
}
