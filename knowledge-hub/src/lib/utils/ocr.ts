// In production, integrate with Tesseract.js or a cloud OCR service (Google Vision, AWS Textract)
export async function extractTextFromFile(
  fileUrl: string,
  fileType: string
): Promise<string> {
  return `OCR processing not yet configured. File: ${fileUrl}`;
}
