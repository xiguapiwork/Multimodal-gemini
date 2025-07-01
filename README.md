# Multimodal API for Coze

这是一个基于Deno的多模态API服务，用于处理Coze平台的多模态请求，支持文本和图像处理。

## 项目结构

```
├── main.ts                 # 应用入口点
├── deno.json               # Deno配置文件
├── README.md               # 项目说明文档
├── routes/                 # 路由处理
│   └── chat.route.ts       # 聊天路由处理
├── services/               # 服务层
│   └── gemini.service.ts   # Gemini API服务
├── types/                  # 类型定义
│   └── index.ts            # 接口和类型定义
└── utils/                  # 工具函数
    └── file.utils.ts       # 文件处理工具
```

## 功能特性

- 支持文本和图像的多模态交互
- 支持历史消息处理
- 支持文件上传和处理
- 支持自定义系统指令
- 支持温度参数调整
- 支持自定义模型选择

## 运行方式

### 开发环境

```bash
deno task dev
```

### 生产环境

```bash
deno task start
```

## API使用

### 请求格式

```json
{
  "apikey": "your-gemini-api-key",
  "temperature": 1.0,
  "systemInstruction": "你是智能助手，你一直用中文回复解决问题。",
  "modelName": "gemini-2.5-flash-preview-05-20",
  "input": "用户输入文本",
  "fileURL": ["https://example.com/image.jpg"],
  "MessageHistory": [
    {
      "role": "user",
      "text": "历史用户消息"
    },
    {
      "role": "model",
      "text": "历史模型回复"
    }
  ]
}
```

### 响应格式

```json
{
  "success": true,
  "response": "模型生成的回复内容",
  "fileDatas": [
    {
      "uri": "已上传文件的URI",
      "mimeType": "文件的MIME类型"
    }
  ]
}
```

## 错误处理

当请求处理失败时，API将返回包含错误信息的JSON响应：

```json
{
  "success": false,
  "response": "错误描述",
  "fileDatas": [],
  "error": "错误类型",
  "details": "详细错误信息"
}
```