// routes/chat.route.ts
import { processGeminiRequest } from "../services/gemini.service.ts";
import { RequestData, ResponseData } from "../types/index.ts";

// CORS头部
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * 处理聊天请求
 * 接收POST请求，处理JSON数据，并调用Gemini服务
 */
export async function handleChatRequest(req: Request): Promise<Response> {
  // 处理OPTIONS请求（预检请求）
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 只处理POST请求
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ 
      success: false,
      response: "Only POST method is allowed.",
      fileDatas: []
    }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 验证内容类型
    const contentType = req.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ 
        success: false,
        response: "Unsupported Content-Type. Please use application/json.",
        fileDatas: []
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 解析请求数据
    const data: RequestData = await req.json();
    console.log("Received JSON data from Coze tool (Deno handler):", JSON.stringify(data, null, 2));
    
    // 调用Gemini服务处理请求
    const response: ResponseData = await processGeminiRequest(data);
    
    // 返回处理结果
    return new Response(JSON.stringify(response), {
      status: response.success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    // 处理请求解析或处理过程中的错误
    console.error("Error processing request in chat handler:", error);
    return new Response(JSON.stringify({
      success: false,
      response: `请求处理失败: ${error instanceof Error ? error.message : "未知错误"}`,
      fileDatas: [],
      details: error instanceof Error ? error.stack : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}