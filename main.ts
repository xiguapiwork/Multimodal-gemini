// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleChatRequest } from "./routes/chat.route.ts";

// 全局请求处理函数
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // 路由分发
  if (url.pathname === "/" || url.pathname === "/chat") {
    return await handleChatRequest(req);
  }
  
  // 404处理
  return new Response(
    JSON.stringify({ 
      success: false,
      response: "Not Found",
      fileDatas: [] 
    }),
    { 
      status: 404, 
      headers: { "Content-Type": "application/json" } 
    }
  );
}

// 启动服务器
console.log("Starting Multimodal API server...");
serve(handleRequest);
console.log("Server running. Available endpoints:");
console.log("  POST / - Chat with Gemini");
console.log("  POST /chat - Chat with Gemini");