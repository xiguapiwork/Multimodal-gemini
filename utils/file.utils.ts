// utils/file.utils.ts
import { GoogleGenAI } from "npm:@google/genai";
import { createPartFromUri } from "npm:@google/genai";
import { FileData } from "../types/index.ts";

// 从URL获取文件并上传到Gemini File API
export async function fetchAndUploadFile(url: string, ai: GoogleGenAI) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${url}, Status: ${response.status} ${response.statusText}`);
    }

    const mimeType = response.headers.get("Content-Type") || "application/octet-stream";
    const blob = await response.blob();

    console.log(`Uploading file to Gemini: URL=${url}, MimeType=${mimeType}, Size=${blob.size} bytes`);
    const uploadedFile = await ai.files.upload({
      file: blob,
      config: { mimeType },
    });
    console.log(`File uploaded to Gemini: ${uploadedFile.uri}, DisplayName: ${uploadedFile.displayName}`);

    return { uploadedFile, mimeType };
  } catch (error) {
    console.error(`Error fetching or uploading file from "${url}":`, error);
    throw error; // 重新抛出错误以便上层捕获
  }
}

// 创建Gemini API的Part对象，用于处理文件
export function createFilePartFromUri(fileUri: string, mimeType: string) {
  return createPartFromUri(fileUri, mimeType);
}

// 解析文件数据
export function parseFileData(rawFileData: string | FileData[] | undefined, role: string): FileData[] {
  let parsedFileData: FileData[] = [];

  // 明确处理空字符串
  if (typeof rawFileData === "string" && rawFileData.trim() === "") {
    console.log(`Skipping empty filedata string for role '${role}'.`);
    return [];
  }
  else if (typeof rawFileData === "string" && rawFileData.trim()) {
    try {
      parsedFileData = JSON.parse(rawFileData);
      console.log(`Parsed filedata string for role '${role}':`, parsedFileData);
    } catch (parseError) {
      console.warn(`Failed to parse filedata string for role '${role}' as JSON, treating as empty: ${rawFileData}`, parseError);
      return [];
    }
  } else if (Array.isArray(rawFileData)) {
    parsedFileData = rawFileData;
    console.log(`Received filedata as array for role '${role}':`, parsedFileData);
  } else if (rawFileData !== undefined && rawFileData !== null) {
    console.warn(`Unsupported filedata type for role '${role}': ${typeof rawFileData}`, rawFileData);
  }

  return parsedFileData;
}

// 解析文件URL
export function parseFileURLs(userFileURL: string | string[] | undefined): string[] {
  let currentFileURLs: string[] = [];

  if (Array.isArray(userFileURL)) {
    currentFileURLs = userFileURL.filter((url: string) => typeof url === "string" && url.trim());
    console.log(`Received fileURL as array: ${currentFileURLs.length} items`);
  } 
  else if (typeof userFileURL === "string" && userFileURL.trim()) {
    try {
      const parsed = JSON.parse(userFileURL);
      if (Array.isArray(parsed)) {
        currentFileURLs = parsed.filter((url: unknown) => typeof url === "string" && url.trim());
        console.log(`Parsed fileURL string as array: ${currentFileURLs.length} items`);
      } else {
        console.warn(`fileURL string parsed to non-array type, treating as single URL: ${userFileURL}`);
        currentFileURLs = [userFileURL.trim()];
        console.log(`Received fileURL as single string (JSON parsed to non-array): ${currentFileURLs[0]}`);
      }
    } catch (e) {
      console.warn(`Failed to parse fileURL string as JSON, attempting comma split or single URL: ${userFileURL}`, e);
      if (userFileURL.includes(',')) {
        currentFileURLs = userFileURL.split(',').map((url: string) => url.trim()).filter(Boolean);
        console.log(`Received fileURL as comma-separated string: ${currentFileURLs.length} items`);
      } else {
        currentFileURLs = [userFileURL.trim()];
        console.log(`Received fileURL as single string (JSON parse failed): ${currentFileURLs[0]}`);
      }
    }
  } else {
    console.log("No valid fileURL found or it's not an array/string.");
  }

  return currentFileURLs;
}