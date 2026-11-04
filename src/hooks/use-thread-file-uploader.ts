"use client";

import { useCallback } from "react";
import { appStore, UploadedFile } from "@/app/store";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";

// Upload a single file with progress tracking
async function uploadFileWithProgress(
  file: File,
  onProgress: (progress: number) => void,
): Promise<{ url: string; key: string } | null> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve({ url: result.url, key: result.key });
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    xhr.addEventListener("error", () => resolve(null));
    xhr.addEventListener("abort", () => resolve(null));

    xhr.open("POST", "/api/storage/upload");
    xhr.send(formData);
  });
}

export function useThreadFileUploader(threadId?: string) {
  const appStoreMutate = appStore((s) => s.mutate);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!threadId || files.length === 0) return;
      const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file

      // Filter valid files first
      const validFiles = files.filter((file) => {
        if (file.size > MAX_SIZE_BYTES) {
          toast.error(`${file.name}: file too large (>50MB)`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      // Create upload entries for all files immediately (show previews right away)
      const uploadEntries = validFiles.map((file) => {
        const fileId = generateUUID();
        const previewUrl = file.type?.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;

        // For images, also create a data URL for immediate display
        let dataUrl: string | undefined;
        if (file.type?.startsWith("image/") && file.size < 5 * 1024 * 1024) {
          // Only for images under 5MB
          const reader = new FileReader();
          reader.onload = (e) => {
            dataUrl = e.target?.result as string;
            // Update the store with dataUrl
            appStoreMutate((prev) => ({
              threadFiles: {
                ...prev.threadFiles,
                [threadId]: (prev.threadFiles[threadId] ?? []).map((f) =>
                  f.id === fileId ? { ...f, dataUrl } : f,
                ),
              },
            }));
          };
          reader.readAsDataURL(file);
        }

        const uploadingFile: UploadedFile = {
          id: fileId,
          url: "",
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          isUploading: true,
          progress: 0,
          previewUrl,
          dataUrl,
        };

        return { file, fileId, uploadingFile, previewUrl };
      });

      // Add all files to store at once
      appStoreMutate((prev) => ({
        threadFiles: {
          ...prev.threadFiles,
          [threadId]: [
            ...(prev.threadFiles[threadId] ?? []),
            ...uploadEntries.map((e) => e.uploadingFile),
          ],
        },
      }));

      // Upload all files in parallel
      await Promise.all(
        uploadEntries.map(async ({ file, fileId, previewUrl }) => {
          try {
            const result = await uploadFileWithProgress(file, (progress) => {
              // Update progress in store
              appStoreMutate((prev) => ({
                threadFiles: {
                  ...prev.threadFiles,
                  [threadId]: (prev.threadFiles[threadId] ?? []).map((f) =>
                    f.id === fileId ? { ...f, progress } : f,
                  ),
                },
              }));
            });

            if (result) {
              // Upload successful
              appStoreMutate((prev) => ({
                threadFiles: {
                  ...prev.threadFiles,
                  [threadId]: (prev.threadFiles[threadId] ?? []).map((f) =>
                    f.id === fileId
                      ? {
                          ...f,
                          url: result.url,
                          isUploading: false,
                          progress: 100,
                        }
                      : f,
                  ),
                },
              }));
            } else {
              // Upload failed - remove file
              toast.error(`Failed to upload ${file.name}`);
              appStoreMutate((prev) => ({
                threadFiles: {
                  ...prev.threadFiles,
                  [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                    (f) => f.id !== fileId,
                  ),
                },
              }));
            }
          } catch {
            // Upload error - remove file
            appStoreMutate((prev) => ({
              threadFiles: {
                ...prev.threadFiles,
                [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                  (f) => f.id !== fileId,
                ),
              },
            }));
          } finally {
            // Clean up preview URL after upload completes
            if (previewUrl) {
              // Delay cleanup to ensure UI has updated
              setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);
            }
          }
        }),
      );
    },
    [threadId, appStoreMutate],
  );

  return { uploadFiles };
}
