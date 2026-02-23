import { useState, useCallback } from "react";

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const presignedRes = await fetch("/api/upload/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!presignedRes.ok) throw new Error("Failed to get presigned URL");

      const { url, path } = await presignedRes.json();

      setProgress(30);

      // In production, upload to the presigned URL
      // await fetch(url, { method: "PUT", body: file });
      await new Promise((r) => setTimeout(r, 300));
      setProgress(80);

      await new Promise((r) => setTimeout(r, 200));
      setProgress(100);

      return { url: path, fileName: file.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, progress, error };
}
