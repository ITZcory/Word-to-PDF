"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";

type Stage = "idle" | "ready" | "converting" | "done" | "error";

const MAX_SIZE = 20 * 1024 * 1024;

function prettyBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".docx")) {
      setStage("error");
      setMessage("请选择 .docx 格式的 Word 文档");
      return;
    }
    if (nextFile.size > MAX_SIZE) {
      setStage("error");
      setMessage("文件大小不能超过 20 MB");
      return;
    }
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setFile(nextFile);
    setStage("ready");
    setProgress(0);
    setMessage("");
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const reset = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setFile(null);
    setStage("idle");
    setProgress(0);
    setMessage("");
    if (renderRef.current) renderRef.current.innerHTML = "";
  };

  const convert = async () => {
    if (!file || !renderRef.current) return;
    setStage("converting");
    setProgress(12);
    setMessage("正在读取文档…");

    try {
      const [mammothModule, canvasModule, pdfModule] = await Promise.all([
        import("mammoth"),
        import("html2canvas"),
        import("jspdf"),
      ]);
      setProgress(28);
      const mammoth = mammothModule.default;
      const source = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer: source },
        { convertImage: mammoth.images.dataUri }
      );
      setMessage("正在还原文档版式…");
      setProgress(48);

      const target = renderRef.current;
      target.innerHTML = result.value || "<p>此文档没有可转换的内容。</p>";
      await Promise.all(
        Array.from(target.querySelectorAll("img")).map(
          (image) =>
            image.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  image.onload = () => resolve();
                  image.onerror = () => resolve();
                })
        )
      );
      await document.fonts.ready;
      setMessage("正在生成 PDF…");
      setProgress(68);

      const html2canvas = canvasModule.default;
      const canvas = await html2canvas(target, {
        scale: 1.7,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
      });
      setProgress(88);

      const { jsPDF } = pdfModule;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210;
      const pageHeight = 297;
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.94);
      let remaining = imageHeight;
      let offset = 0;

      pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight, undefined, "FAST");
      remaining -= pageHeight;
      while (remaining > 0) {
        offset -= pageHeight;
        pdf.addPage();
        pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight, undefined, "FAST");
        remaining -= pageHeight;
      }

      const url = URL.createObjectURL(pdf.output("blob"));
      setDownloadUrl(url);
      setProgress(100);
      setMessage(result.messages.length ? "转换完成，复杂版式可能会有细微变化" : "转换完成");
      setStage("done");
    } catch (error) {
      console.error(error);
      setStage("error");
      setMessage("转换没有完成，请确认文档未损坏后重试");
      setProgress(0);
    }
  };

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="主导航">
        <a className="brand" href="#top" aria-label="轻转首页">
          <span className="brand-mark">W</span>
          <span>轻转</span>
        </a>
        <div className="nav-links">
          <a className="active" href="#converter">Word 转 PDF</a>
          <a href="#features">功能特点</a>
          <a href="#help">使用帮助</a>
        </div>
        <span className="privacy-pill"><span aria-hidden="true">●</span> 文件仅在本地处理</span>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span>✦</span> 免费 · 无需注册 · 不限次数</div>
        <h1>Word 转 PDF<br /><em>简单、快速、安全</em></h1>
        <p>无需上传服务器，在浏览器中完成转换。<br />你的文档，从始至终只属于你。</p>

        <div className={`converter-card stage-${stage}`} id="converter">
          {stage === "idle" || stage === "error" ? (
            <div
              className={`upload-zone ${dragging ? "is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
              aria-label="选择或拖入 Word 文档"
            >
              <div className="word-icon"><span>W</span></div>
              <h2>{dragging ? "松开即可添加文档" : "拖拽 Word 文档到这里"}</h2>
              <p>或点击下方按钮选择文件</p>
              <button className="primary-button" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
                <span aria-hidden="true">＋</span> 选择 Word 文件
              </button>
              <small>支持 .docx 格式 · 单个文件最大 20 MB</small>
              {stage === "error" && <div className="error-message" role="alert">! {message}</div>}
            </div>
          ) : (
            <div className="process-zone" aria-live="polite">
              <div className="file-visual"><span>W</span></div>
              <div className="file-summary">
                <strong title={file?.name}>{file?.name}</strong>
                <span>{file ? prettyBytes(file.size) : ""}</span>
              </div>

              {stage === "ready" && (
                <>
                  <div className="ready-badge"><span>✓</span> 文件已就绪</div>
                  <button className="primary-button wide" type="button" onClick={convert}>开始转换为 PDF <span>→</span></button>
                  <button className="text-button" type="button" onClick={reset}>重新选择</button>
                </>
              )}

              {stage === "converting" && (
                <div className="progress-area">
                  <div className="progress-copy"><span>{message}</span><b>{progress}%</b></div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <small>请保持页面打开，文档不会离开你的设备</small>
                </div>
              )}

              {stage === "done" && (
                <>
                  <div className="success-mark">✓</div>
                  <h2>PDF 已准备好</h2>
                  <p className="done-note">{message}</p>
                  <a className="primary-button wide download" href={downloadUrl} download={`${file?.name.replace(/\.docx$/i, "") || "document"}.pdf`}>
                    <span aria-hidden="true">↓</span> 下载 PDF
                  </a>
                  <button className="text-button" type="button" onClick={reset}>转换另一个文档</button>
                </>
              )}
            </div>
          )}
          <div className="trust-row">
            <span><b>✓</b> 本地转换</span>
            <span><b>✓</b> 不保存文件</span>
            <span><b>✓</b> 完全免费</span>
          </div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading">
          <span>为什么选择轻转</span>
          <h2>专注把一件事做好</h2>
          <p>没有广告弹窗，没有复杂设置，只有清爽顺畅的转换体验。</p>
        </div>
        <div className="feature-grid">
          <article><i className="feature-icon blue">⌁</i><h3>隐私优先</h3><p>文件在你的浏览器中完成处理，不会上传、保存或分享给任何人。</p></article>
          <article><i className="feature-icon violet">⚡</i><h3>即刻完成</h3><p>无需排队和等待，转换完成后立即下载，适合日常快速使用。</p></article>
          <article><i className="feature-icon green">文</i><h3>保留内容</h3><p>尽可能保留标题、段落、表格与图片，让 PDF 清晰易读。</p></article>
        </div>
      </section>

      <section className="steps-section" id="help">
        <div className="section-heading compact"><span>三步完成</span><h2>从 Word 到 PDF，就这么简单</h2></div>
        <div className="steps">
          <div><b>01</b><h3>选择文档</h3><p>拖入或选择一个 .docx 文件</p></div>
          <span className="step-line" />
          <div><b>02</b><h3>本地转换</h3><p>浏览器自动解析并生成 PDF</p></div>
          <span className="step-line" />
          <div><b>03</b><h3>立即下载</h3><p>保存 PDF 到你的设备</p></div>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">W</span><span>轻转</span></a>
        <p>让文档转换更轻松。</p>
        <span>© 2026 轻转 · 所有转换均在本地完成</span>
      </footer>

      <input ref={inputRef} className="visually-hidden" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onInput} />
      <div ref={renderRef} className="pdf-render-surface" aria-hidden="true" />
    </main>
  );
}
