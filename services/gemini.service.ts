// services/gemini.service.ts
import { GoogleGenAI, createUserContent } from "npm:@google/genai";
import {
  RequestData,
  ResponseData,
  GeminiPart,
  GeminiContent,
  RequestOptions,
  GenerationConfig,
  FileData,
  HistoryItem
} from "../types/index.ts";
import {
  fetchAndUploadFile,
  createFilePartFromUri,
  parseFileData,
  parseFileURLs
} from "../utils/file.utils.ts";

// 默认系统指令
const DEFAULT_SYSTEM_INSTRUCTION = "你是智能助手，你一直用中文回复解决问题。";

// 初始化Gemini客户端
export function initializeGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

// --- START ADDED CODE ---

/**
 * 从 Google File API URI 中提取文件ID。
 * 示例: "https://generativelanguage.googleapis.com/v1beta/files/vuw1akko5f52" -> "vuw1akko5f52"
 */
function extractFileIdFromUri(fileUri: string): string | null {
  const match = fileUri.match(/\/files\/([^/]+)$/);
  return match ? match[1] : null;
}

/**
 * 等待文件变为 ACTIVE 状态。
 * @param fileUri 文件的URI (例如: https://generativelanguage.googleapis.com/v1beta/files/vuw1akko5f52)
 * @param ai GoogleGenAI 客户端实例
 * @param maxRetries 最大重试次数
 * @param retryDelayMs 每次重试的延迟时间 (毫秒)
 */
async function waitForFileActive(
  fileUri: string,
  ai: GoogleGenAI,
  maxRetries: number = 20, // 增加重试次数，以应对大型文件处理时间
  retryDelayMs: number = 3000 // 每次重试间隔3秒
): Promise<void> {
  const fileId = extractFileIdFromUri(fileUri);
  if (!fileId) {
    throw new Error(`无法从URI提取文件ID: ${fileUri}`);
  }

  console.log(`等待文件 ${fileId} 变为 ACTIVE 状态...`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 通过 ai.getFile 方法获取文件状态
      const file = await ai.getFile(fileId);
      console.log(`文件 ${fileId} 当前状态: ${file.state}`);

      if (file && file.state === 'ACTIVE') {
        console.log(`文件 ${fileId} 已成功激活！`);
        return;
      } else if (file && file.state === 'FAILED') {
        throw new Error(`文件 ${fileId} 处理失败，状态为 FAILED。`);
      }
    } catch (error) {
      console.error(`获取文件 ${fileId} 状态时出错 (尝试 ${i + 1}/${maxRetries}):`, error);
      // 如果是404或其他致命错误，立即抛出
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
          throw new Error(`文件 ${fileId} 不存在或已被删除。`);
      }
    }

    if (i < maxRetries - 1) { // 最后一轮不等待
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`文件 ${fileId} 在 ${maxRetries * retryDelayMs / 1000} 秒内未能变为 ACTIVE 状态。`);
}
// --- END ADDED CODE ---


