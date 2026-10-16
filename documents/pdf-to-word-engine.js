/* ToolVault local PDF-to-Word engine.
 * Converts inside the user's browser: the PDF is not uploaded to a conversion API.
 * Uses PDF.js for PDF parsing/rendering and docx.js for DOCX generation.
 * Editable output is heuristic reconstruction; it is not pixel-perfect.
 */
(function () {
  "use strict";

  const MAX_FILE_BYTES = 60 * 1024 * 1024;
  const MAX_PAGES = 150;
  const OCR_SCRIPT_LOCAL = "/documents/vendor/tesseract.min.js";
  const OCR_SCRIPT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const TESSERACT_WORKER_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js";
  const TESSERACT_CORE_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1";
  const TESSERACT_LANG_CDN = "https://tessdata.projectnaptha.com/4.0.0";
  let ocrScriptPromise = null;

  function localAssetCacheActive() {
    return Boolean(window.ToolVaultLocalAssetsReady);
  }

  function report(onProgress, percent, label, hint) {
    if (typeof onProgress === "function") {
      onProgress({
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        label: label || "Working…",
        hint: hint || ""
      });
    }
  }

  function pageMetrics(page) {
    const view = page.view || [0, 0, 612, 792];
    return {
      x0: view[0],
      y0: view[1],
      x1: view[2],
      y1: view[3],
      width: Math.max(1, view[2] - view[0]),
      height: Math.max(1, view[3] - view[1])
    };
  }

  function clampFontSize(size) {
    return Math.max(6, Math.min(72, Number.isFinite(size) ? size : 11));
  }

  function normalizeItems(items, metrics) {
    const normalized = [];
    for (const item of items || []) {
      if (!item || typeof item.str !== "string" || !item.str.trim()) continue;
      const transform = item.transform || [10, 0, 0, 10, 0, 0];
      const fontSize = clampFontSize(Math.hypot(transform[0] || 0, transform[1] || 0) || item.height || 11);
      const x = (transform[4] || 0) - metrics.x0;
      const baseline = metrics.y1 - (transform[5] || 0);
      const width = Math.max(0, Number(item.width) || item.str.length * fontSize * 0.45);
      normalized.push({
        str: item.str,
        x: Math.max(0, x),
        width: width,
        baseline: baseline,
        top: Math.max(0, baseline - fontSize * 0.86),
        height: Math.max(fontSize, Number(item.height) || fontSize),
        fontSize: fontSize,
        fontName: item.fontName || "",
        hasEOL: Boolean(item.hasEOL)
      });
    }
    return normalized;
  }

  function groupTextLines(items, metrics) {
    const normalized = normalizeItems(items, metrics);
    normalized.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
    const lines = [];

    for (const item of normalized) {
      let target = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const tolerance = Math.max(2.2, Math.min(5.5, (line.fontSize + item.fontSize) * 0.22));
        if (item.baseline - line.baseline > tolerance * 1.5) break;
        if (Math.abs(item.baseline - line.baseline) <= tolerance) {
          target = line;
          break;
        }
      }
      if (!target) {
        target = {
          baseline: item.baseline,
          top: item.top,
          height: item.height,
          fontSize: item.fontSize,
          items: []
        };
        lines.push(target);
      }
      target.items.push(item);
      target.baseline = target.items.reduce((sum, part) => sum + part.baseline, 0) / target.items.length;
      target.top = Math.min(target.top, item.top);
      target.height = Math.max(target.height, item.height);
      target.fontSize = target.items.reduce((sum, part) => sum + part.fontSize, 0) / target.items.length;
    }

    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.left = line.items.length ? line.items[0].x : 0;
      line.text = "";
      let previous = null;
      for (const part of line.items) {
        if (previous) {
          const gap = part.x - (previous.x + previous.width);
          if (gap > Math.max(9, line.fontSize * 1.7)) line.text += "\t";
          else if (gap > Math.max(1.2, line.fontSize * 0.18)) line.text += " ";
        }
        line.text += part.str;
        previous = part;
      }
    }

    lines.sort((a, b) => a.top - b.top || a.left - b.left);
    return lines;
  }

  function styleFromFontName(fontName) {
    const value = String(fontName || "").toLowerCase();
    return {
      bold: /bold|black|heavy|semibold|demi/.test(value),
      italics: /italic|oblique/.test(value)
    };
  }

  function splitLineIntoCells(line) {
    const items = line && Array.isArray(line.items) ? line.items.slice().sort((a, b) => a.x - b.x) : [];
    if (items.length < 2) return null;

    const cells = [];
    let current = [];
    let previous = null;
    const splitGap = Math.max(32, clampFontSize(line.fontSize) * 3.1);

    for (const item of items) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > splitGap && current.length) {
        cells.push({ items: current });
        current = [];
      }
      current.push(item);
      previous = item;
    }
    if (current.length) cells.push({ items: current });
    if (cells.length < 2) return null;

    for (const cell of cells) {
      cell.x = cell.items[0].x;
      cell.text = "";
      let last = null;
      for (const part of cell.items) {
        if (last) {
          const gap = part.x - (last.x + last.width);
          if (gap > Math.max(1.2, clampFontSize(line.fontSize) * 0.18)) cell.text += " ";
        }
        cell.text += part.str;
        last = part;
      }
    }
    return cells;
  }

  function detectTableAt(lines, startIndex, pageWidth) {
    const firstLine = lines[startIndex];
    const firstCells = splitLineIntoCells(firstLine);
    if (!firstCells || firstCells.length < 2) return null;

    const columnCount = firstCells.length;
    const rows = [{ line: firstLine, cells: firstCells }];
    const starts = firstCells.map(cell => cell.x);
    const alignmentTolerance = Math.max(12, pageWidth * 0.025);
    let previous = firstLine;

    for (let index = startIndex + 1; index < lines.length; index++) {
      const line = lines[index];
      const rowGap = line.top - (previous.top + previous.height);
      if (rowGap > Math.max(42, clampFontSize(previous.fontSize) * 4.2)) break;

      const cells = splitLineIntoCells(line);
      if (!cells || cells.length !== columnCount) break;
      let aligned = true;
      for (let column = 0; column < columnCount; column++) {
        if (Math.abs(cells[column].x - starts[column]) > alignmentTolerance) {
          aligned = false;
          break;
        }
      }
      if (!aligned) break;

      rows.push({ line, cells });
      previous = line;
    }

    // Only treat a clear multi-row pattern as a table. This reduces accidental
    // conversion of isolated large gaps into table cells.
    if (rows.length < 3) return null;

    // Two long text blocks aligned side by side are more likely to be a
    // multi-column article than a data table. Keep them as text paragraphs.
    if (columnCount === 2) {
      const everyCellLooksLikeLongBodyText = rows.every(row =>
        row.cells.every(cell => cell.text.replace(/\s/g, "").length >= 28)
      );
      if (everyCellLooksLikeLongBodyText) return null;
    }

    return { rows, endIndex: startIndex + rows.length };
  }

  function createCellParagraph(cell, docx, fallbackFontSize) {
    const children = [];
    let previous = null;
    for (const part of cell.items) {
      if (previous) {
        const gap = part.x - (previous.x + previous.width);
        if (gap > Math.max(1.2, clampFontSize(fallbackFontSize) * 0.18)) {
          children.push(new docx.TextRun({ text: " " }));
        }
      }
      const fontStyle = styleFromFontName(part.fontName);
      children.push(new docx.TextRun({
        text: part.str,
        size: Math.round(clampFontSize(part.fontSize || fallbackFontSize) * 2),
        bold: fontStyle.bold,
        italics: fontStyle.italics
      }));
      previous = part;
    }
    return new docx.Paragraph({
      children: children.length ? children : [new docx.TextRun({ text: cell.text || "" })],
      spacing: { before: 0, after: 0 }
    });
  }

  function createTable(rows, pageWidth, docx) {
    const columnCount = rows[0].cells.length;
    const columnStarts = [];
    for (let column = 0; column < columnCount; column++) {
      columnStarts.push(rows.reduce((sum, row) => sum + row.cells[column].x, 0) / rows.length);
    }

    const leftPoints = Math.max(0, Math.min(pageWidth - 30, columnStarts[0]));
    const widthsPoints = [];
    for (let column = 0; column < columnCount - 1; column++) {
      widthsPoints.push(Math.max(18, columnStarts[column + 1] - columnStarts[column]));
    }
    widthsPoints.push(Math.max(18, pageWidth - columnStarts[columnCount - 1]));

    // Keep the grid and preferred table width internally consistent.
    const widths = widthsPoints.map(width => Math.max(360, Math.round(width * 20)));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const widthType = docx.WidthType ? docx.WidthType.DXA : "dxa";
    const edge = { style: docx.BorderStyle ? docx.BorderStyle.SINGLE : "single", size: 2, color: "D7E2DE", space: 0 };

    const tableRows = rows.map(row => new docx.TableRow({
      children: row.cells.map((cell, column) => new docx.TableCell({
        children: [createCellParagraph(cell, docx, row.line.fontSize)],
        width: { size: widths[column], type: widthType },
        margins: { top: 25, bottom: 25, left: 45, right: 45 }
      }))
    }));

    return new docx.Table({
      rows: tableRows,
      width: { size: totalWidth, type: widthType },
      columnWidths: widths,
      indent: { size: Math.round(leftPoints * 20), type: widthType },
      layout: docx.TableLayoutType ? docx.TableLayoutType.FIXED : undefined,
      borders: {
        top: edge, bottom: edge, left: edge, right: edge,
        insideHorizontal: edge, insideVertical: edge
      }
    });
  }

  function createEditableChildren(lines, metrics, docx) {
    const children = [];
    let previousLine = null;
    let index = 0;
    while (index < lines.length) {
      const table = detectTableAt(lines, index, metrics.width);
      if (table) {
        children.push(createTable(table.rows, metrics.width, docx));
        previousLine = table.rows[table.rows.length - 1].line;
        index = table.endIndex;
        continue;
      }

      const line = lines[index];
      children.push(createLineParagraph(line, previousLine, docx, metrics.height, false));
      previousLine = line;
      index++;
    }
    return children;
  }

  function createLineParagraph(line, previousLine, docx, pageHeight, isOcr) {
    const runs = [];
    if (isOcr || !line.items || !line.items.length) {
      if (line.text) {
        runs.push(new docx.TextRun({
          text: line.text,
          size: Math.round(clampFontSize(line.fontSize) * 2)
        }));
      }
    } else {
      let previous = null;
      for (const part of line.items) {
        if (previous) {
          const gap = part.x - (previous.x + previous.width);
          if (gap > Math.max(9, line.fontSize * 1.7)) {
            runs.push(new docx.TextRun({ text: "\t" }));
          } else if (gap > Math.max(1.2, line.fontSize * 0.18)) {
            runs.push(new docx.TextRun({ text: " " }));
          }
        }
        const fontStyle = styleFromFontName(part.fontName);
        runs.push(new docx.TextRun({
          text: part.str,
          size: Math.round(clampFontSize(part.fontSize) * 2),
          bold: fontStyle.bold,
          italics: fontStyle.italics
        }));
        previous = part;
      }
    }

    const fontSize = clampFontSize(line.fontSize);
    const priorBottom = previousLine ? previousLine.top + previousLine.height : 0;
    const rawGap = previousLine ? line.top - priorBottom : line.top;
    const before = Math.round(Math.max(0, Math.min(pageHeight * 0.4, rawGap)) * 20);
    const leftIndent = Math.round(Math.max(0, Math.min(pageHeight * 1.5, line.left || 0)) * 20);

    return new docx.Paragraph({
      children: runs.length ? runs : [new docx.TextRun({ text: "" })],
      indent: { left: leftIndent },
      spacing: { before: before, after: 0 }
    });
  }

  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (!ocrScriptPromise) {
      ocrScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-toolvault-tesseract="true"]');
        if (existing) {
          existing.addEventListener("load", () => resolve(window.Tesseract), { once: true });
          existing.addEventListener("error", () => reject(new Error("Could not load the browser OCR library.")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = localAssetCacheActive() ? OCR_SCRIPT_LOCAL : OCR_SCRIPT_CDN;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.dataset.toolvaultTesseract = "true";
        script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("The OCR library loaded, but its API was not available."));
        script.onerror = () => { script.remove(); ocrScriptPromise = null; reject(new Error("Could not load the browser OCR library. Check your connection and try again.")); };
        document.head.appendChild(script);
      });
    }
    return ocrScriptPromise;
  }

  async function runOcr(page, metrics, worker, onProgress, pageNumber, totalPages) {
    const viewport = page.getViewport({ scale: 1.45 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser could not create a canvas for OCR.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport, background: "#ffffff" }).promise;
    report(onProgress, 15 + ((pageNumber - 1) / totalPages) * 70, "Recognizing scanned text…", "Reading page " + pageNumber + " of " + totalPages + " in your browser.");
    const result = await worker.recognize(canvas);
    canvas.width = 1;
    canvas.height = 1;

    const scaleX = metrics.width / viewport.width;
    const scaleY = metrics.height / viewport.height;
    const lines = (result && result.data && result.data.lines ? result.data.lines : [])
      .filter((line) => line && String(line.text || "").trim())
      .map((line) => {
        const box = line.bbox || { x0: 0, y0: 0, y1: 14 };
        const fontSize = clampFontSize(((box.y1 - box.y0) * scaleY) * 0.86);
        return {
          text: String(line.text).trim(),
          left: Math.max(0, box.x0 * scaleX),
          top: Math.max(0, box.y0 * scaleY),
          height: Math.max(fontSize, (box.y1 - box.y0) * scaleY),
          fontSize: fontSize,
          items: []
        };
      })
      .sort((a, b) => a.top - b.top || a.left - b.left);
    return lines;
  }

  async function convert(options) {
    const file = options && options.file;
    const mode = options && options.mode || "editable";
    const useOcr = Boolean(options && options.useOcr);
    const onProgress = options && options.onProgress;
    const pdfjsLib = window.pdfjsLib;
    const docx = window.docx;

    if (!file) throw new Error("Choose a PDF file first.");
    if (file.size > MAX_FILE_BYTES) throw new Error("This browser engine supports PDFs up to 60 MB. Try splitting a larger file into smaller PDFs.");
    if (!pdfjsLib || !docx) throw new Error("The local PDF libraries did not load. Reload the page and try again.");
    if (typeof file.name === "string" && !file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      throw new Error("Please select a PDF file.");
    }

    report(onProgress, 2, "Opening PDF…", "The file stays in your browser; it is not uploaded to a conversion server.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = localAssetCacheActive()
      ? "/documents/vendor/pdf.worker.min.js"
      : "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (_) {
      throw new Error("The PDF could not be opened. It may be damaged, encrypted, or unsupported.");
    }

    if (!pdf.numPages) {
      await pdf.destroy();
      throw new Error("No pages were found in this PDF.");
    }
    if (pdf.numPages > MAX_PAGES) {
      await pdf.destroy();
      throw new Error("This browser engine supports up to 150 pages per PDF. Split a larger file and convert it in parts.");
    }

    const sections = [];
    let ocrWorker = null;
    let pagesWithText = 0;
    let pagesOcr = 0;
    let outputCharCount = 0;

    try {
      if (mode === "visual") {
        for (let index = 1; index <= pdf.numPages; index++) {
          report(onProgress, (index - 1) / pdf.numPages * 90 + 5, "Preserving original page layout…", "Rendering page " + index + " of " + pdf.numPages + ".");
          const page = await pdf.getPage(index);
          const metrics = pageMetrics(page);
          const baseViewport = page.getViewport({ scale: 1 });
          const renderViewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser could not render PDF pages.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport: renderViewport, background: "#ffffff" }).promise;
          const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not render page " + index + ".")), "image/png"));
          const bytes = new Uint8Array(await blob.arrayBuffer());
          sections.push({
            properties: {
              page: {
                size: { width: Math.round(metrics.width * 20), height: Math.round(metrics.height * 20) },
                margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
              }
            },
            children: [
              new docx.Paragraph({
                children: [
                  new docx.ImageRun({
                    data: bytes,
                    type: "png",
                    transformation: { width: baseViewport.width, height: baseViewport.height }
                  })
                ],
                spacing: { before: 0, after: 0 }
              })
            ]
          });
          canvas.width = 1;
          canvas.height = 1;
          page.cleanup();
        }
      } else {
        if (useOcr) {
          const Tesseract = await loadTesseract();
          ocrWorker = await Tesseract.createWorker("eng", 1, {
            workerPath: localAssetCacheActive()
              ? "/documents/vendor/tesseract.worker.min.js"
              : TESSERACT_WORKER_CDN,
            corePath: localAssetCacheActive()
              ? "/documents/vendor/tesseract-core"
              : TESSERACT_CORE_CDN,
            langPath: localAssetCacheActive()
              ? "/documents/vendor/lang"
              : TESSERACT_LANG_CDN,
            workerBlobURL: localAssetCacheActive() ? false : true,
            logger: (event) => {
              if (event && event.status === "recognizing text") {
                report(onProgress, 10, "Starting browser OCR…", "Recognizing scanned English text. First-time OCR may download language data.");
              }
            }
          });
          await ocrWorker.setParameters({ preserve_interword_spaces: "1" });
        }

        for (let index = 1; index <= pdf.numPages; index++) {
          report(onProgress, 5 + ((index - 1) / pdf.numPages) * 85, "Rebuilding editable content…", "Analyzing page " + index + " of " + pdf.numPages + ".");
          const page = await pdf.getPage(index);
          const metrics = pageMetrics(page);
          const content = await page.getTextContent();
          let lines = groupTextLines(content.items, metrics);
          const pageChars = lines.reduce((sum, line) => sum + line.text.replace(/\s/g, "").length, 0);
          const needsOcr = lines.length === 0 || pageChars < 8;

          if (needsOcr && useOcr) {
            report(onProgress, 8 + ((index - 1) / pdf.numPages) * 82, "Recognizing scanned text…", "Using the English OCR model on page " + index + ". This can take longer.");
            lines = await runOcr(page, metrics, ocrWorker, onProgress, index, pdf.numPages);
            if (lines.length) pagesOcr += 1;
          }

          if (lines.length) {
            pagesWithText += 1;
            outputCharCount += lines.reduce((sum, line) => sum + line.text.length, 0);
          } else {
            lines = [{
              text: "[No selectable text detected on this page. Enable browser OCR and retry if this is a scanned page.]",
              left: 18,
              top: 24,
              height: 12,
              fontSize: 10,
              items: []
            }];
          }

          const children = useOcr && lines.some(line => !line.items || !line.items.length)
            ? lines.map((line, lineIndex) => createLineParagraph(line, lineIndex ? lines[lineIndex - 1] : null, docx, metrics.height, !line.items || !line.items.length))
            : createEditableChildren(lines, metrics, docx);

          sections.push({
            properties: {
              page: {
                size: { width: Math.round(metrics.width * 20), height: Math.round(metrics.height * 20) },
                margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
              }
            },
            children: children
          });
          page.cleanup();
        }
      }

      if (!sections.length) throw new Error("No pages could be converted.");
      if (mode !== "visual" && outputCharCount === 0) {
        if (!useOcr) throw new Error("This PDF appears to contain scanned images rather than selectable text. Enable the optional browser OCR checkbox and try again.");
        throw new Error("The OCR engine could not recognize usable text in this PDF. Try a clearer scan or a selectable-text PDF.");
      }

      report(onProgress, 94, "Building Word document…", "Packaging the converted pages into an editable DOCX.");
      const document = new docx.Document({ sections: sections });
      const blob = await docx.Packer.toBlob(document);
      if (!blob || !blob.size) throw new Error("The local engine did not produce a valid Word file.");

      report(onProgress, 100, "Conversion complete", mode === "visual"
        ? "The Word file keeps the page appearance using images; the page text is not individually editable."
        : "The Word file was generated in your browser. Review spacing, tables, columns, and scanned text before relying on the result.");

      return {
        blob: blob,
        pages: pdf.numPages,
        mode: mode,
        pagesWithText: pagesWithText,
        pagesOcr: pagesOcr,
        characters: outputCharCount
      };
    } finally {
      if (ocrWorker) {
        try { await ocrWorker.terminate(); } catch (_) {}
      }
      try { await pdf.destroy(); } catch (_) {}
    }
  }

  window.ToolVaultPdfWordEngine = {
    convert: convert,
    maxFileBytes: MAX_FILE_BYTES,
    maxPages: MAX_PAGES,
    version: "2.0.0-local"
  };
})();