"use client";

import { useState } from "react";

export default function FileUploader() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const allFiles: File[] = [];
    
    // Handle both individual files and directories
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('audio/')) {
        allFiles.push(file);
      }
    }

    setUploadedFiles(prevFiles => [...prevFiles, ...allFiles]);
    setUploadStatus(null); // Reset status when new files are added
  };

  const handleSubmit = async () => {
    if (uploadedFiles.length === 0) return;

    setIsUploading(true);
    setUploadStatus(null);
    try {
      const formData = new FormData();
      uploadedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Clear files after successful upload
      setUploadedFiles([]);
      setUploadStatus({
        type: "success",
        message: "Files uploaded and processed successfully!"
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      setUploadStatus({
        type: "error",
        message: "Failed to upload files. Please try again."
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl">Upload Audio Files</h2>
      <input
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="border border-gray-300 rounded p-2"
        multiple
      />
      {uploadStatus && (
        <div className={`p-3 rounded ${
          uploadStatus.type === "success" 
            ? "bg-green-100 text-green-700 border border-green-200" 
            : "bg-red-100 text-red-700 border border-red-200"
        }`}>
          {uploadStatus.message}
        </div>
      )}
      {uploadedFiles.length > 0 && (
        <>
          <div className="text-sm text-gray-600">
            <p>Uploaded {uploadedFiles.length} files:</p>
            <ul className="mt-2 list-disc pl-4">
              {uploadedFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isUploading}
            className="rounded-full border border-solid transition-colors px-4 py-2 bg-foreground text-background hover:bg-[#383838] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Processing...' : 'Process Files'}
          </button>
        </>
      )}
    </div>
  );
}
