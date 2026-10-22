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

  function wordFontFromFamily(family, fontName) {
    const value = (String(family || "") + " " + String(fontName || "")).toLowerCase();
    if (/aptos/.test(value)) return "Aptos";
    if (/calibri/.test(value)) return "Calibri";
    if (/cambria/.test(value)) return "Cambria";
    if (/georgia/.test(value)) return "Georgia";
    if (/verdana/.test(value)) return "Verdana";
    if (/tahoma/.test(value)) return "Tahoma";
    if (/courier|consolas|monospace/.test(value)) return "Courier New";
    if (/times new roman|times-roman|times roman|liberation serif|serif/.test(value)) return "Times New Roman";
    if (/arial|helvetica|liberation sans|sans[- ]?serif|roboto|open sans|noto sans|lato/.test(value)) return "Arial";
    // Use the common sans-serif font for PDFs that expose only internal font IDs.
    return "Arial";
  }

  function clampFontSize(size) {
    return Math.max(6, Math.min(72, Number.isFinite(size) ? size : 11));
  }

  function normalizeItems(items, metrics, textStyles) {
    const normalized = [];
    for (const item of items || []) {
      if (!item || typeof item.str !== "string" || !item.str.trim()) continue;
      const transform = item.transform || [10, 0, 0, 10, 0, 0];
      const fontSize = clampFontSize(Math.hypot(transform[0] || 0, transform[1] || 0) || item.height || 11);
      const x = (transform[4] || 0) - metrics.x0;
      const baseline = metrics.y1 - (transform[5] || 0);
      const width = Math.max(0, Number(item.width) || item.str.length * fontSize * 0.45);
      const pdfStyle = textStyles && textStyles[item.fontName] ? textStyles[item.fontName] : {};
      const fontFamily = String(pdfStyle.fontFamily || "");
      const styleName = [item.fontName || "", fontFamily, pdfStyle.fontWeight || "", pdfStyle.fontStyle || ""].join(" ");
      const namedStyle = styleFromFontName(styleName);
      const explicitWeight = Number(pdfStyle.fontWeight || pdfStyle.weight || 0);
      const bold = Boolean(pdfStyle.bold) || explicitWeight >= 600 || namedStyle.bold;
      const italics = Boolean(pdfStyle.italic || pdfStyle.italics) || namedStyle.italics;
      normalized.push({
        str: item.str,
        x: Math.max(0, x),
        width: width,
        baseline: baseline,
        top: Math.max(0, baseline - fontSize * 0.86),
        height: Math.max(fontSize, Number(item.height) || fontSize),
        fontSize: fontSize,
        fontName: item.fontName || "",
        fontFamily: fontFamily,
        wordFont: wordFontFromFamily(fontFamily, item.fontName),
        pdfFontStyleName: styleName,
        bold: bold,
        italics: italics,
        hasEOL: Boolean(item.hasEOL)
      });
    }
    return normalized;
  }

    function groupTextLines(items, metrics, textStyles) {
    const normalized = normalizeItems(items, metrics, textStyles);
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

  function verticalRuleCovers(grid, x, top, bottom, tolerance) {
    const tol = tolerance === undefined ? 2.5 : tolerance;
    return Boolean(grid && Array.isArray(grid.verticals) && grid.verticals.some(line =>
      Math.abs(line.x - x) <= tol &&
      (line.segments || []).some(segment =>
        segment.top <= top + tol && segment.bottom >= bottom - tol
      )
    ));
  }

  function horizontalRulesShareSpan(a, b, pageWidth) {
    const tolerance = Math.max(7, pageWidth * 0.012);
    const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const smallest = Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
    return Math.abs(a.x0 - b.x0) <= tolerance &&
      Math.abs(a.x1 - b.x1) <= tolerance && overlap / smallest >= 0.86;
  }

  function getRuledTableCandidates(grid, pageWidth) {
    if (!grid || !Array.isArray(grid.horizontals) || !Array.isArray(grid.verticals)) return [];
    const rules = grid.horizontals.filter(rule => rule.x1 - rule.x0 >= pageWidth * 0.52)
      .slice().sort((a, b) => a.y - b.y);
    const candidates = [];
    const seen = new Set();

    for (let start = 0; start < rules.length; start++) {
      const first = rules[start];
      let last = start;
      const connectedRules = [first];
      for (let next = start + 1; next < rules.length; next++) {
        const rule = rules[next];
        if (!horizontalRulesShareSpan(first, rule, pageWidth)) break;
        if (rule.y - rules[last].y < 5) continue;
        const connectedOuterRules =
          verticalRuleCovers(grid, first.x0, first.y, rule.y, 4) &&
          verticalRuleCovers(grid, first.x1, first.y, rule.y, 4);
        if (!connectedOuterRules) break;
        connectedRules.push(rule);
        last = next;
      }
      if (connectedRules.length < 3) continue;

      const top = connectedRules[0].y;
      const bottom = connectedRules[connectedRules.length - 1].y;
      const key = [Math.round(first.x0), Math.round(first.x1), Math.round(top), Math.round(bottom)].join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      const allXs = [first.x0];
      for (const vertical of grid.verticals) {
        if (vertical.x <= first.x0 + 2.5 || vertical.x >= first.x1 - 2.5) continue;
        // Internal borders may stop at merged total rows, so retain any
        // genuine vertical segment that crosses a meaningful part of this
        // table. Per-row merge spans are decided later using exact row bounds.
        if ((vertical.segments || []).some(segment =>
          segment.bottom >= top + 6 && segment.top <= bottom - 6 &&
          Math.min(segment.bottom, bottom) - Math.max(segment.top, top) >= 10
        )) allXs.push(vertical.x);
      }
      allXs.push(first.x1);
      allXs.sort((a, b) => a - b);
      const boundaries = [];
      for (const x of allXs) {
        if (!boundaries.length || x - boundaries[boundaries.length - 1] > 2.5) boundaries.push(x);
      }
      if (boundaries.length < 3 || boundaries.length > 13) continue;
      candidates.push({ top, bottom, x0: boundaries[0], x1: boundaries[boundaries.length - 1], rules: connectedRules, boundaries });
    }
    return candidates.sort((a, b) => a.top - b.top || (b.bottom - b.top) - (a.bottom - a.top));
  }

  function detectRuledTableAt(lines, startIndex, pageWidth, grid, precomputedCandidates) {
    const candidates = precomputedCandidates || getRuledTableCandidates(grid, pageWidth);
    if (!candidates.length) return null;
    const currentLine = lines[startIndex];
    if (!currentLine || !currentLine.items || !currentLine.items.length) return null;

    const candidate = candidates.find(table =>
      currentLine.top >= table.top - 1.5 &&
      currentLine.top < table.bottom - 0.5 &&
      currentLine.items.some(item => {
        const center = item.x + item.width / 2;
        return center >= table.x0 - 2 && center <= table.x1 + 2;
      })
    );
    if (!candidate) return null;

    const insideIndexes = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.items || !line.items.length) continue;
      if (line.top < candidate.top - 1 || line.top >= candidate.bottom - 0.5) continue;
      if (line.items.some(item => {
        const center = item.x + item.width / 2;
        return center >= candidate.x0 - 2 && center <= candidate.x1 + 2;
      })) insideIndexes.push(index);
    }
    if (!insideIndexes.length || startIndex !== insideIndexes[0]) return null;

    const boundaries = candidate.boundaries;
    const columnCount = boundaries.length - 1;
    const rows = [];

    for (let rowIndex = 0; rowIndex < candidate.rules.length - 1; rowIndex++) {
      const rowTop = candidate.rules[rowIndex].y;
      const rowBottom = candidate.rules[rowIndex + 1].y;
      if (rowBottom - rowTop < 5) continue;

      const hasDivider = [];
      for (let boundaryIndex = 1; boundaryIndex < columnCount; boundaryIndex++) {
        hasDivider[boundaryIndex] = verticalRuleCovers(grid, boundaries[boundaryIndex], rowTop, rowBottom, 3);
      }

      const spans = [];
      let column = 0;
      while (column < columnCount) {
        let span = 1;
        while (column + span < columnCount && !hasDivider[column + span]) span++;
        spans.push({
          startColumn: column,
          colSpan: span,
          left: boundaries[column],
          right: boundaries[column + span]
        });
        column += span;
      }

      const cells = spans.map(span => ({ ...span, fragments: [], text: "", centered: false }));
      for (const line of lines) {
        if (!line.items || !line.items.length) continue;
        if (line.top < rowTop - 1.5 || line.top >= rowBottom - 0.5) continue;

        for (const cell of cells) {
          const items = line.items.filter(item => {
            const center = item.x + item.width / 2;
            return center >= cell.left - 1.5 && center < cell.right + 1.5;
          });
          if (!items.length) continue;
          const itemLeft = Math.min(...items.map(item => item.x));
          const itemRight = Math.max(...items.map(item => item.x + item.width));
          const itemCenter = (itemLeft + itemRight) / 2;
          const cellCenter = (cell.left + cell.right) / 2;
          const centeredText = Math.abs(itemCenter - cellCenter) <=
            Math.max(4.5, Math.min(line.fontSize * 1.35, (cell.right - cell.left) * 0.12));
          const fragment = {
            items,
            text: items.map(item => item.str).join(" "),
            x: itemLeft,
            end: itemRight,
            center: itemCenter,
            centered: centeredText,
            fontSize: line.fontSize,
            lineTop: line.top,
            height: line.height
          };
          cell.fragments.push(fragment);
          cell.text = [cell.text, fragment.text].filter(Boolean).join(" ").trim();
        }
      }

      if (!cells.some(cell => cell.fragments.length)) continue;
      const fullWidthMerge = cells.length === 1 && cells[0].colSpan === columnCount;
      const rowText = cells.map(cell => cell.text).join(" ").toLowerCase();
      const isSummary = /\b(total amount|totalamount|total amount in words|total amount of|grand total|net total)\b/i.test(rowText);
      const isHeader = rowIndex === 0;
      const fontSizes = cells.flatMap(cell => cell.fragments.map(fragment => fragment.fontSize)).filter(Number.isFinite);
      rows.push({
        cells,
        merged: fullWidthMerge,
        centered: fullWidthMerge && cells[0].fragments.some(fragment => Math.abs(fragment.center - pageWidth / 2) < pageWidth * 0.2),
        isHeader,
        isSummary,
        ruled: true,
        line: {
          fontSize: fontSizes.length ? fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length : 10,
          top: rowTop,
          height: rowBottom - rowTop
        }
      });
    }

    if (rows.length < 2) return null;
    return {
      rows,
      endIndex: Math.max(...insideIndexes) + 1,
      columnCount,
      columnStarts: boundaries.slice(0, -1),
      columnCenters: boundaries.slice(0, -1).map((x, index) => (x + boundaries[index + 1]) / 2),
      boundaries,
      leftPoints: candidate.x0,
      lastLine: lines[Math.max(...insideIndexes)]
    };
  }

  function detectTableAt(lines, startIndex, pageWidth, grid) {
    const region = [];
    let previous = null;
    for (let index = startIndex; index < lines.length; index++) {
      const line = lines[index];
      if (previous && line.top - previous.top > 30) break;
      region.push({ line, cells: splitLineIntoCells(line) });
      previous = line;
    }
    if (region.length < 2) return null;

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
    if (maxLineColumns < 3 && region.length > 3) return null;

    const regionTop = region[0].line.top - 7;
    const regionBottom = region[region.length - 1].line.top +
      (region[region.length - 1].line.height || region[region.length - 1].line.fontSize || 10) + 7;

    // Prefer the real ruled geometry detected from page pixels. This is much
    // more reliable than inferring columns from text start positions: right-
    // aligned numbers and wrapped headings often begin away from their border.
    let boundaries = [];
    if (grid && Array.isArray(grid.verticals)) {
      const active = grid.verticals
        .filter(line => (line.segments || []).some(segment =>
          segment.bottom >= regionTop && segment.top <= regionBottom &&
          segment.bottom - segment.top >= 10
        ))
        .map(line => line.x)
        .sort((a, b) => a - b);
      for (const x of active) {
        if (!boundaries.length || x - boundaries[boundaries.length - 1] > 2.5) boundaries.push(x);
      }

      const supportingRules = (grid.horizontals || []).filter(line =>
        line.y >= regionTop - 5 &&
        line.y <= regionBottom + 5 &&
        line.x1 - line.x0 >= pageWidth * 0.4
      );
      if (boundaries.length < 3 || boundaries.length > 13 || supportingRules.length < 2) {
        boundaries = [];
      }
    }

    let columnCenters;
    let columnStarts;
    let columnCount;
    let leftPoints;
    let useGridBoundaries = boundaries.length >= 3;

    if (useGridBoundaries) {
      columnStarts = boundaries;
      columnCount = boundaries.length - 1;
      columnCenters = boundaries.slice(0, -1).map((x, i) => (x + boundaries[i + 1]) / 2);
      leftPoints = boundaries[0];
    } else {
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
      columnCenters = clusters.map(cluster => cluster.center);
      columnStarts = clusters.map(cluster => cluster.start);
      columnCount = columnCenters.length;
      const allXs = region.flatMap(entry => (entry.line.items || []).map(item => item.x)).filter(Number.isFinite);
      if (!allXs.length) return null;
      leftPoints = Math.max(0, Math.min(pageWidth - 30, Math.min(...allXs)));
    }

    if (columnCount < 2 || columnCount > 12) return null;
    // Inferred tables are deliberately conservative. When no visible grid is
    // detected, don't reinterpret early-page invoice metadata as a table merely
    // because recipient, date and company details share a few baselines.
    if (!useGridBoundaries && (regionTop < 180 || maxLineColumns < 4 || rowGroups.length < 4)) {
      return null;
    }

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
            const center = cell.center;
            let column = 0;
            if (useGridBoundaries) {
              column = columnStarts.findIndex((left, columnIndex) =>
                columnIndex < columnCount && center >= left && center < columnStarts[columnIndex + 1]
              );
              if (column < 0) column = center < columnStarts[0] ? 0 : columnCount - 1;
            } else {
              column = columnCenters.reduce((bestIndex, centerX, columnIndex) =>
                Math.abs(center - centerX) < Math.abs(center - columnCenters[bestIndex])
                  ? columnIndex
                  : bestIndex
              , 0);
            }
            cells[column].fragments.push(cell);
            cells[column].text = [cells[column].text, cell.text].filter(Boolean).join(" ").trim();
          }
        }
      }

      const rowText = cells.map(cell => cell.text).join(" ").toLowerCase();
      const isHeader = /description/.test(rowText) && /code/.test(rowText);
      const isSummary = /\b(accounting profit|total assets|total equity|total income|taxable income|total income|net assets current year|unreconciled amount|income\s*\/\s*\(loss\)\s*from business)\b/i.test(rowText);
      const firstFragment = fragments[0];
      return {
        cells,
        merged: isMerged,
        centered: Boolean(isMerged && firstFragment && firstFragment.x > pageWidth * 0.28),
        isHeader,
        isSummary,
        line: {
          fontSize: group.reduce((sum, entry) => sum + entry.line.fontSize, 0) / group.length,
          top: group[0].line.top,
          height: Math.max(...group.map(entry => entry.line.height || entry.line.fontSize || 10))
        }
      };
    }).filter(row => row.cells.some(cell => cell.fragments.length));

    if (rows.length < 2) return null;
    return {
      rows,
      endIndex: startIndex + region.length,
      columnCount,
      columnStarts,
      columnCenters,
      boundaries: useGridBoundaries ? boundaries : null,
      leftPoints,
      lastLine: region[region.length - 1].line
    };
  }

    function createCellParagraph(cell, docx, fallbackFontSize, forceBold, columnIndex, headerRow) {
    const children = [];
    let previous = null;
    for (const part of cell.items || []) {
      if (previous) {
        const gap = part.x - (previous.x + previous.width);
        if (gap > Math.max(1.2, clampFontSize(fallbackFontSize) * 0.18)) {
          children.push(new docx.TextRun({ text: " " }));
        }
      }
      const fontStyle = { bold: Boolean(part.bold) || styleFromFontName(part.pdfFontStyleName || part.fontFamily || part.fontName).bold, italics: Boolean(part.italics) || styleFromFontName(part.pdfFontStyleName || part.fontFamily || part.fontName).italics };
      children.push(new docx.TextRun({
        text: part.str,
        size: Math.round(clampFontSize(part.fontSize || fallbackFontSize) * 2),
        font: part.wordFont || "Arial",
        bold: fontStyle.bold || Boolean(forceBold),
        italics: fontStyle.italics
      }));
      previous = part;
    }

    const cellText = String(cell.text || (cell.items || []).map(item => item.str).join(" ")).trim();
    const numericCell = /^[-(]?\d[\d,]*(?:\.\d+)?%?\)?$/.test(cellText.replace(/\s/g, ""));
    let alignment;
    const descriptionFirstHeader = headerRow && columnIndex === 0 && /^(description|particulars|item description)$/i.test(cellText);
    if (cell.centered || (headerRow && !descriptionFirstHeader) || (numericCell && columnIndex === 1)) {
      alignment = docx.AlignmentType ? docx.AlignmentType.CENTER : "center";
    } else if (numericCell && columnIndex >= 2) {
      alignment = docx.AlignmentType ? docx.AlignmentType.RIGHT : "right";
    }

    return new docx.Paragraph({
      children: children.length ? children : [new docx.TextRun({ text: cellText, font: "Arial", bold: Boolean(forceBold) })],
      alignment,
      spacing: { before: 0, after: 0 }
    });
  }

    function createTable(rows, pageWidth, docx, tableInfo) {
    const columnCount = tableInfo.columnCount;
    const leftPoints = tableInfo.leftPoints;
    const availableWidth = Math.max(120, pageWidth - leftPoints - 20);
    const starts = tableInfo.columnStarts;
    let widthsPoints = [];

    if (tableInfo.boundaries && tableInfo.boundaries.length === columnCount + 1) {
      widthsPoints = tableInfo.boundaries.slice(0, -1).map((left, index) =>
        Math.max(18, tableInfo.boundaries[index + 1] - left)
      );
    } else if (columnCount === 2) {
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
    const edge = { style: docx.BorderStyle ? docx.BorderStyle.SINGLE : "single", size: 4, color: "333333", space: 0 };

    const makeCellParagraphs = (cell, fallbackFontSize, forceBold, columnIndex, headerRow) => {
      const fragments = cell && cell.fragments ? cell.fragments : [];
      if (!fragments.length) {
        return [new docx.Paragraph({
          children: [new docx.TextRun({ text: "" })],
          spacing: { before: 0, after: 0 }
        })];
      }
      return fragments.map(fragment => createCellParagraph(fragment, docx, fallbackFontSize, forceBold, columnIndex, headerRow));
    };

    const tableRows = rows.map(row => {
      const cells = row.cells.map((cell, cellIndex) => {
        const startColumn = Number.isFinite(cell.startColumn) ? cell.startColumn : cellIndex;
        const span = Math.max(1, Math.min(columnCount - startColumn, Number(cell.colSpan) || 1));
        const cellWidth = widths.slice(startColumn, startColumn + span).reduce((sum, width) => sum + width, 0);
        const options = {
          children: makeCellParagraphs(cell, row.line.fontSize, row.isHeader || row.isSummary || row.merged, startColumn, row.isHeader),
          width: { size: cellWidth, type: widthType },
          shading: row.isHeader || row.isSummary || row.merged ? { fill: "EAF2F8" } : undefined,
          margins: { top: 25, bottom: 25, left: 45, right: 45 }
        };
        if (span > 1) options.columnSpan = span;
        return new docx.TableCell(options);
      });
      return new docx.TableRow({ children: cells });
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

  function createFloatingImageParagraph(image, docx) {
    const floatingImage = new docx.ImageRun({
      data: image.bytes,
      type: "png",
      transformation: { width: image.widthPx, height: image.heightPx },
      floating: {
        horizontalPosition: {
          relative: docx.HorizontalPositionRelativeFrom
            ? docx.HorizontalPositionRelativeFrom.PAGE
            : "page",
          offset: Math.round(image.x * 12700)
        },
        verticalPosition: {
          relative: docx.VerticalPositionRelativeFrom
            ? docx.VerticalPositionRelativeFrom.PAGE
            : "page",
          offset: Math.round(image.pageY * 12700)
        },
        wrap: { type: docx.TextWrappingType ? docx.TextWrappingType.NONE : "none" },
        allowOverlap: true,
        behindDocument: false,
        layoutInCell: true,
        zIndex: 10
      }
    });
    return new docx.Paragraph({
      children: [floatingImage],
      spacing: { before: 0, after: 0 },
      indent: { left: 0 }
    });
  }

  function createEditableChildren(lines, metrics, docx, grid) {
    const children = [];
    let previousLine = null;
    let index = 0;
    const ruledTableCandidates = getRuledTableCandidates(grid, metrics.width);
    while (index < lines.length) {
      if (lines[index].floatingImage) {
        children.push(createFloatingImageParagraph(lines[index].floatingImage, docx));
        index++;
        continue;
      }
      const ruledTable = detectRuledTableAt(lines, index, metrics.width, grid, ruledTableCandidates);
      const hasStrongRuledGrid = ruledTableCandidates.length > 0;
      const table = ruledTable || (!hasStrongRuledGrid ? detectTableAt(lines, index, metrics.width, grid) : null);
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

    function createLineParagraph(line, previousLine, docx, pageWidth, pageHeight, isOcr, backgroundImage) {
    const runs = [];
    const tabStops = [];
    const items = line.items && line.items.length ? line.items : [];
    const fontSize = clampFontSize(line.fontSize);
    const leftX = items.length ? Math.min(...items.map(item => item.x)) : Math.max(0, line.left || 0);
    const rightX = items.length
      ? Math.max(...items.map(item => item.x + item.width))
      : leftX + String(line.text || "").length * fontSize * 0.45;
    const lineCenter = (leftX + rightX) / 2;
    const hybridLayout = Boolean(backgroundImage);
    const returnFormTitle = /114\s*\(1\)|return of income filed voluntarily/i.test(line.text || "");
    const billTitle = /^bill$/i.test(String(line.text || "").trim()) && line.top < pageHeight * 0.4;
    const invoiceHeading = /^installation of .*solar system/i.test(String(line.text || "").trim());
    const supplyOrderHeading = /^supply order no\.?/i.test(String(line.text || "").trim());
    const recipientHeading = /district\s*&\s*sessions judge/i.test(String(line.text || ""));
    const titleLine = returnFormTitle || billTitle;

    if (isOcr || !items.length) {
      if (line.text) {
        runs.push(new docx.TextRun({
          text: line.text,
          size: Math.round(fontSize * 2),
          font: { name: "Arial" },
          bold: titleLine,
          underline: returnFormTitle
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
              position: Math.max(20, Math.round((part.x - leftX) * 20))
            });
          } else if (gap > Math.max(1.2, line.fontSize * 0.18)) {
            runs.push(new docx.TextRun({ text: " " }));
          }
        }
        const fontStyle = {
          bold: Boolean(part.bold) || styleFromFontName(part.pdfFontStyleName || part.fontFamily || part.fontName).bold,
          italics: Boolean(part.italics) || styleFromFontName(part.pdfFontStyleName || part.fontFamily || part.fontName).italics
        };
        const token = String(part.str || "").replace(/[.:]/g, "").trim().toLowerCase();
        const metadataLabel = /^(name|address|registration(\s*no)?|no|tax(\s*year)?|year|period|medium|contact(\s*no)?|due(\s*date)?|date|document(\s*date)?|invoice(\s*(date|number|no))?|email)(\s*:)?$/.test(token);
        runs.push(new docx.TextRun({
          text: part.str,
          size: Math.round(clampFontSize(part.fontSize) * 2),
          font: { name: part.wordFont || "Arial" },
          color: part.wordColor || undefined,
          bold: fontStyle.bold || titleLine || invoiceHeading || supplyOrderHeading || recipientHeading || metadataLabel,
          italics: fontStyle.italics,
          underline: returnFormTitle
        }));
        previous = part;
      }
    }

    let hasSeparatedFields = false;
    for (let fieldIndex = 1; fieldIndex < items.length; fieldIndex++) {
      const gap = items[fieldIndex].x - (items[fieldIndex - 1].x + items[fieldIndex - 1].width);
      if (gap > Math.max(9, fontSize * 1.7)) { hasSeparatedFields = true; break; }
    }
    const centered = !hybridLayout && (returnFormTitle || (!hasSeparatedFields && items.length > 0 &&
      leftX > pageWidth * 0.08 && rightX < pageWidth * 0.92 &&
      Math.abs(lineCenter - pageWidth / 2) <= Math.max(14, fontSize * 1.6)));
    const rightAligned = !hybridLayout && !centered && !hasSeparatedFields &&
      leftX > pageWidth * 0.48 && rightX > pageWidth * 0.78;

    // Hybrid mode uses one full-page background. Keep overlay paragraphs at the
    // page's X origin and use page-local positions in their paragraph spacing;
    // applying the inferred left indent a second time causes double shifting.
    const priorBottom = previousLine ? previousLine.top + previousLine.height : 0;
    const rawGap = previousLine ? line.top - priorBottom : line.top;
    const maxParagraphBefore = backgroundImage ? pageHeight * 1.5 : pageHeight * 0.4;
    const before = Math.round(Math.max(0, Math.min(maxParagraphBefore, rawGap)) * 20);
    const leftIndent = hybridLayout ? 0 : (centered || rightAligned ? 0 :
      Math.round(Math.max(0, Math.min(pageWidth * 0.95, leftX)) * 20));
    const rightIndent = hybridLayout ? 0 : (rightAligned ?
      Math.round(Math.max(0, Math.min(pageWidth * 0.5, pageWidth - rightX)) * 20) : 0);
    return new docx.Paragraph({
      children: [
        ...(backgroundImage ? [createHybridBackgroundRun(backgroundImage, docx)] : []),
        ...(runs.length ? runs : [new docx.TextRun({ text: "" })])
      ],
      alignment: centered && docx.AlignmentType ? docx.AlignmentType.CENTER :
        rightAligned && docx.AlignmentType ? docx.AlignmentType.RIGHT : undefined,
      indent: { left: leftIndent, right: rightIndent, firstLine: 0 },
      tabStops: tabStops.length ? tabStops : undefined,
      spacing: {
        before,
        after: 0,
        line: Math.max(1, Math.round(Math.max(fontSize, line.height || fontSize) * 20)),
        lineRule: docx.LineRuleType ? docx.LineRuleType.EXACT : "exact"
      }
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

  async function runOcr(
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
    // OCR.js line boxes are in the rendered canvas pixel space. Convert both X
    // and Y with the exact render viewport so they share PDF-point page-local
    // coordinates with selectable PDF.js text.
    const viewport = page.getViewport({ scale: 1.45 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser could not create a canvas for OCR.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: "#ffffff" }).promise;
    report(onProgress, 15 + ((pageNumber - 1) / totalPages) * 70, "Recognizing scanned text…", "Reading page " + pageNumber + " of " + totalPages + " in your browser.");
    let result;
    try {
      result = await worker.recognize(canvas);
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }

    const scaleX = metrics.width / viewport.width;
    const scaleY = metrics.height / viewport.height;
    const lines = (result && result.data && result.data.lines ? result.data.lines : [])
      .filter(line => line && String(line.text || "").trim())
      .map(line => {
        const box = line.bbox || { x0:0, y0:0, x1:0, y1:14 };
        const left = Math.max(0, box.x0 * scaleX);
        const top = Math.max(0, box.y0 * scaleY);
        const width = Math.max(0, (box.x1 - box.x0) * scaleX);
        const height = Math.max(1, (box.y1 - box.y0) * scaleY);
        const fontSize = clampFontSize(height * 0.86);
        return {
          text: String(line.text).trim(),
          left,
          width,
          top,
          height,
          fontSize,
          items: [],
          // OCR lines have no individual PDF.js glyph runs. Keep line boxes
          // explicit for masking and overlay placement; don't infer text-run
          // widths as if they came from a selectable text layer.
          ocrBox: { x:left, y:top, width, height }
        };
      })
      .sort((a,b) => a.top-b.top || a.left-b.left);
    return lines;
  }

  const HEADER_BAND_POINTS = 108;
  const FOOTER_BAND_POINTS = 73;

  function multiplyPdfMatrix(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5]
    ];
  }

  async function getDisplayObject(page, objectId) {
    const store = typeof objectId === "string" && objectId.startsWith("g_")
      ? page.commonObjs
      : page.objs;
    try {
      const existing = store.get(objectId);
      if (existing) return existing;
    } catch (_) {}
    return new Promise(resolve => {
      try {
        const result = store.get(objectId, value => resolve(value));
        if (result) resolve(result);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function displayImageToPng(image) {
    if (!image) return null;
    const bitmap = image.bitmap || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap ? image : null);
    const width = Math.round(image.width || (bitmap && bitmap.width) || 0);
    const height = Math.round(image.height || (bitmap && bitmap.height) || 0);
    if (!width || !height || width * height > 30000000) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;

    if (bitmap || (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement)) {
      context.drawImage(bitmap || image, 0, 0, width, height);
    } else if (image.data && image.data.length === width * height * 4) {
      const pixels = new Uint8ClampedArray(image.data);
      context.putImageData(new ImageData(pixels, width, height), 0, 0);
    } else if (image.data && image.data.length === width * height * 3) {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let src = 0, dst = 0; src < image.data.length; src += 3, dst += 4) {
        pixels[dst] = image.data[src];
        pixels[dst + 1] = image.data[src + 1];
        pixels[dst + 2] = image.data[src + 2];
        pixels[dst + 3] = 255;
      }
      context.putImageData(new ImageData(pixels, width, height), 0, 0);
    } else {
      canvas.width = 1;
      canvas.height = 1;
      return null;
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      canvas.width = 1;
      canvas.height = 1;
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    canvas.width = 1;
    canvas.height = 1;
    return { bytes, width, height };
  }

  async function findNativePageArtwork(page, metrics, pdfjsLib) {
    const ops = pdfjsLib && pdfjsLib.OPS;
    if (!ops || typeof page.getOperatorList !== "function") return { header: null, footer: null, images: [] };
    let list;
    try {
      list = await page.getOperatorList();
    } catch (_) {
      return { header: null, footer: null, images: [] };
    }

    const imageOps = new Set([
      ops.paintImageXObject,
      ops.paintJpegXObject
    ].filter(value => value !== undefined));
    const stack = [];
    const formStack = [];
    let transform = [1, 0, 0, 1, 0, 0];
    let header = null;
    let footer = null;
    const images = [];
    const seenImagePlacements = new Set();

    for (let i = 0; i < list.fnArray.length; i++) {
      const operation = list.fnArray[i];
      const args = list.argsArray[i] || [];
      if (operation === ops.save) {
        stack.push(transform.slice());
        continue;
      }
      if (operation === ops.restore) {
        transform = stack.pop() || [1, 0, 0, 1, 0, 0];
        continue;
      }
      if (operation === ops.transform && args.length >= 6) {
        transform = multiplyPdfMatrix(transform, args.slice(0, 6));
        continue;
      }
      if (ops.paintFormXObjectBegin !== undefined && operation === ops.paintFormXObjectBegin) {
        formStack.push(transform.slice());
        if (Array.isArray(args[0]) && args[0].length >= 6) {
          transform = multiplyPdfMatrix(transform, args[0].slice(0, 6));
        }
        continue;
      }
      if (ops.paintFormXObjectEnd !== undefined && operation === ops.paintFormXObjectEnd) {
        transform = formStack.pop() || transform;
        continue;
      }
      if (!imageOps.has(operation) || typeof args[0] !== "string") continue;

      const a = transform[0], b = transform[1], c = transform[2], d = transform[3];
      if (Math.abs(b) > 0.5 || Math.abs(c) > 0.5 || Math.abs(a) < 1 || Math.abs(d) < 1) continue;
      const x = Math.min(transform[4], transform[4] + a);
      const width = Math.abs(a);
      const height = Math.abs(d);
      const y = metrics.height - Math.max(transform[5], transform[5] + d);

      const isHeader = y >= -3 && y < HEADER_BAND_POINTS - 5 &&
        x < metrics.width * 0.15 && width > metrics.width * 0.72 &&
        height >= 25 && height <= HEADER_BAND_POINTS + 25;
      const isFooter = y > metrics.height - FOOTER_BAND_POINTS - 25 &&
        y < metrics.height - 5 && x < metrics.width * 0.15 &&
        width > metrics.width * 0.72 && height >= 8 && height <= 55;

      if ((isHeader && header) || (isFooter && footer)) continue;
      const placementKey = [args[0], Math.round(x * 2), Math.round(y * 2), Math.round(width * 2), Math.round(height * 2)].join(":");
      if (seenImagePlacements.has(placementKey)) continue;
      seenImagePlacements.add(placementKey);

      const image = await getDisplayObject(page, args[0]);
      const png = await displayImageToPng(image);
      if (!png) continue;
      const artwork = {
        bytes: png.bytes,
        width: width * (96 / 72),
        height: height * (96 / 72),
        widthPx: width * (96 / 72),
        heightPx: height * (96 / 72),
        widthPoints: width,
        heightPoints: height,
        x,
        y,
        pageY: y,
        native: true
      };
      if (isHeader && !header) header = artwork;
      else if (isFooter && !footer) footer = artwork;
      else images.push(artwork);
    }
    return { header, footer, images };
  }

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

  async function createVerticalRuleImage(x, y, height, scale) {
    const canvas = document.createElement("canvas");
    const pixelWidth = Math.max(3, Math.round(scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.fillStyle = "#000000";
    context.fillRect(Math.floor(pixelWidth / 2), 0, Math.max(1, Math.ceil(scale * 0.45)), pixelHeight);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    canvas.width = 1;
    canvas.height = 1;
    return {
      bytes,
      x,
      y,
      pageY: y,
      width: 0.8 * (96 / 72),
      height: height * (96 / 72),
      widthPx: 0.8 * (96 / 72),
      heightPx: height * (96 / 72),
      widthPoints: 0.8,
      heightPoints: height,
      native: true,
      decorLine: true
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
      return {
        bytes,
        width: metrics.width * (96 / 72),
        height: (height / scaleY) * (96 / 72),
        heightPoints: height / scaleY,
        widthPoints: metrics.width,
        x: 0,
        y: yPoints,
        native: false
      };
    }

    try {
      const nativeArtwork = await findNativePageArtwork(page, metrics, window.pdfjsLib);
      for (const artwork of [nativeArtwork.header, nativeArtwork.footer, ...(nativeArtwork.images || [])]) {
        if (!artwork) continue;
        try {
          const bitmap = await createImageBitmap(new Blob([artwork.bytes], { type: "image/png" }));
          context.drawImage(
            bitmap,
            Math.round(artwork.x * scale),
            Math.round(artwork.y * scale),
            Math.round(artwork.widthPoints * scale),
            Math.round(artwork.heightPoints * scale)
          );
          bitmap.close();
        } catch (_) {}
      }
      const renderedHeader = await cropBand(0, Math.min(HEADER_BAND_POINTS, metrics.height * 0.25));
      const footerTop = Math.max(0, metrics.height - FOOTER_BAND_POINTS);
      const renderedFooter = await cropBand(footerTop, Math.min(FOOTER_BAND_POINTS, metrics.height));
      const hasSeparateHeaderImages = (nativeArtwork.images || []).some(image =>
        image.y < HEADER_BAND_POINTS + 115 && image.y + image.heightPoints > 0
      );
      const header = nativeArtwork.header || (hasSeparateHeaderImages ? null : renderedHeader);
      let footer = nativeArtwork.footer;
      let footerText = null;
      if (footer) {
        // The print-date/page-number strip sits immediately above the native
        // blue footer artwork. Keep it as a separate high-resolution strip so
        // the original embedded footer image can retain its native pixels.
        const textStripHeight = Math.max(0, footer.y - footerTop);
        if (textStripHeight > 1) footerText = await cropBand(footerTop, textStripHeight);
      } else {
        footer = renderedFooter;
      }
      const grid = detectRasterGrid(canvas, metrics, scale);
      const tableTop = grid.horizontals.length
        ? Math.min(...grid.horizontals.filter(rule => rule.x1 - rule.x0 >= metrics.width * 0.52).map(rule => rule.y))
        : metrics.height;
      const dividerImages = [];
      for (const vertical of grid.verticals || []) {
        if (vertical.x < metrics.width * 0.25 || vertical.x > metrics.width * 0.75) continue;
        for (const segment of vertical.segments || []) {
          const length = segment.bottom - segment.top;
          if (length < 35 || segment.top < HEADER_BAND_POINTS + 8 || segment.bottom > tableTop - 8) continue;
          const rule = await createVerticalRuleImage(vertical.x, segment.top, length, scale);
          if (rule) dividerImages.push(rule);
        }
      }
      const barcode = await detectBarcodeImage(canvas, metrics, scale, sourceLines);
      const contactLine = (sourceLines || []).find(line => /contact\s*no/i.test(line.text || ""));
      const hasNativeBarcode = Boolean(contactLine && (nativeArtwork.images || []).some(image =>
        image.y >= contactLine.top &&
        image.y <= contactLine.top + 70 &&
        image.x >= contactLine.left + 15 &&
        image.x < metrics.width * 0.6
      ));
      return {
        header,
        footer,
        footerText,
        pageImages: [...(nativeArtwork.images || []), ...dividerImages],
        grid: shiftGridY(grid, header ? HEADER_BAND_POINTS : 0),
        barcode: hasNativeBarcode ? null : (barcode ? { ...barcode, pageY: barcode.y, y: barcode.y - (header ? HEADER_BAND_POINTS : 0) } : null)
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  function makePagePositionedImage(band, docx, zIndex, behindDocument) {
    if (!band) return null;
    return new docx.ImageRun({
      data: band.bytes,
      type: "png",
      transformation: { width: band.width, height: band.height },
      floating: {
        horizontalPosition: {
          relative: docx.HorizontalPositionRelativeFrom
            ? docx.HorizontalPositionRelativeFrom.PAGE
            : "page",
          offset: Math.round((band.x || 0) * 12700)
        },
        verticalPosition: {
          relative: docx.VerticalPositionRelativeFrom
            ? docx.VerticalPositionRelativeFrom.PAGE
            : "page",
          offset: Math.round((band.y || 0) * 12700)
        },
        wrap: { type: docx.TextWrappingType ? docx.TextWrappingType.NONE : "none" },
        allowOverlap: true,
        behindDocument: Boolean(behindDocument),
        layoutInCell: false,
        zIndex: zIndex || 1
      }
    });
  }

  function makeBandHeader(band, docx) {
    if (!band) return undefined;
    const image = makePagePositionedImage(band, docx, 1, true);
    return new docx.Header({
      children: [new docx.Paragraph({
        children: image ? [image] : [new docx.TextRun({ text: "" })],
        spacing: { before: 0, after: 0 },
        indent: { left: 0 }
      })]
    });
  }

  function makeBandFooter(band, docx, footerText) {
    if (!band && !footerText) return undefined;
    const children = [];
    const textStripImage = footerText ? makePagePositionedImage(footerText, docx, 2, true) : null;
    const bannerImage = band ? makePagePositionedImage(band, docx, 3, true) : null;
    if (textStripImage) children.push(new docx.Paragraph({
      children: [textStripImage],
      spacing: { before: 0, after: 0 },
      indent: { left: 0 }
    }));
    if (bannerImage) children.push(new docx.Paragraph({
      children: [bannerImage],
      spacing: { before: 0, after: 0 },
      indent: { left: 0 }
    }));
    return new docx.Footer({ children });
  }

    function medianColor(samples) {
    if (!samples.length) return [255, 255, 255];
    const channel = index => {
      const values = samples.map(sample => sample[index]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };
    return [channel(0), channel(1), channel(2)];
  }

  function sampleCanvasColor(imageData, rect) {
    const { data, width, height } = imageData;
    const samples = [];
    const pushPixel = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
      samples.push([data[offset], data[offset + 1], data[offset + 2]]);
    };
    const x0 = Math.max(0, Math.floor(rect.x));
    const x1 = Math.min(width - 1, Math.ceil(rect.x + rect.width));
    const y0 = Math.max(0, Math.floor(rect.y));
    const y1 = Math.min(height - 1, Math.ceil(rect.y + rect.height));
    // Use the outermost perimeter rather than the interior edge: interior
    // sampling frequently captures antialiased glyph pixels or a table rule.
    const strideX = Math.max(1, Math.floor(Math.max(1, x1 - x0) / 32));
    const strideY = Math.max(1, Math.floor(Math.max(1, y1 - y0) / 12));
    for (let x = x0; x <= x1; x += strideX) {
      pushPixel(x, y0); pushPixel(x, y1);
    }
    for (let y = y0; y <= y1; y += strideY) {
      pushPixel(x0, y); pushPixel(x1, y);
    }
    if (!samples.length) return [255, 255, 255];
    // Avoid using near-black pixels as a mask fill when at least a few lighter
    // colors exist. If the perimeter is genuinely dark, fall back to median.
    const safe = samples.filter(pixel => Math.min(pixel[0], pixel[1], pixel[2]) > 85 ||
      Math.max(...pixel) - Math.min(...pixel) > 35);
    return medianColor(safe.length >= Math.min(4, samples.length) ? safe : samples);
  }

  function estimateForegroundColor(imageData, rect, background) {
    const { data, width, height } = imageData;
    const x0 = Math.max(0, Math.floor(rect.x + rect.width * 0.08));
    const x1 = Math.min(width - 1, Math.ceil(rect.x + rect.width * 0.92));
    const y0 = Math.max(0, Math.floor(rect.y + rect.height * 0.12));
    const y1 = Math.min(height - 1, Math.ceil(rect.y + rect.height * 0.88));
    const samples = [];
    const stepX = Math.max(1, Math.floor((x1 - x0 + 1) / 80));
    const stepY = Math.max(1, Math.floor((y1 - y0 + 1) / 24));
    for (let y = y0; y <= y1; y += stepY) {
      for (let x = x0; x <= x1; x += stepX) {
        const offset = (y * width + x) * 4;
        const pixel = [data[offset], data[offset + 1], data[offset + 2]];
        const distance = Math.sqrt(
          (pixel[0] - background[0]) ** 2 +
          (pixel[1] - background[1]) ** 2 +
          (pixel[2] - background[2]) ** 2
        );
        if (distance > 45) samples.push(pixel);
      }
    }
    if (!samples.length) return "000000";
    const rgb = medianColor(samples);
    return rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function hybridMapRect(rect, scaleX, scaleY, width, height, padXPoints, padYPoints) {
    const px = Number.isFinite(padXPoints) ? padXPoints : 0;
    const py = Number.isFinite(padYPoints) ? padYPoints : 0;
    const x0 = Math.max(0, Math.floor((rect.x - px) * scaleX));
    const y0 = Math.max(0, Math.floor((rect.y - py) * scaleY));
    const x1 = Math.min(width, Math.ceil((rect.x + rect.width + px) * scaleX));
    const y1 = Math.min(height, Math.ceil((rect.y + rect.height + py) * scaleY));
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function hybridMergeIntersectingMasks(masks) {
    const pending = (masks || []).map(mask => ({
      x: mask.rect.x, y: mask.rect.y,
      right: mask.rect.x + mask.rect.width,
      bottom: mask.rect.y + mask.rect.height,
      colors: [mask.color]
    }));
    const groups = [];
    while (pending.length) {
      let group = pending.shift();
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = pending.length - 1; i >= 0; i--) {
          const other = pending[i];
          const intersects = group.x <= other.right && group.right >= other.x &&
            group.y <= other.bottom && group.bottom >= other.y;
          if (!intersects) continue;
          group = {
            x: Math.min(group.x, other.x),
            y: Math.min(group.y, other.y),
            right: Math.max(group.right, other.right),
            bottom: Math.max(group.bottom, other.bottom),
            colors: group.colors.concat(other.colors)
          };
          pending.splice(i, 1);
          changed = true;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  function maskHybridText(canvas, metrics, lines, scaleX, scaleY) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const grid = detectRasterGrid(canvas, metrics, (scaleX + scaleY) / 2);
    const masks = [];

    for (const line of lines || []) {
      const items = line && Array.isArray(line.items) ? line.items : [];
      for (const item of items) {
        if (!item || !String(item.str || "").trim()) continue;
        const fontSize = clampFontSize(item.fontSize || line.fontSize);
        // Tight padding is deliberate: broad rectangles paint over cell fills,
        // short dividers and nearby values. Original text is removed only close
        // to its source geometry; residual antialiasing is preferable to damage.
        const padX = Math.min(1.0, Math.max(0.3, fontSize * 0.04));
        const padY = Math.min(0.8, Math.max(0.2, fontSize * 0.03));
        const rect = hybridMapRect({
          x: Number(item.x) || 0,
          y: Number(item.top) || 0,
          width: Math.max(0.5, Number(item.width) || String(item.str).length * fontSize * 0.45),
          height: Math.max(fontSize, Number(item.height) || fontSize)
        }, scaleX, scaleY, canvas.width, canvas.height, padX, padY);
        if (!rect) continue;
        const padXpx = Math.max(2, Math.round(1.5 * scaleX));
        const padYpx = Math.max(2, Math.round(1.4 * scaleY));
        const sx = Math.max(0, rect.x - padXpx);
        const sy = Math.max(0, rect.y - padYpx);
        const sampleRect = {
          x: sx, y: sy,
          width: Math.max(1, Math.min(canvas.width - sx, rect.width + padXpx * 2)),
          height: Math.max(1, Math.min(canvas.height - sy, rect.height + padYpx * 2))
        };
        const background = sampleCanvasColor(original, sampleRect);
        item.wordColor = estimateForegroundColor(original, rect, background);
        masks.push({ rect, color: background });
      }

      // OCR results do not have per-glyph PDF.js items. Use their measured line
      // boxes in the same page-point coordinate system for scanned-page masking.
      if ((!line.items || !line.items.length) && line.ocrBox && line.text) {
        const rect = hybridMapRect(line.ocrBox, scaleX, scaleY, canvas.width, canvas.height, 0.45, 0.35);
        if (rect) {
          const sx = Math.max(0, rect.x - 3), sy = Math.max(0, rect.y - 3);
          const sampleRect = {
            x: sx, y: sy,
            width: Math.max(1, Math.min(canvas.width - sx, rect.width + 6)),
            height: Math.max(1, Math.min(canvas.height - sy, rect.height + 6))
          };
          masks.push({ rect, color: sampleCanvasColor(original, sampleRect) });
        }
      }
    }

    // Merge genuine intersections only. Adjacent fragments from separate invoice
    // columns are not joined merely because they share the same baseline.
    const groups = hybridMergeIntersectingMasks(masks);
    context.save();
    context.imageSmoothingEnabled = false;
    for (const group of groups) {
      const color = medianColor(group.colors);
      context.fillStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")";
      context.fillRect(group.x, group.y, group.right - group.x, group.bottom - group.y);
    }
    context.restore();

    // Restore detected dark long rules from the untouched raster after masking.
    const restored = context.getImageData(0, 0, canvas.width, canvas.height);
    const out = restored.data, src = original.data;
    const restore = (x, y) => {
      if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
      const p = (y * canvas.width + x) * 4;
      if (src[p] < 175 && src[p + 1] < 175 && src[p + 2] < 175) {
        out[p] = src[p]; out[p + 1] = src[p + 1]; out[p + 2] = src[p + 2]; out[p + 3] = src[p + 3];
      }
    };
    for (const rule of grid.horizontals || []) {
      const y = Math.round(rule.y * scaleY);
      const x0 = Math.max(0, Math.floor(rule.x0 * scaleX));
      const x1 = Math.min(canvas.width - 1, Math.ceil(rule.x1 * scaleX));
      for (let dy = -1; dy <= 1; dy++) for (let x = x0; x <= x1; x++) restore(x, y + dy);
    }
    for (const rule of grid.verticals || []) {
      const x = Math.round(rule.x * scaleX);
      for (const segment of rule.segments || []) {
        const y0 = Math.max(0, Math.floor(segment.top * scaleY));
        const y1 = Math.min(canvas.height - 1, Math.ceil(segment.bottom * scaleY));
        for (let dx = -1; dx <= 1; dx++) for (let y = y0; y <= y1; y++) restore(x + dx, y);
      }
    }
    context.putImageData(restored, 0, 0);
  }

  async function renderHybridBackground(page, metrics, lines) {
    const baseViewport = page.getViewport({ scale: 1 });
    const maximumRenderPixels = 12000000;
    const renderScale = Math.max(1, Math.min(
      4,
      Math.sqrt(maximumRenderPixels / Math.max(1, baseViewport.width * baseViewport.height))
    ));
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("This browser could not render a page for hybrid editable output.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
    maskHybridText(canvas, metrics, lines, viewport.width / metrics.width, viewport.height / metrics.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare the editable page background.")), "image/png")
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    canvas.width = 1;
    canvas.height = 1;
    return {
      bytes,
      widthPx: baseViewport.width * (96 / 72),
      heightPx: baseViewport.height * (96 / 72),
      x: 0,
      y: 0,
      pageY: 0,
      widthPoints: metrics.width,
      heightPoints: metrics.height,
      native: false,
      pageBackground: true
    };
  }

  function createHybridBackgroundRun(background, docx) {
    return new docx.ImageRun({
      data: background.bytes,
      type: "png",
      transformation: { width: background.widthPx, height: background.heightPx },
      floating: {
        horizontalPosition: {
          relative: docx.HorizontalPositionRelativeFrom
            ? docx.HorizontalPositionRelativeFrom.PAGE
            : "page",
          offset: 0
        },
        verticalPosition: {
          relative: docx.VerticalPositionRelativeFrom
            ? docx.VerticalPositionRelativeFrom.PAGE
            : "page",
          offset: 0
        },
        wrap: { type: docx.TextWrappingType ? docx.TextWrappingType.NONE : "none" },
        allowOverlap: true,
        behindDocument: true,
        layoutInCell: false,
        zIndex: 0
      }
    });
  }

  function createHybridPageChildren(lines, metrics, docx, background) {
    const contentLines = (lines || []).slice().sort((a, b) => a.top - b.top || (a.left || 0) - (b.left || 0));
    if (!contentLines.length) {
      contentLines.push({ text: "", left: 0, top: 0, height: 1, fontSize: 6, items: [] });
    }
    return contentLines.map((line, index) =>
      createLineParagraph(
        line,
        index ? contentLines[index - 1] : null,
        docx,
        metrics.width,
        metrics.height,
        !line.items || !line.items.length,
        index === 0 ? background : null
      )
    );
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
      if (mode === "hybrid") {
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
            logger: event => {
              if (event && event.status === "recognizing text") {
                report(onProgress, 12, "Running browser OCR…", "Recognizing text for the editable text layer.");
              }
            }
          });
          await ocrWorker.setParameters({ preserve_interword_spaces: "1" });
        }

        for (let index = 1; index <= pdf.numPages; index++) {
          report(onProgress, (index - 1) / pdf.numPages * 88 + 5, "Preserving page design and adding editable text…", "Processing page " + index + " of " + pdf.numPages + ".");
          const page = await pdf.getPage(index);
          const metrics = pageMetrics(page);
          const content = await page.getTextContent();
          const sourceLines = groupTextLines(content.items, metrics, content.styles);
          let lines = sourceLines;
          let maskLines = sourceLines;
          const pageChars = sourceLines.reduce((sum, line) => sum + (line.text || "").replace(/\s/g, "").length, 0);
          if ((!sourceLines.length || pageChars < 8) && useOcr) {
            const ocrLines = await runOcr(page, metrics, ocrWorker, onProgress, index, pdf.numPages);
            if (ocrLines.length) {
              lines = ocrLines;
              // Mask native selectable text as well as OCR-recognized text to
              // avoid leaving duplicate glyphs behind the editable OCR overlay.
              maskLines = sourceLines.concat(ocrLines);
              pagesOcr += 1;
            }
          }

          const background = await renderHybridBackground(page, metrics, maskLines);
          if (lines.length) {
            pagesWithText += 1;
            outputCharCount += lines.reduce((sum, line) => sum + String(line.text || "").length, 0);
          }
          const children = createHybridPageChildren(lines, metrics, docx, background);
          sections.push({
            properties: {
              page: {
                size: { width: Math.round(metrics.width * 20), height: Math.round(metrics.height * 20) },
                margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
              }
            },
            children
          });
          page.cleanup();
        }
      } else if (mode === "visual") {
        for (let index = 1; index <= pdf.numPages; index++) {
          report(onProgress, (index - 1) / pdf.numPages * 90 + 5, "Preserving original page layout…", "Rendering page " + index + " of " + pdf.numPages + ".");
          const page = await pdf.getPage(index);
          const metrics = pageMetrics(page);
          const baseViewport = page.getViewport({ scale: 1 });
          // Render complete pages at high resolution in exact-appearance mode.
          // Cap raster memory at about 12 megapixels per page.
          const maximumRenderPixels = 12000000;
          const renderScale = Math.max(1, Math.min(
            4,
            Math.sqrt(maximumRenderPixels / Math.max(1, baseViewport.width * baseViewport.height))
          ));
          const renderViewport = page.getViewport({ scale: renderScale });
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
                size: { width: Math.round(baseViewport.width * 20), height: Math.round(baseViewport.height * 20) },
                margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
              }
            },
            children: [
              new docx.Paragraph({
                children: [
                  new docx.ImageRun({
                    data: bytes,
                    type: "png",
                    // docx.js image dimensions use CSS pixels at 96 DPI.
                    // Convert PDF page points to pixels so the image fills the page.
                    transformation: {
                      width: baseViewport.width * (96 / 72),
                      height: baseViewport.height * (96 / 72)
                    }
                  })
                ],
                indent: { left: 0, right: 0, firstLine: 0 },
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
          const sourceLines = groupTextLines(content.items, metrics, content.styles);
          const pageBands = await renderPageBands(page, metrics, sourceLines);
          let lines = sourceLines;
          // Remove text already visible in header/footer artwork and preserve
          // the remaining layout relative to the body below the page header.
          if (pageBands.footer) {
            lines = lines.filter(line => line.top < metrics.height - FOOTER_BAND_POINTS);
          }
          if (pageBands.header) {
            const headerTextCutoff = pageBands.header.native
              ? pageBands.header.y + pageBands.header.heightPoints
              : HEADER_BAND_POINTS - 1;
            lines = lines
              .filter(line => {
                const lineRight = Math.max(line.left || 0, ...(line.items || []).map(item => item.x + item.width));
                const overlapsNativeHeader = pageBands.header.native &&
                  line.top < headerTextCutoff &&
                  line.top + (line.height || 0) > pageBands.header.y &&
                  (line.left || 0) < pageBands.header.x + pageBands.header.widthPoints &&
                  lineRight > pageBands.header.x;
                return pageBands.header.native
                  ? !overlapsNativeHeader
                  : line.top >= headerTextCutoff;
              })
              .map(line => ({ ...line, top: Math.max(0, line.top - HEADER_BAND_POINTS) }));
          }
          for (const image of pageBands.pageImages || []) {
            lines.push({
              text: "",
              top: Math.max(0, image.y - (pageBands.header ? HEADER_BAND_POINTS : 0)),
              height: 0,
              fontSize: 6,
              left: image.x,
              items: [],
              floatingImage: image
            });
          }
          if (pageBands.barcode) {
            lines.push({
              text: "",
              top: pageBands.barcode.y,
              height: 0,
              fontSize: 6,
              left: pageBands.barcode.x,
              items: [],
              floatingImage: pageBands.barcode
            });
          }
          if ((pageBands.pageImages && pageBands.pageImages.length) || pageBands.barcode) {
            lines.sort((a, b) => a.top - b.top || (a.left || 0) - (b.left || 0));
          }
          const pageChars = lines.reduce((sum, line) => sum + (line.text || "").replace(/\s/g, "").length, 0);
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

          const children = useOcr && lines.some(line => !line.floatingImage && (!line.items || !line.items.length))
            ? lines.map((line, lineIndex) => line.floatingImage
              ? createFloatingImageParagraph(line.floatingImage, docx)
              : createLineParagraph(line, lineIndex ? lines[lineIndex - 1] : null, docx, metrics.width, metrics.height, !line.items || !line.items.length))
            : createEditableChildren(lines, metrics, docx, pageBands.grid);

          const sectionHeaders = pageBands.header ? { default: makeBandHeader(pageBands.header, docx) } : undefined;
          const sectionFooters = pageBands.footer || pageBands.footerText
            ? { default: makeBandFooter(pageBands.footer, docx, pageBands.footerText) }
            : undefined;
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
      if ((mode === "editable" || mode === "hybrid") && outputCharCount === 0) {
        if (!useOcr) throw new Error("This PDF appears to contain scanned images rather than selectable text. Enable the optional browser OCR checkbox and try again.");
        throw new Error("The OCR engine could not recognize usable text in this PDF. Try a clearer scan or a selectable-text PDF.");
      }

      report(onProgress, 94, "Building Word document…", "Packaging the converted pages into an editable DOCX.");
      const wordDocument = new docx.Document({ sections: sections });
      const blob = await docx.Packer.toBlob(wordDocument);
      if (!blob || !blob.size) throw new Error("The local engine did not produce a valid Word file.");

      report(onProgress, 100, "Conversion complete", mode === "visual"
        ? "The Word file keeps the page appearance using images; the page text is not individually editable."
        : mode === "hybrid"
          ? "The Word file contains original page artwork with editable text overlays. Check text positions and backgrounds before relying on it."
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

  // Expose narrowly-scoped pure geometry helpers for the local regression page.
  function hybridSampleBackground(imageData, rect) {
    return sampleCanvasColor(imageData, rect);
  }

  window.__hybridTestApi = {
    mapRect: hybridMapRect,
    merge: hybridMergeIntersectingMasks
  };

  window.ToolVaultPdfWordEngine = {
    convert: convert,
    maxFileBytes: MAX_FILE_BYTES,
    maxPages: MAX_PAGES,
    version: "2.8.6-local"
  };
})();