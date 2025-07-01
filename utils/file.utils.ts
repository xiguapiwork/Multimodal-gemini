// utils/file.utils.ts
import { GoogleGenAI } from "npm:@google/genai";
import { createPartFromUri } from "npm:@google/genai";
// 导入 File 类型以获得更好的类型提示
import type { File } from "npm:@google/genai/dist/files/index.mjs";
import { FileData } from "../types/index.ts";

// 辅助延时函数，用于在轮询中创建等待间隔
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 从URL获取文件，上传到Gemini File API，并轮询等待文件状态变为 ACTIVE。
 * @param url 要获取的文件的URL。
 * @param ai 初始化后的 GoogleGenAI 客户端实例。
 * @returns 返回一个包含已激活的 File 对象和其 mimeType 的 Promise。
 */
export async function fetchAndUploadFile(
  url: string,
  ai: GoogleGenAI
): Promise<{ uploadedFile: File; mimeType: string }> {
  try {
    // 步骤 1: 获取文件内容
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch file from URL: ${url}, Status: ${response.status} ${response.statusText}`
      );
    }
    const mimeType =
      response.headers.get("Content-Type") || "application/octet-stream";
    const blob = await response.blob();

    console.log(
      `Uploading file to Gemini: URL=${url}, MimeType=${mimeType}, Size=${blob.size} bytes`
    );

    // 步骤 2: 上传文件并进行健壮性检查
    const uploadResponse = await ai.files.upload({
      file: blob,
      config: { mimeType },
    });

    // 关键检查：确保 API 返回了我们期望的 { file: ... } 结构
    if (!uploadResponse || !uploadResponse.file) {
      console.error("Gemini file upload failed. The API response did not contain a 'file' object.", uploadResponse);
      throw new Error("File upload to Gemini failed: Invalid response from API.");
    }
    
    // 从此刻起，我们有一个包含 `name` 和 `uri` 的有效 file 对象
    const fileToPoll = uploadResponse.file; 
    console.log(
      `File upload initiated. Name: ${fileToPoll.name}, URI: ${fileToPoll.uri}. Now polling for ACTIVE state...`
    );

    // 步骤 3: 轮询文件状态
    const MAX_RETRIES = 20; // 最多轮询 20 次 (约40秒)
    const POLLING_INTERVAL_MS = 2000; // 每 2 秒检查一次

    for (let i = 0; i < MAX_RETRIES; i++) {
      // 使用上传后得到的 fileToPoll.name 来获取最新状态
      const getFileResponse = await ai.files.get({ name: fileToPoll.name });
      const currentFile = getFileResponse.file;
      
      console.log(
        `Polling attempt ${i + 1}/${MAX_RETRIES}: File '${currentFile.name}' state is '${currentFile.state}'.`
      );

      if (currentFile.state === "ACTIVE") {
        console.log(`File '${currentFile.name}' is now ACTIVE.`);
        // 文件已激活，返回这个最终的、状态为 ACTIVE 的文件对象
        return { uploadedFile: currentFile, mimeType: currentFile.mimeType };
      }

      if (currentFile.state === "FAILED") {
        console.error(`File processing failed for '${currentFile.name}'.`, currentFile);
        throw new Error(`File processing failed for file: ${currentFile.name}`);
      }

      // 如果状态是 PROCESSING，则等待后继续下一次循环
      await delay(POLLING_INTERVAL_MS);
    }

    // 如果循环结束了文件还不是 ACTIVE，则抛出超时错误
    throw new Error(
      `File '${fileToPoll.name}' did not become ACTIVE within the timeout period.`
    );

  } catch (error) {
    console.error(`Error in fetchAndUploadFile for "${url}":`, error);
    // 重新抛出错误，以便上层服务可以捕获并处理
    throw error;
  }
}

// 创建Gemini API的Part对象，用于处理文件 (保持不变)
export function createFilePartFromUri(fileUri: string, mimeType: string) {
  return createPartFromUri(fileUri, mimeType);
}

// 解析文件数据 (保持不变)
export function parseFileData(
  rawFileData: string | FileData[] | undefined,
  role: string
): FileData[] {
  let parsedFileData: FileData[] = [];

  // 明确处理空字符串
  if (typeof rawFileData === "string" && rawFileData.trim() === "") {
    console.log(`Skipping empty filedata string for role '${role}'.`);
    return [];
  } else if (typeof rawFileData === "string" && rawFileData.trim()) {
    try {
      parsedFileData = JSON.parse(rawFileData);
      console.log(`Parsed filedata string for role '${role}':`, parsedFileData);
    } catch (parseError) {
      console.warn(
        `Failed to parse filedata string for role '${role}' as JSON, treating as empty: ${rawFileData}`,
        parseError
      );
      return [];
    }
  } else if (Array.isArray(rawFileData)) {
    parsedFileData = rawFileData;
    console.log(`Received filedata as array for role '${role}':`, parsedFileData);
  } else if (rawFileData !== undefined && rawFileData !== null) {
    console.warn(
      `Unsupported filedata type for role '${role}': ${typeof rawFileData}`,
      rawFileData
    );
  }

  return parsedFileData;
}

// 解析文件URL (保持不变)
export function parseFileURLs(
  userFileURL: string | string[] | undefined
): string[] {
  let currentFileURLs: string[] = [];

  if (Array.isArray(userFileURL)) {
    currentFileURLs = userFileURL.filter(
      (url: string) => typeof url === "string" && url.trim()
    );
    console.log(`Received fileURL as array: ${currentFileURLs.length} items`);
  } else if (typeof userFileURL === "string" && userFileURL.trim()) {
    try {
      const parsed = JSON.parse(userFileURL);
      if (Array.isArray(parsed)) {
        currentFileURLs = parsed.filter(
          (url: unknown) => typeof url === "string" && url.trim()
        );
        console.log(
          `Parsed fileURL string as array: ${currentFileURLs.length} items`
        );
      } else {
        console.warn(
          `fileURL string parsed to non-array type, treating as single URL: ${userFileURL}`
        );
        currentFileURLs = [userFileURL.trim()];
        console.log(
          `Received fileURL as single string (JSON parsed to non-array): ${currentFileURLs[0]}`
        );
      }
    } catch (e) {
      console.warn(
        `Failed to parse fileURL string as JSON, attempting comma split or single URL: ${userFileURL}`,
        e
      );
      if (userFileURL.includes(",")) {
        currentFileURLs = userFileURL
          .split(",")
          .map((url: string) => url.trim())
          .filter(Boolean);
        console.log(
          `Received fileURL as comma-separated string: ${currentFileURLs.length} items`
        );
      } else {
        currentFileURLs = [userFileURL.trim()];
        console.log(
          `Received fileURL as single string (JSON parse failed): ${currentFileURLs[0]}`
        );
      }
    }
  } else {
    console.log("No valid fileURL found or it's not an array/string.");
  }

  return currentFileURLs;
}
