(() => {
  "use strict";

  // ===================== 常量 & 状态 =====================
  const SEL = {
    cancelMakeImage: '[aria-label="取消选择\u201c制作图片\u201d"]',
    sendBtn: '[aria-label="发送"]',
    sendRemix: "#send_remix",
    stopAnswer: '[aria-label="停止回答"]',
    inputBox: '[aria-label="为 Gemini 输入提示"]',
    ratioWrapper: "#remix-ratio-wrapper",
  };

  const RATIO_OPTIONS = [
    { label: "1:1（方形）", value: "1:1" },
    { label: "3:2（横版）", value: "3:2" },
    { label: "2:3（竖版）", value: "2:3" },
    { label: "4:3（横版）", value: "4:3" },
    { label: "3:4（竖版）", value: "3:4" },
    { label: "5:4（横版）", value: "5:4" },
    { label: "4:5（竖版）", value: "4:5" },
    { label: "16:9（横屏）", value: "16:9" },
    { label: "9:16（竖屏）", value: "9:16" },
    { label: "21:9（横屏）", value: "21:9" }
  ];

  let selectedRatio = RATIO_OPTIONS[0]; // 默认 1:1

  // ===================== 工具函数 =====================

  /** 查询元素，返回 Element | null */
  const $ = (sel, root = document) => root.querySelector(sel);

  /** 创建「发送重制」按钮（仅创建一次） */
  function ensureRemixButton() {
    if ($(SEL.sendRemix)) return $(SEL.sendRemix);
    const sendBtn = $(SEL.sendBtn);
    if (!sendBtn) return null;

    const btn = document.createElement("button");
    btn.id = "send_remix";
    btn.setAttribute("mat-icon-button", "");
    btn.className =
      "mdc-icon-button mat-mdc-icon-button mat-mdc-button-base send-button mat-unthemed submit";
    btn.setAttribute("aria-label", "发送重制");
    btn.style.display = "none";
    btn.innerHTML = `
      <span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
      <mat-icon role="img"
        class="mat-icon notranslate send-button-icon icon-filled gds-icon-xl google-symbols mat-ligature-font mat-icon-no-color"
        fonticon="send"></mat-icon>
      <span class="mat-focus-indicator"></span>
      <span class="mat-mdc-button-touch-target"></span>
      <span class="mat-ripple mat-mdc-button-ripple"></span>`;

    sendBtn.insertAdjacentElement("afterend", btn);

    // —— 点击事件 ——
    btn.addEventListener("click", handleRemixClick);

    return btn;
  }

  /** 创建比例下拉菜单（仅创建一次） */
  function ensureRatioDropdown() {
    if ($(SEL.ratioWrapper)) return $(SEL.ratioWrapper);
    const cancelBtn = $(SEL.cancelMakeImage);
    if (!cancelBtn) return null;

    const wrapper = document.createElement("div");
    wrapper.id = "remix-ratio-wrapper";
    wrapper.className = "remix-ratio-wrapper";

    // — 触发按钮 —
    const trigger = document.createElement("button");
    trigger.className = "remix-ratio-trigger";
    trigger.type = "button";
    trigger.innerHTML = `
      <svg class="ratio-icon" viewBox="0 0 24 24"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14z"/></svg>
      <span class="trigger-label">${selectedRatio.label}</span>
      <svg class="arrow-icon" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`;
    wrapper.appendChild(trigger);

    // — 下拉面板 —
    const dropdown = document.createElement("div");
    dropdown.className = "remix-ratio-dropdown";

    RATIO_OPTIONS.forEach((opt, idx) => {
      const item = document.createElement("button");
      item.className = "remix-ratio-option" + (idx === 0 ? " selected" : "");
      item.type = "button";
      item.dataset.value = opt.value;
      item.innerHTML = `
        <svg class="check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        <span class="option-label">${opt.label}</span>`;
      item.addEventListener("click", () => {
        selectedRatio = opt;
        dropdown
          .querySelectorAll(".remix-ratio-option")
          .forEach((el) => el.classList.remove("selected"));
        item.classList.add("selected");
        trigger.querySelector(".trigger-label").textContent = opt.label;
        wrapper.classList.remove("open");
      });
      dropdown.appendChild(item);
    });

    wrapper.appendChild(dropdown);

    // 插入到 cancelBtn 的下一个兄弟位置
    cancelBtn.insertAdjacentElement("afterend", wrapper);

    // 开关下拉
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      wrapper.classList.toggle("open");
    });

    // 点外部关闭
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove("open");
      }
    });

    return wrapper;
  }

  // ===================== 核心：向输入框写入文本 =====================

  /**
   * 向 contenteditable / ProseMirror 输入框安全写入文本。
   * 使用 execCommand + InputEvent 保证框架能感知到变化。
   */
  function insertTextIntoInput(text, position = "prepend") {
    const input = $(SEL.inputBox);
    if (!input) return;

    input.focus();

    const sel = window.getSelection();
    const range = document.createRange();

    if (position === "prepend") {
      // 光标移到最前面
      if (input.firstChild) {
        range.setStart(input, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(input);
        range.collapse(true);
      }
    } else {
      // append — 光标移到最后面
      range.selectNodeContents(input);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);

    // 使用 execCommand 插入，让框架能检测到
    document.execCommand("insertText", false, text);
  }

  /** 「发送重制」点击逻辑 */
  function handleRemixClick() {
    const input = $(SEL.inputBox);
    if (!input) return;

    // 1. 前置 prompt
    insertTextIntoInput(
      "Strictly generate images only. Run visual generation pipeline:\n",
      "prepend"
    );

    // 2. 后置 ratio / quality
    const ratioStr = selectedRatio.value;
    insertTextIntoInput(
      `\n(aspect ratio ${ratioStr}), (resolution: 4k)`,
      "append"
    );

    // 3. 触发原生发送按钮
    requestAnimationFrame(() => {
      const sendBtn = $(SEL.sendBtn);
      if (sendBtn) {
        sendBtn.style.display = "";
        sendBtn.click();
      }
    });
  }

  // ===================== 键盘拦截 =====================

  function handleKeydown(e) {
    const input = $(SEL.inputBox);
    // 只在输入框聚焦 & 「制作图片」模式下拦截
    if (!input || !input.contains(document.activeElement)) return;
    if (!$(SEL.cancelMakeImage)) return;

    if (e.key === "Enter" && !e.shiftKey) {
      // Enter → 换行
      e.preventDefault();
      e.stopImmediatePropagation();
      document.execCommand("insertLineBreak");
    } else if (e.key === "Enter" && e.shiftKey) {
      // Shift+Enter → 触发「发送重制」
      e.preventDefault();
      e.stopImmediatePropagation();
      const remixBtn = $(SEL.sendRemix);
      if (remixBtn) remixBtn.click();
    }
  }

  // 以捕获阶段拦截，确保早于页面自身监听器
  document.addEventListener("keydown", handleKeydown, true);

  // ===================== DOM 观察 =====================

  function onDomChange() {
    const cancelBtn = $(SEL.cancelMakeImage);
    const sendBtn = $(SEL.sendBtn);
    const remixBtn = ensureRemixButton();
    const stopBtn = $(SEL.stopAnswer);

    const imageMode = !!cancelBtn; // 「制作图片」模式

    // —— 规则 1 & 4：制作图片模式 ——
    if (imageMode && sendBtn && remixBtn) {
      sendBtn.style.display = "none";
      remixBtn.style.display = "block";
    }

    // —— 制作图片模式关闭 ——
    if (!imageMode && sendBtn && remixBtn) {
      sendBtn.style.display = "";
      remixBtn.style.display = "none";
    }

    // —— 规则 2：比例菜单 ——
    if (imageMode) {
      ensureRatioDropdown();
    } else {
      // 移除菜单（如果存在）
      const rw = $(SEL.ratioWrapper);
      if (rw) rw.remove();
    }

    // —— 规则 3：停止回答按钮可见时 ——
    if (stopBtn && remixBtn) {
      stopBtn.style.display = "";
      remixBtn.style.display = "none";
    }
  }

  // 使用 MutationObserver 高效监听
  const observer = new MutationObserver(() => {
    // 用 rAF 合并同一帧内的多次突变
    if (!observer._raf) {
      observer._raf = requestAnimationFrame(() => {
        observer._raf = null;
        onDomChange();
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "aria-label", "class"],
  });

  // 首次运行
  onDomChange();
})();