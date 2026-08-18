"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("");
    if (password.length < 8) {
      setAuthMessage("密码至少需要 8 位");
      return;
    }
    setAuthBusy(true);
    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage("注册邮件已发送，请前往邮箱完成验证后再登录");
          setAuthMode("login");
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "操作失败，请稍后重试";
      const translated = text.includes("Invalid login")
        ? "邮箱或密码不正确"
        : text.includes("already registered")
          ? "这个邮箱已经注册，请直接登录"
          : text.includes("Email not confirmed")
            ? "请先打开注册邮件完成邮箱验证"
            : text;
      setAuthMessage(translated);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    reset();
  };

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

  if (authLoading) {
    return (
      <main className="auth-shell loading-shell">
        <a className="brand auth-brand" href="#"><span className="brand-mark">W</span><span>轻转</span></a>
        <div className="auth-loader" aria-label="正在检查登录状态" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <nav className="auth-nav">
          <a className="brand" href="#"><span className="brand-mark">W</span><span>轻转</span></a>
          <span><b>●</b> 文档仅在浏览器本地处理</span>
        </nav>
        <section className="auth-layout">
          <div className="auth-intro">
            <div className="eyebrow"><span>✦</span> 免费 · 安全 · 云端账号</div>
            <h1>登录后，轻松完成<br /><em>Word 转 PDF</em></h1>
            <p>账号由 Supabase 云端安全管理，Word 文档不会上传云端，转换始终在你的浏览器中完成。</p>
            <div className="auth-promises">
              <span><b>✓</b> 邮箱注册</span>
              <span><b>✓</b> 云端登录状态</span>
              <span><b>✓</b> 文档不离开设备</span>
            </div>
          </div>
          <div className="auth-card">
            <div className="auth-tabs" role="tablist" aria-label="登录或注册">
              <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => { setAuthMode("login"); setAuthMessage(""); }}>登录</button>
              <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => { setAuthMode("register"); setAuthMessage(""); }}>注册</button>
            </div>
            <div className="auth-card-copy">
              <h2>{authMode === "login" ? "欢迎回来" : "创建轻转账号"}</h2>
              <p>{authMode === "login" ? "登录后继续转换你的文档" : "使用邮箱和密码即可免费注册"}</p>
            </div>
            <form onSubmit={submitAuth} className="auth-form">
              <label>
                <span>邮箱地址</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required />
              </label>
              <label>
                <span>密码</span>
                <div className="password-field">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required />
                  <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隐藏" : "显示"}</button>
                </div>
              </label>
              {authMessage && <div className={`auth-message ${authMessage.includes("已发送") ? "success" : ""}`} role="status">{authMessage}</div>}
              <button className="primary-button auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? "请稍候…" : authMode === "login" ? "登录并开始转换" : "创建免费账号"}
              </button>
            </form>
            <small className="auth-note">注册即表示你同意仅将邮箱用于账号认证。我们不会上传或保存你的 Word 文档。</small>
          </div>
        </section>
      </main>
    );
  }

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
        <div className="top-actions">
          <span className="privacy-pill"><span aria-hidden="true">●</span> 文件仅在本地处理</span>
          <button className="account-button" type="button" onClick={signOut} title="退出登录">
            <span>{user.email?.slice(0, 1).toUpperCase()}</span>
            <b>{user.email}</b>
            <i>退出</i>
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span>✦</span> 免费 · 云端账号 · 不限次数</div>
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
