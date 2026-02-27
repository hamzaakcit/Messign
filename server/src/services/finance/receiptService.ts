import crypto from 'crypto';
import { query } from '../../db/index.js';
import { extractReceiptData, type ReceiptExtractionResult } from '../ai/receiptExtractor.js';
import { auditService } from './auditService.js';

export interface ReceiptProcessResult {
  document_id: string;
  extraction: ReceiptExtractionResult;
  duplicate_detected: boolean;
  duplicate_expense_ids: string[];
  auto_filled: boolean;
}

export const receiptService = {
  computeFileHash(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  },

  async checkDuplicate(fileHash: string, orgId: string): Promise<string[]> {
    const result = await query<{ id: string }>(
      `SELECT id FROM reimbursement_documents WHERE file_hash = $1`,
      [fileHash],
    );
    if (result.rows.length > 0) return result.rows.map((r) => r.id);

    const receiptResult = await query<{ id: string }>(
      `SELECT id FROM reimbursement_requests
       WHERE organization_id = $1 AND receipt_hash = $2 AND is_deleted = FALSE`,
      [orgId, fileHash],
    );
    return receiptResult.rows.map((r) => r.id);
  },

  async processReceipt(
    documentId: string,
    imageBase64: string,
    mediaType: string,
    fileHash: string,
    orgId: string,
    userId: string,
  ): Promise<ReceiptProcessResult> {
    const startTime = Date.now();

    const duplicates = await this.checkDuplicate(fileHash, orgId);

    const extraction = await extractReceiptData(imageBase64, mediaType);

    await query(
      `UPDATE reimbursement_documents SET
         file_hash = $1,
         extracted_vendor = $2,
         extracted_amount = $3,
         extracted_date = $4,
         extracted_tax = $5,
         extracted_currency = $6,
         extracted_items = $7,
         is_verified = FALSE,
         verified_method = 'ai',
         ocr_processed = TRUE,
         ocr_vendor_name = $2,
         ocr_amount = $3
       WHERE id = $8`,
      [
        fileHash,
        extraction.vendor_name,
        extraction.amount,
        extraction.date,
        null,
        extraction.currency,
        JSON.stringify(extraction.line_items),
        documentId,
      ],
    );

    let autoFilled = false;
    const doc = await query<{ reimbursement_id: string }>(
      'SELECT reimbursement_id FROM reimbursement_documents WHERE id = $1',
      [documentId],
    );
    const expenseId = doc.rows[0]?.reimbursement_id;

    if (expenseId && extraction.confidence >= 0.7) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (extraction.amount != null) {
        sets.push(`original_amount = $${idx}`, `converted_amount = $${idx++}`);
        params.push(extraction.amount);
      }
      if (extraction.currency) {
        sets.push(`original_currency = $${idx++}`);
        params.push(extraction.currency);
      }
      if (extraction.date) {
        sets.push(`expense_date = $${idx++}`);
        params.push(extraction.date);
      }
      if (extraction.vendor_name) {
        sets.push(`ai_category_suggestion = $${idx++}`);
        params.push(extraction.category ?? extraction.vendor_name);
      }
      if (extraction.category) {
        sets.push(`category_slug = $${idx++}`);
        params.push(extraction.category);
      }

      sets.push(`ai_confidence_score = $${idx++}`);
      params.push(extraction.confidence);
      sets.push(`ai_extracted_data = $${idx++}`);
      params.push(JSON.stringify(extraction.raw_extraction));
      sets.push(`receipt_hash = $${idx++}`);
      params.push(fileHash);
      sets.push(`receipt_verified = FALSE`);

      if (duplicates.length > 0) {
        sets.push(`ai_duplicate_refs = $${idx++}`);
        params.push(JSON.stringify(duplicates));
        sets.push(`ai_risk_flags = ai_risk_flags || $${idx++}::jsonb`);
        params.push(JSON.stringify([{
          type: 'duplicate_receipt',
          severity: 'high',
          description: `Potential duplicate receipt detected (${duplicates.length} matches)`,
        }]));
        const riskBoost = Math.min(0.3 + duplicates.length * 0.15, 0.95);
        sets.push(`ai_risk_score = GREATEST(COALESCE(ai_risk_score, 0), $${idx++})`);
        params.push(riskBoost);
      }

      if (sets.length > 0) {
        params.push(expenseId);
        await query(
          `UPDATE reimbursement_requests SET ${sets.join(', ')}, ai_categorized_at = NOW() WHERE id = $${idx++}`,
          params,
        );
        autoFilled = true;
      }
    }

    const processingTime = Date.now() - startTime;

    await query(
      `INSERT INTO finance_dora_decisions
       (organization_id, decision_type, entity_type, entity_id, action_taken,
        confidence_score, reasoning, processing_time_ms, model_used)
       VALUES ($1, 'receipt_scan', 'expense', $2, 'extract_and_fill',
               $3, $4, $5, 'claude-vision')`,
      [
        orgId, expenseId ?? documentId,
        extraction.confidence,
        `OCR scan complete. Vendor: ${extraction.vendor_name ?? 'unknown'}, Amount: ${extraction.amount ?? 'unknown'} ${extraction.currency ?? ''}, Confidence: ${(extraction.confidence * 100).toFixed(0)}%`,
        processingTime,
      ],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'receipt.processed',
      event_category: 'expense',
      actor_type: 'ai',
      actor_id: 'dora',
      actor_name: 'Dora AI',
      entity_type: 'expense',
      entity_id: expenseId ?? documentId,
      changes: {
        vendor: extraction.vendor_name,
        amount: extraction.amount,
        confidence: extraction.confidence,
        duplicate: duplicates.length > 0,
      },
      ai_involved: true,
      ai_confidence: extraction.confidence,
      ai_reasoning: `Receipt processed with ${(extraction.confidence * 100).toFixed(0)}% confidence`,
    });

    return {
      document_id: documentId,
      extraction,
      duplicate_detected: duplicates.length > 0,
      duplicate_expense_ids: duplicates,
      auto_filled: autoFilled,
    };
  },
};
