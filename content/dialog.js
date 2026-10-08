/* global window, document */
"use strict";

window.addEventListener("load", () => {
  const args = window.arguments[0];
  const data = args.wrappedJSObject || args;
  const $ = id => document.getElementById(id);
  let busy = false;
  let finished = false;
  $("selection-summary").textContent = `已选中 ${data.total} 个条目，其中 ${data.eligibleCount} 篇文献可编辑。`;
  for (const field of data.fields) {
    const option = document.createElementNS("http://www.w3.org/1999/xhtml", "option");
    option.value = field.name;
    option.textContent = `${field.label}（${field.count} 篇）`;
    $("field").appendChild(option);
  }
  $("field").value = data.fields.some(field => field.name === data.initialField)
    ? data.initialField : data.fields[0].name;

  function refresh() {
    const field = data.fields.find(field => field.name === $("field").value);
    const skipped = data.total - field.count;
    const positionLabel = $("position").value === "start" ? "开头" : "末尾";
    $("field-hint").textContent = `将添加到 ${field.count} 篇文献的“${field.label}”字段${positionLabel}。`
      + (skipped ? `其余 ${skipped} 个条目将跳过。` : "");
    $("content").placeholder = `输入要添加到所选文献字段${positionLabel}的内容…`;
    const hasText = !!$("content").value.trim();
    $("apply").disabled = busy || finished || !hasText;
    $("preview-title").textContent = "";
    $("preview").textContent = "输入内容后显示追加结果。";
    if (hasText) {
      try {
        const preview = data.preview(field.name, $("content").value, $("separator").value, $("position").value);
        if (preview) {
          $("preview-title").textContent = preview.title;
          $("preview").textContent = preview.newValue;
        }
      } catch (error) {
        $("status").textContent = error.message;
      }
    }
  }

  for (const id of ["field", "content", "separator", "position"]) {
    $(id).addEventListener(id === "content" ? "input" : "change", () => {
      $("status").textContent = "";
      refresh();
    });
  }
  $("cancel").addEventListener("click", () => { if (!busy) window.close(); });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !busy) window.close();
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !$("apply").disabled) {
      event.preventDefault();
      $("apply").click();
    }
  });
  window.addEventListener("close", event => { if (busy) event.preventDefault(); });

  $("apply").addEventListener("click", async () => {
    if (busy || finished || !$("content").value.trim()) return;
    busy = true;
    for (const id of ["field", "content", "separator", "position", "cancel", "apply"]) $(id).disabled = true;
    $("status").className = "";
    $("status").textContent = "正在追加信息…";
    try {
      const result = await data.apply($("field").value, $("content").value, $("separator").value, $("position").value);
      finished = true;
      const skipped = result.unsupported + result.unavailable + result.unchanged;
      $("status").textContent = `已向 ${result.updated} 篇文献追加信息。`
        + (skipped ? `跳过 ${skipped} 个条目（字段不适用、不可编辑或内容未变化）。` : "")
        + (result.updated ? "可在 Zotero 的“编辑 → 撤销”中恢复。" : "");
      $("status").className = "success";
      $("cancel").textContent = "关闭";
      $("apply").textContent = "已完成";
    } catch (error) {
      $("status").textContent = "添加失败，本批次未保存。" + error.message;
      $("status").className = "error";
      for (const id of ["field", "content", "separator", "position", "apply"]) $(id).disabled = false;
    } finally {
      busy = false;
      $("cancel").disabled = false;
    }
  });
  refresh();
  $("content").focus();
});