// 处理历史消息
export async function processMessageHistory(
  messageHistory: HistoryItem[] | undefined,
  ai: GoogleGenAI
): Promise<{
  finalContents: GeminiContent[];
  newlyUploadedFilesInfo: FileData[];
}> {
  const finalContents: GeminiContent[] = [];
  const newlyUploadedFilesInfo: FileData[] = [];

  if (!messageHistory || !Array.isArray(messageHistory)) {
    console.log("No valid MessageHistory found or it's not an array.");
    return { finalContents, newlyUploadedFilesInfo };
  }

  console.log(`Processing MessageHistory: ${messageHistory.length} items`);

  for (const historyItem of messageHistory) {
    if (typeof historyItem !== "object" || historyItem === null || typeof historyItem.role !== "string") {
      console.warn("Skipping malformed history item (not object or missing role):", historyItem);
      continue;
    }

    const geminiPartsForHistory: GeminiPart[] = [];

    // 处理文本内容
    if (typeof historyItem.text === "string" && historyItem.text.trim()) {
      const text = historyItem.text || "";
      geminiPartsForHistory.push({ text });
      console.log(`Added history text for role '${historyItem.role}': ${text.substring(0, Math.min(text.length, 50))}...`);
    }

    // 处理文件数据
    const parsedFileData = parseFileData(historyItem.filedata, historyItem.role);

    if (Array.isArray(parsedFileData)) {
      for (const fileDataItem of parsedFileData) {
        if (typeof fileDataItem === "object" && fileDataItem !== null &&
            typeof fileDataItem.uri === "string" && fileDataItem.uri.trim() &&
            typeof fileDataItem.mimeType === "string" && fileDataItem.mimeType.trim()) {

            let fileUriToUse = fileDataItem.uri || "";
            let fileMimeType = fileDataItem.mimeType;

            // 如果不是一个Google File API URI，则尝试上传
            if (fileUriToUse && !fileUriToUse.startsWith("https://generativelanguage.googleapis.com/v1beta/files/")) {
                try {
                    const { uploadedFile, mimeType } = await fetchAndUploadFile(fileUriToUse, ai);
                    fileUriToUse = uploadedFile.uri || "";
                    fileMimeType = mimeType;
                    console.log(`Uploaded new file from history (temp URI): ${fileUriToUse}`);
                } catch (uploadError) {
                    console.error(`Failed to upload file from history (${fileUriToUse}):`, uploadError);
                    continue; // 跳过此文件
                }
            } else {
                console.log(`Using existing file URI from history: ${fileUriToUse}`);
            }

            // --- START MODIFIED: Wait for file to be active before adding to contents ---
            if (fileUriToUse) { // 确保 URI 不为空
                try {
                    await waitForFileActive(fileUriToUse, ai); // 等待文件激活
                    newlyUploadedFilesInfo.push({ uri: fileUriToUse || "", mimeType: fileMimeType });
                    geminiPartsForHistory.push(createFilePartFromUri(fileUriToUse, fileMimeType));
                    console.log(`Confirmed active and added file part from history: ${fileUriToUse}`);
                } catch (waitError) {
                    console.error(`File ${fileUriToUse} failed to become active or encountered an error:`, waitError);
                    continue; // 如果文件未激活，则跳过此文件
                }
            }
            // --- END MODIFIED ---
        } else {
            console.warn("Skipping malformed fileDataItem in history (missing uri/mimeType or not object):", fileDataItem);
        }
      }
    }

    if (geminiPartsForHistory.length > 0) {
      // @ts-ignore - 类型定义与实际API不匹配，但代码功能正常
      finalContents.push(createUserContent(geminiPartsForHistory, historyItem.role));
      console.log(`Added history content for role '${historyItem.role}' to finalContents.`);
    } else {
      console.log(`History item for role '${historyItem.role}' has no valid parts, skipping.`);
    }
  }

  return { finalContents, newlyUploadedFilesInfo };
}

// 处理当前用户输入
export async function processCurrentUserInput(
  input: string | undefined,
  fileURL: string | string[] | undefined,
  ai: GoogleGenAI
): Promise<{
  finalContents: GeminiContent[];
  newlyUploadedFilesInfo: FileData[];
}> {
  const currentUserParts: GeminiPart[] = [];
  const newlyUploadedFilesInfo: FileData[] = [];

  // 处理文本输入
  if (typeof input === "string" && input.trim()) {
    const text = input || "";
    currentUserParts.push({ text });
    console.log(`Added current user input text: ${text.substring(0, Math.min(text.length, 50))}...`);
  } else {
    console.log("Current user input is missing or not a valid string.");
  }

  // 处理文件URL
  const currentFileURLs = parseFileURLs(fileURL);

  for (const url of currentFileURLs) {
    try {
      const { uploadedFile, mimeType } = await fetchAndUploadFile(url, ai);

      // --- START MODIFIED: Wait for file to be active before adding to contents ---
      if (uploadedFile.uri) { // 确保上传的 URI 不为空
        try {
          await waitForFileActive(uploadedFile.uri, ai); // 等待文件激活
          newlyUploadedFilesInfo.push({ uri: uploadedFile.uri || "", mimeType: mimeType });
          currentUserParts.push(createFilePartFromUri(uploadedFile.uri || "", mimeType));
          console.log(`Uploaded and added new file from current input (now active): ${url}`);
        } catch (waitError) {
          console.error(`File ${url} failed to become active or encountered an error:`, waitError);
          // 如果文件未激活，则跳过此文件
        }
      } else {
        console.error(`Uploaded file URI is empty for URL: ${url}`);
      }
      // --- END MODIFIED ---
    } catch (uploadError) {
      console.error(`Failed to upload or process file from current input (${url}):`, uploadError);
    }
  }

  const finalContents: GeminiContent[] = [];
  if (currentUserParts.length > 0) {
    // @ts-ignore - 类型定义与实际API不匹配，但代码功能正常
    finalContents.push(createUserContent(currentUserParts, "user"));
    console.log("Added current user content to finalContents.");
  } else {
    console.log("Current user content has no valid parts.");
  }

  return { finalContents, newlyUploadedFilesInfo };
}

