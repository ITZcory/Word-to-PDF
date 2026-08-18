# 轻转 · Word 转 PDF

一个支持邮箱注册登录的在线 Word 转 PDF 网站。文档在用户浏览器中完成解析与转换，不会上传到服务器。
链接：https://qingzhuan-word-pdf.itzcory.chatgpt.site

## 功能

- 邮箱注册、验证和登录
- 拖拽或选择 `.docx` 文件
- 浏览器本地转换与 PDF 下载
- 尽可能保留标题、段落、表格和图片
- 响应式中文界面

## 技术栈

- React 19、TypeScript、vinext
- Supabase Auth
- Mammoth、html2canvas、jsPDF
- Tailwind CSS

## 本地运行

需要 Node.js `22.13.0` 或更高版本。

```bash
npm install
npm run dev
```

构建与测试：

```bash
npm run build
npm test
```

## 隐私说明

Supabase 仅用于账号认证。Word 文档和生成的 PDF 均在浏览器本地处理，网站不会上传或保存文档内容。
