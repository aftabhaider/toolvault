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
    const items = line && Array.isArray(line.items)
      ? line.items.slice().sort((a, b) => a.x - b.x)
      : [];
    if (!items.length) return [];

    const cells = [];
    let current = [];
    let previous = null;
    // PDF table columns are often separated by less than 32pt. A smaller
    // threshold helps keep adjacent columns separate without splitting words.
    const splitGap = Math.max(18, clampFontSize(line.fontSize) * 2.0);

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

    for (const cell of cells) {
      cell.x = cell.items[0].x;
      cell.end = Math.max(...cell.items.map(part => part.x + part.width));
      cell.center = (cell.x + cell.end) / 2;
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
    // Treat nearby text lines as one layout region. This permits wrapped
    // headers, wrapped descriptions and blank cells within tables.
    const region = [];
    let previous = null;
    for (let index = startIndex; index < lines.length; index++) {
      const line = lines[index];
      if (previous && line.top - previous.top > 30) break;
      region.push({ line, cells: splitLineIntoCells(line) });
      previous = line;
    }

    if (region.length < 2) return null;

    // Build visual rows first. A table header is often spread across multiple
    // baselines (for example, "Total" on one line and "Amount" below it).
    const rowGroups = [];
    for (const entry of region) {
      const current = rowGroups[rowGroups.length - 1];
      if (current && entry.line.top - current[current.length - 1].line.top <= 13) {
        current.push(entry);
      } else {
        rowGroups.push([entry]);
      }
    }

    const multiCellLines = region.filter(entry => entry.cells.length >= 2).length;
    const maxLineColumns = Math.max(0, ...region.map(entry => entry.cells.length));
    if (multiCellLines < 2) return null;

    // Short two-column forms are valid tables, but a longer text block whose
    // inferred anchors drift across the page should remain ordinary paragraphs.
    if (maxLineColumns < 3 && region.length > 3) return null;

    // Choose the visual row with the most text fragments as the column
    // reference; merge fragments on the same horizontal column across wrapped
    // header baselines to recover columns even when no one baseline has them all.
    const anchorGroup = rowGroups.reduce((best, group) => {
      const score = group.reduce((sum, entry) => sum + entry.cells.length, 0);
      const bestScore = best.reduce((sum, entry) => sum + entry.cells.length, 0);
      return score > bestScore ? group : best;
    }, rowGroups[0]);
    const anchorPool = anchorGroup.flatMap(entry => entry.cells)
      .sort((a, b) => a.center - b.center);
    const clusters = [];
    for (const cell of anchorPool) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const cluster of clusters) {
        const distance = Math.abs(cluster.center - cell.center);
        if (distance < nearestDistance) {
          nearest = cluster;
          nearestDistance = distance;
        }
      }
      if (nearest && nearestDistance <= 24) {
        nearest.count += 1;
        nearest.center += (cell.center - nearest.center) / nearest.count;
        nearest.start += (cell.x - nearest.start) / nearest.count;
      } else {
        clusters.push({ center: cell.center, start: cell.x, count: 1 });
      }
    }
    clusters.sort((a, b) => a.center - b.center);
    const columnCenters = clusters.map(cluster => cluster.center);
    const columnStarts = clusters.map(cluster => cluster.start);
    const columnCount = columnCenters.length;
    if (columnCount < 2 || columnCount > 12) return null;

    const rows = rowGroups.map(group => {
      const fragments = group.flatMap(entry => entry.cells.map(cell => ({
        ...cell,
        fontSize: entry.line.fontSize,
        lineTop: entry.line.top
      })));
      const isMerged = fragments.length > 0 && group.every(entry => entry.cells.length <= 1);
      const cells = Array.from({ length: columnCount }, () => ({ fragments: [], text: "" }));

      if (isMerged) {
        const firstFragment = fragments[0];
        const centered = Boolean(firstFragment && firstFragment.x > pageWidth * 0.28);
        cells[0].fragments = fragments.map(fragment => ({ ...fragment, centered }));
        cells[0].text = fragments.map(cell => cell.text).join(" ").trim();
      } else {
        for (const entry of group) {
          for (const cell of entry.cells) {
            const column = columnCenters.reduce((bestIndex, center, index) =>
              Math.abs(cell.center - center) < Math.abs(cell.center - columnCenters[bestIndex])
                ? index
                : bestIndex
            , 0);
            cells[column].fragments.push(cell);
            cells[column].text = [cells[column].text, cell.text].filter(Boolean).join(" ").trim();
          }
        }
      }

      const rowText = cells.map(cell => cell.text).join(" ").toLowerCase();
      const isHeader = /description/.test(rowText) && /code/.test(rowText);
      const firstFragment = fragments[0];
      return {
        cells,
        merged: isMerged,
        centered: Boolean(isMerged && firstFragment && firstFragment.x > pageWidth * 0.28),
        isHeader,
        line: {
          fontSize: group.reduce((sum, entry) => sum + entry.line.fontSize, 0) / group.length,
          top: group[0].line.top,
          height: Math.max(...group.map(entry => entry.line.height || entry.line.fontSize || 10))
        }
      };
    }).filter(row => row.cells.some(cell => cell.fragments.length));

    if (rows.length < 2) return null;
    const allXs = region.flatMap(entry => (entry.line.items || []).map(item => item.x)).filter(Number.isFinite);
    if (!allXs.length) return null;
    const leftPoints = Math.max(0, Math.min(pageWidth - 30, Math.min(...allXs)));

    return {
      rows,
      endIndex: startIndex + region.length,
      columnCount,
      columnStarts,
      columnCenters,
      leftPoints,
      lastLine: region[region.length - 1].line
    };
  }

    function createCellParagraph(cell, docx, fallbackFontSize) {
    const children = [];
    let previous = null;
    for (const part of cell.items || []) {
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
      alignment: cell.centered && docx.AlignmentType ? docx.AlignmentType.CENTER : undefined,
      spacing: { before: 0, after: 0 }
    });
  }

  function createTable(rows, pageWidth, docx, tableInfo) {
    const columnCount = tableInfo.columnCount;
    const leftPoints = tableInfo.leftPoints;
    const availableWidth = Math.max(120, pageWidth - leftPoints - 20);
    const starts = tableInfo.columnStarts;
    let widthsPoints = [];

    if (columnCount === 2) {
      const firstWidth = Math.max(60, Math.min(availableWidth - 40, starts[1] - leftPoints - 5));
      widthsPoints = [firstWidth, availableWidth - firstWidth];
    } else if (columnCount >= 4) {
      // The first column is usually a wide description column; the remaining
      // columns are typically near-uniform numeric/code fields.
      const firstWidth = Math.max(180, Math.min(availableWidth * 0.6, starts[1] - leftPoints - 22));
      const remaining = availableWidth - firstWidth;
      const otherWidth = remaining / (columnCount - 1);
      widthsPoints = [firstWidth, ...Array(columnCount - 1).fill(otherWidth)];
    } else {
      for (let column = 0; column < columnCount - 1; column++) {
        widthsPoints.push(Math.max(30, starts[column + 1] - starts[column] - (column === 0 ? 14 : 0)));
      }
      widthsPoints.push(Math.max(30, availableWidth - widthsPoints.reduce((sum, width) => sum + width, 0)));
      const sum = widthsPoints.reduce((total, width) => total + width, 0);
      widthsPoints = widthsPoints.map(width => width * availableWidth / sum);
    }

    const widths = widthsPoints.map(width => Math.max(360, Math.round(width * 20)));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const widthType = docx.WidthType ? docx.WidthType.DXA : "dxa";
    const edge = { style: docx.BorderStyle ? docx.BorderStyle.SINGLE : "single", size: 2, color: "D7E2DE", space: 0 };

    const makeCellParagraphs = (cell, fallbackFontSize) => {
      const fragments = cell && cell.fragments ? cell.fragments : [];
      if (!fragments.length) {
        return [new docx.Paragraph({
          children: [new docx.TextRun({ text: "" })],
          spacing: { before: 0, after: 0 }
        })];
      }
      return fragments.map(fragment => createCellParagraph(fragment, docx, fallbackFontSize));
    };

    const tableRows = rows.map(row => {
      if (row.merged) {
        const cell = row.cells[0];
        return new docx.TableRow({
          children: [new docx.TableCell({
            columnSpan: columnCount,
            children: makeCellParagraphs(cell, row.line.fontSize),
            width: { size: totalWidth, type: widthType },
            shading: { fill: "EAF2F8" },
            margins: { top: 25, bottom: 25, left: 45, right: 45 }
          })]
        });
      }

      return new docx.TableRow({
        children: row.cells.map((cell, column) => new docx.TableCell({
          children: makeCellParagraphs(cell, row.line.fontSize),
          width: { size: widths[column], type: widthType },
          shading: row.isHeader ? { fill: "EAF2F8" } : undefined,
          margins: { top: 25, bottom: 25, left: 45, right: 45 }
        }))
      });
    });

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
        children.push(createTable(table.rows, metrics.width, docx, table));
        previousLine = table.lastLine;
        index = table.endIndex;
        continue;
      }

      const line = lines[index];
      children.push(createLineParagraph(line, previousLine, docx, metrics.width, metrics.height, false));
      previousLine = line;
      index++;
    }
    return children;
  }

    function createLineParagraph(line, previousLine, docx, pageWidth, pageHeight, isOcr) {
    const runs = [];
    const tabStops = [];
    const items = line.items && line.items.length ? line.items : [];
    if (isOcr || !items.length) {
      if (line.text) {
        runs.push(new docx.TextRun({
          text: line.text,
          size: Math.round(clampFontSize(line.fontSize) * 2)
        }));
      }
    } else {
      let previous = null;
      for (const part of items) {
        if (previous) {
          const gap = part.x - (previous.x + previous.width);
          if (gap > Math.max(9, line.fontSize * 1.7)) {
            runs.push(new docx.TextRun({ text: "\t" }));
            tabStops.push({
              type: docx.TabStopType ? docx.TabStopType.LEFT : "left",
              position: Math.max(20, Math.round(part.x * 20))
            });
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
    const leftX = items.length ? Math.min(...items.map(item => item.x)) : Math.max(0, line.left || 0);
    const rightX = items.length
      ? Math.max(...items.map(item => item.x + item.width))
      : leftX + String(line.text || "").length * fontSize * 0.45;
    const lineCenter = (leftX + rightX) / 2;

    // Infer alignment from the original text box instead of assuming every
    // PDF line is left-aligned. Centered titles and right-hand form fields are
    // common in official returns and other pre-printed forms.
    const centered = items.length > 0 &&
      leftX > pageWidth * 0.08 &&
      rightX < pageWidth * 0.92 &&
      Math.abs(lineCenter - pageWidth / 2) <= Math.max(14, fontSize * 1.6);
    const rightAligned = !centered &&
      leftX > pageWidth * 0.48 &&
      rightX > pageWidth * 0.78;

    const priorBottom = previousLine ? previousLine.top + previousLine.height : 0;
    const rawGap = previousLine ? line.top - priorBottom : line.top;
    const before = Math.round(Math.max(0, Math.min(pageHeight * 0.4, rawGap)) * 20);
    const leftIndent = centered || rightAligned
      ? 0
      : Math.round(Math.max(0, Math.min(pageWidth * 0.95, leftX)) * 20);
    const rightIndent = rightAligned
      ? Math.round(Math.max(0, Math.min(pageWidth * 0.5, pageWidth - rightX)) * 20)
      : 0;

    return new docx.Paragraph({
      children: runs.length ? runs : [new docx.TextRun({ text: "" })],
      alignment: centered && docx.AlignmentType
        ? docx.AlignmentType.CENTER
        : rightAligned && docx.AlignmentType
          ? docx.AlignmentType.RIGHT
          : undefined,
      indent: { left: leftIndent, right: rightIndent },
      tabStops: tabStops.length ? tabStops : undefined,
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

  const HEADER_BAND_POINTS = 108;
  const FOOTER_BAND_POINTS = 73;

  function detectRasterGrid(canvas, metrics, scale) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { verticals: [], horizontals: [] };
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const width = canvas.width;
    const height = canvas.height;
    const yMin = Math.max(0, Math.round((HEADER_BAND_POINTS - 12) * scale));
    const yMax = Math.min(height, Math.round((metrics.height - FOOTER_BAND_POINTS) * scale));
    const xMin = Math.max(0, Math.round(8 * scale));
    const xMax = Math.min(width, Math.round((metrics.width - 8) * scale));
    const darkAt = (x, y) => {
      const offset = (y * width + x) * 4;
      return data[offset] < 135 && data[offset + 1] < 135 && data[offset + 2] < 135;
    };

    // Long horizontal strokes are table rules, while ordinary text contains
    // shorter separated runs. Scan by row and keep only page-spanning rules.
    const horizontalRows = [];
    const minimumHorizontalRun = Math.round(width * 0.52);
    for (let y = yMin; y < yMax; y++) {
      let run = 0;
      let best = 0;
      let bestStart = 0;
      for (let x = xMin; x < xMax; x++) {
        if (darkAt(x, y)) {
          if (run === 0) bestStart = x;
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      if (best >= minimumHorizontalRun) {
        horizontalRows.push({
          y: y / scale,
          x0: bestStart / scale,
          x1: Math.min(xMax, bestStart + best) / scale
        });
      }
    }

    const horizontals = [];
    for (const row of horizontalRows) {
      const last = horizontals[horizontals.length - 1];
      if (last && row.y - last._lastY <= 2 / scale) {
        last.y = (last.y * last.count + row.y) / (last.count + 1);
        last.x0 = Math.min(last.x0, row.x0);
        last.x1 = Math.max(last.x1, row.x1);
        last.count++;
        last._lastY = row.y;
      } else {
        horizontals.push({ ...row, count: 1, _lastY: row.y });
      }
    }
    for (const line of horizontals) {
      delete line.count;
      delete line._lastY;
    }

    // Table border rules are vertically continuous through multiple cells.
    // Keep their actual spans so barcode bars or letter stems elsewhere on
    // the page cannot be mistaken for column boundaries.
    const verticalCandidates = [];
    const minimumVerticalRun = Math.round(scale * 10.5);
    for (let x = xMin; x < xMax; x++) {
      const segments = [];
      let start = -1;
      for (let y = yMin; y <= yMax; y++) {
        const dark = y < yMax && darkAt(x, y);
        if (dark && start < 0) start = y;
        if ((!dark || y === yMax) && start >= 0) {
          const end = y - 1;
          if (end - start + 1 >= minimumVerticalRun) {
            segments.push({ top: start / scale, bottom: (end + 1) / scale });
          }
          start = -1;
        }
      }
      if (segments.length) verticalCandidates.push({ x: x / scale, segments });
    }

    const verticals = [];
    for (const candidate of verticalCandidates) {
      const last = verticals[verticals.length - 1];
      const overlapsSameRule = last && candidate.x - last._lastX <= 1.25 &&
        candidate.segments.some(segment => last.segments.some(existing =>
          Math.abs(existing.top - segment.top) <= 1.5 &&
          Math.abs(existing.bottom - segment.bottom) <= 1.5
        ));
      if (overlapsSameRule) {
        last.x = (last.x * last.count + candidate.x) / (last.count + 1);
        last.count++;
        last._lastX = candidate.x;
        for (const segment of candidate.segments) {
          const existing = last.segments.find(item =>
            Math.abs(item.top - segment.top) <= 1.5 &&
            Math.abs(item.bottom - segment.bottom) <= 1.5
          );
          if (existing) {
            existing.top = (existing.top * existing.count + segment.top) / (existing.count + 1);
            existing.bottom = (existing.bottom * existing.count + segment.bottom) / (existing.count + 1);
            existing.count++;
          } else {
            last.segments.push({ ...segment, count: 1 });
          }
        }
      } else {
        verticals.push({
          x: candidate.x,
          segments: candidate.segments.map(segment => ({ ...segment, count: 1 })),
          count: 1,
          _lastX: candidate.x
        });
      }
    }
    for (const line of verticals) {
      line.segments = line.segments.map(({ top, bottom }) => ({ top, bottom }));
      delete line.count;
      delete line._lastX;
    }

    return { verticals, horizontals };
  }

  function shiftGridY(grid, offset) {
    if (!grid || !offset) return grid;
    return {
      verticals: (grid.verticals || []).map(line => ({
        ...line,
        segments: line.segments.map(segment => ({
          top: segment.top - offset,
          bottom: segment.bottom - offset
        }))
      })),
      horizontals: (grid.horizontals || []).map(line => ({ ...line, y: line.y - offset }))
    };
  }

  async function cropCanvasRegion(canvas, scale, x, y, width, height) {
    const left = Math.max(0, Math.round(x * scale));
    const top = Math.max(0, Math.round(y * scale));
    const pixelWidth = Math.min(canvas.width - left, Math.max(1, Math.round(width * scale)));
    const pixelHeight = Math.min(canvas.height - top, Math.max(1, Math.round(height * scale)));
    if (pixelWidth < 1 || pixelHeight < 1) return null;
    const crop = document.createElement("canvas");
    crop.width = pixelWidth;
    crop.height = pixelHeight;
    const ctx = crop.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.drawImage(canvas, left, top, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight);
    const blob = await new Promise((resolve, reject) => {
      crop.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare a document image.")), "image/png");
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    crop.width = 1;
    crop.height = 1;
    return {
      bytes,
      x,
      y,
      width,
      height,
      widthPx: width * (96 / 72),
      heightPx: height * (96 / 72)
    };
  }

  async function detectBarcodeImage(canvas, metrics, scale, sourceLines) {
    const contact = (sourceLines || []).find(line => /contact\s*no/i.test(line.text || ""));
    if (!contact) return null;

    const x = Math.max(0, contact.left + 34);
    const y = Math.max(0, contact.top + 14);
    const width = Math.min(150, metrics.width * 0.45 - x);
    const height = Math.min(38, metrics.height - FOOTER_BAND_POINTS - y);
    if (width < 40 || height < 15) return null;

    const imageData = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(Math.round(x * scale), Math.round(y * scale), Math.round(width * scale), Math.round(height * scale));
    const cw = Math.round(width * scale);
    const ch = Math.round(height * scale);
    let columnsWithTallDarkRun = 0;
    for (let px = 0; px < cw; px++) {
      let run = 0;
      let longest = 0;
      for (let py = 0; py < ch; py++) {
        const offset = (py * cw + px) * 4;
        const dark = imageData.data[offset] < 90 &&
          imageData.data[offset + 1] < 90 &&
          imageData.data[offset + 2] < 90;
        if (dark) {
          run++;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
      }
      if (longest >= scale * 10) columnsWithTallDarkRun++;
    }
    if (columnsWithTallDarkRun < Math.max(12, cw * 0.04)) return null;
    // Crop from just above the bars through the numeric caption beneath them.
    return cropCanvasRegion(canvas, scale, x, y, width, height);
  }

  async function renderPageBands(page, metrics, sourceLines) {
    // Preserve form logos and footer artwork while reconstructing editable body text.
    const scale = 3;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return { header: null, footer: null };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;

    const scaleY = viewport.height / metrics.height;

    async function cropBand(yPoints, heightPoints) {
      const top = Math.max(0, Math.min(canvas.height - 1, Math.round(yPoints * scaleY)));
      const height = Math.max(1, Math.min(canvas.height - top, Math.round(heightPoints * scaleY)));
      const band = document.createElement("canvas");
      band.width = canvas.width;
      band.height = height;
      const bandContext = band.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!bandContext) return null;
      bandContext.fillStyle = "#ffffff";
      bandContext.fillRect(0, 0, band.width, band.height);
      bandContext.drawImage(canvas, 0, top, canvas.width, height, 0, 0, band.width, height);

      const pixels = bandContext.getImageData(0, 0, band.width, band.height).data;
      let inspected = 0;
      let nonWhite = 0;
      const stride = 4 * 12;
      for (let i = 0; i < pixels.length; i += stride) {
        inspected++;
        if (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242) nonWhite++;
      }
      if (!inspected || nonWhite / inspected < 0.008) {
        band.width = 1;
        band.height = 1;
        return null;
      }

      const blob = await new Promise((resolve, reject) => {
        band.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare a page header or footer image.")), "image/png");
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      band.width = 1;
      band.height = 1;
      return { bytes, width: metrics.width * (96 / 72), height: (height / scaleY) * (96 / 72), heightPoints: height / scaleY };
    }

    try {
      const header = await cropBand(0, Math.min(HEADER_BAND_POINTS, metrics.height * 0.25));
      const footerHeight = Math.min(FOOTER_BAND_POINTS, metrics.height * 0.2);
      const footer = await cropBand(Math.max(0, metrics.height - footerHeight), footerHeight);
      const grid = detectRasterGrid(canvas, metrics, scale);
      const barcode = await detectBarcodeImage(canvas, metrics, scale, sourceLines);
      return {
        header,
        footer,
        grid: shiftGridY(grid, header ? HEADER_BAND_POINTS : 0),
        barcode: barcode ? { ...barcode, y: barcode.y - (header ? HEADER_BAND_POINTS : 0) } : null
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  function makeBandHeader(band, docx) {
    if (!band) return undefined;
    return new docx.Header({
      children: [new docx.Paragraph({
        children: [new docx.ImageRun({
          data: band.bytes,
          type: "png",
          transformation: { width: band.width, height: band.height }
        })],
        spacing: { before: 0, after: 0 },
        indent: { left: 0 }
      })]
    });
  }

  function makeBandFooter(band, docx) {
    if (!band) return undefined;
    return new docx.Footer({
      children: [new docx.Paragraph({
        children: [new docx.ImageRun({
          data: band.bytes,
          type: "png",
          transformation: { width: band.width, height: band.height }
        })],
        spacing: { before: 0, after: 0 },
        indent: { left: 0 }
      })]
    });
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
          const pageBands = await renderPageBands(page, metrics);
          const content = await page.getTextContent();
          let lines = groupTextLines(content.items, metrics);
          // Remove text already visible in header/footer artwork and preserve
          // the remaining layout relative to the body below the page header.
          if (pageBands.footer) {
            lines = lines.filter(line => line.top < metrics.height - FOOTER_BAND_POINTS);
          }
          if (pageBands.header) {
            lines = lines
              .filter(line => line.top >= HEADER_BAND_POINTS - 1)
              .map(line => ({ ...line, top: Math.max(0, line.top - HEADER_BAND_POINTS) }));
          }
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
            ? lines.map((line, lineIndex) => createLineParagraph(line, lineIndex ? lines[lineIndex - 1] : null, docx, metrics.width, metrics.height, !line.items || !line.items.length))
            : createEditableChildren(lines, metrics, docx);

          const sectionHeaders = pageBands.header ? { default: makeBandHeader(pageBands.header, docx) } : undefined;
          const sectionFooters = pageBands.footer ? { default: makeBandFooter(pageBands.footer, docx) } : undefined;
          sections.push({
            properties: {
              page: {
                size: { width: Math.round(metrics.width * 20), height: Math.round(metrics.height * 20) },
                margin: {
                  top: pageBands.header ? HEADER_BAND_POINTS * 20 : 0,
                  right: 0,
                  bottom: pageBands.footer ? FOOTER_BAND_POINTS * 20 : 0,
                  left: 0,
                  header: 0,
                  footer: 0
                }
              }
            },
            headers: sectionHeaders,
            footers: sectionFooters,
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
      const wordDocument = new docx.Document({ sections: sections });
      const blob = await docx.Packer.toBlob(wordDocument);
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
    version: "2.1.0-local"
  };
})();