// 调用Gemini API生成内容
export async function generateGeminiContent(
  contents: GeminiContent[],
  modelName: string,
  temperature: number | undefined,
  systemInstruction: string,
  ai: GoogleGenAI
): Promise<string> {
  console.log("Final contents sending to Gemini:", JSON.stringify(contents, null, 2));

  const generationConfig: GenerationConfig = {
    // temperature 只有在明确提供且为 number 时才加入
    ...(temperature !== undefined && { temperature }),
  };

  const safetySettings: Array<Record<string, unknown>> = []; // 根据需要添加安全设置

  const requestOptions: RequestOptions = {
    model: modelName,
    contents,
    generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
    safetySettings: safetySettings.length > 0 ? safetySettings : undefined,
    systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  };

  const geminiResponse = await ai.models.generateContent(requestOptions);
  const generatedText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log(`Gemini generated text: ${generatedText.substring(0, Math.min(generatedText.length, 100))}...`);

  return generatedText;
}

// 主处理函数
export async function processGeminiRequest(data: RequestData): Promise<ResponseData> {
  try {
    // 验证API密钥
    const apiKey = data.apikey;
    if (!apiKey) {
      return {
        success: false,
        response: "apikey is missing in the request payload.",
        fileDatas: []
      };
    }

    // 初始化AI客户端
    const ai = initializeGeminiClient(apiKey);

    // 获取参数
    const temperature = typeof data.temperature === 'number' ? data.temperature : undefined;
    console.log(`Using temperature: ${temperature}`);

    const systemInstruction = typeof data.systemInstruction === 'string' && data.systemInstruction.trim() !== ''
        ? data.systemInstruction
        : DEFAULT_SYSTEM_INSTRUCTION;
    console.log(`Using systemInstruction: ${systemInstruction}`);

    const modelName = typeof data.modelName === 'string' && data.modelName.trim() !== ''
        ? data.modelName
        : "gemini-2.5-flash-preview-05-20";
    console.log(`Using model: ${modelName}`);

    // 处理历史消息
    const { finalContents: historyContents, newlyUploadedFilesInfo: historyFiles } =
      await processMessageHistory(data.MessageHistory, ai);

    // 处理当前用户输入
    const { finalContents: userContents, newlyUploadedFilesInfo: userFiles } =
      await processCurrentUserInput(data.input, data.fileURL, ai);

    // 合并内容和上传的文件信息
    const allContents = [...historyContents, ...userContents];
    const allUploadedFiles = [...historyFiles, ...userFiles];

    if (allContents.length === 0) {
      console.warn("No valid content found in input/fileURL or MessageHistory to send to Gemini.");
      return {
        success: false,
        response: "没有找到有效内容发送给Gemini。",
        fileDatas: []
      };
    }

    // 生成内容
    const generatedText = await generateGeminiContent(
      allContents,
      modelName,
      temperature,
      systemInstruction,
      ai
    );

    // 返回结果
    return {
      success: true,
      response: generatedText,
      fileDatas: allUploadedFiles
    };

  } catch (error: unknown) {
    console.error("Error in processGeminiRequest:", error);
    return {
      success: false,
      response: `内部服务器错误: ${error instanceof Error ? error.message : "未知错误"}`,
      fileDatas: [],
      details: error instanceof Error ? error.stack : String(error)
    };
  }
}
