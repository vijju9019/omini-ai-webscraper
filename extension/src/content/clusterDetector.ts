import type { CollectionCandidate, FieldDefinition } from "../shared/models";
import { cleanText, inferFieldsFromContainer, isElementVisible } from "./fieldClassifier";
import { extractRows } from "./extractor";

const IGNORED_PARENTS = new Set(["NAV", "HEADER", "FOOTER", "SCRIPT", "STYLE", "HEAD", "SELECT"]);

/**
 * Computes a clean CSS selector for an element relative to the document.
 */
export function generatePageSelector(element: Element): string {
  if (element.id && !/^[0-9]/.test(element.id) && !/ember|react|vue|ng-|_/i.test(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts: string[] = [];
  let curr: Element | null = element;

  while (curr && curr !== document.body && curr !== document.documentElement && parts.length < 5) {
    const tag = curr.tagName.toLowerCase();
    const parent: Element | null = curr.parentElement;

    if (curr.id && !/ember|react|vue|ng-|_/i.test(curr.id)) {
      parts.unshift(`#${CSS.escape(curr.id)}`);
      break;
    }

    const classes = Array.from(curr.classList).filter(
      (c) => c.length > 2 && c.length < 35 && !/^[a-z0-9_-]{10,}$/i.test(c)
    );

    let part = tag;
    if (classes.length > 0) {
      part = `${tag}.${CSS.escape(classes[0])}`;
    }

    if (parent) {
      const matchingSiblings = Array.from(parent.children).filter((child) => {
        try {
          return child.matches(part);
        } catch {
          return false;
        }
      });
      if (matchingSiblings.length > 1 && parts.length === 0) {
        // At the target level, we want to match all repeating siblings!
        // So do NOT add :nth-child here
      } else if (matchingSiblings.length > 1) {
        const idx = Array.from(parent.children).indexOf(curr) + 1;
        part = `${part}:nth-child(${idx})`;
      }
    }

    parts.unshift(part);
    curr = parent;
  }

  return parts.join(" > ");
}

/**
 * Detects HTML <table> elements and constructs structured table candidates.
 */
function detectTables(): CollectionCandidate[] {
  const candidates: CollectionCandidate[] = [];
  const tables = Array.from(document.querySelectorAll("table")).filter(isElementVisible);

  for (const table of tables) {
    // Find rows
    let rows = Array.from(table.querySelectorAll("tbody > tr")).filter(isElementVisible);
    if (rows.length === 0) {
      rows = Array.from(table.querySelectorAll("tr")).filter(isElementVisible);
    }
    if (rows.length < 2) continue;

    // Detect headers
    const headerCells = Array.from(table.querySelectorAll("thead th, thead td, tr:first-child th"));
    const fields: FieldDefinition[] = [];

    if (headerCells.length > 0) {
      headerCells.forEach((th, idx) => {
        const title = cleanText(th.textContent) || `col_${idx + 1}`;
        fields.push({
          id: crypto.randomUUID(),
          name: title,
          relativeSelector: `td:nth-child(${idx + 1})`,
          source: "text",
          selected: true,
        });
      });
    } else {
      // Fallback to inspecting first data row
      const firstRowCells = Array.from(rows[0].children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
      firstRowCells.forEach((_, idx) => {
        fields.push({
          id: crypto.randomUUID(),
          name: `column_${idx + 1}`,
          relativeSelector: `td:nth-child(${idx + 1})`,
          source: "text",
          selected: true,
        });
      });
    }

    if (fields.length === 0) continue;

    // Filter out tables in header, navigation, footer, or sidebars
    if (table.closest("header, nav, footer, aside, .sidebar, #sidebar, .modal, .cookie-banner")) {
      continue;
    }

    // Determine row selector
    const tableSel = generatePageSelector(table);
    const rowSelector = table.querySelector("tbody") ? `${tableSel} > tbody > tr` : `${tableSel} > tr`;

    const sampleRows = extractRows({ selector: rowSelector, fields, isTable: true }, 5);
    if (sampleRows.length === 0) continue;

    candidates.push({
      id: crypto.randomUUID(),
      label: `Table with ${rows.length} rows & ${fields.length} columns`,
      selector: rowSelector,
      score: rows.length >= 4 ? 90 + Math.min(10, rows.length) : 20,
      rowCount: rows.length,
      isTable: true,
      fields,
      sampleRows,
    });
  }

  return candidates;
}

/**
 * Intelligent scoring function: ensures the primary dataset (e.g. 24, 48, or 100+ items)
 * overwhelmingly outranks minor 2-row layout tables or header widgets.
 */
function computeCandidateScore(c: CollectionCandidate): number {
  let score = 0;

  // 1. Heavy weight for row count (real listings have high row counts)
  if (c.rowCount >= 40) score += 130;
  else if (c.rowCount >= 20) score += 105;
  else if (c.rowCount >= 10) score += 80;
  else if (c.rowCount >= 5) score += 45;
  else if (c.rowCount >= 3) score += 15;
  else {
    // 1-2 rows: heavy penalty (almost always banners, navigation, or layout tables)
    score -= 90;
  }

  // 2. Bonus for semantic fields
  const fieldNames = c.fields.map((f) => f.name.toLowerCase());
  const hasTitle = fieldNames.some((n) => n.includes("title") || n.includes("name") || n.includes("heading"));
  const hasLink = c.fields.some(
    (f) => f.source === "href" || f.name.toLowerCase().includes("link") || f.name.toLowerCase().includes("url")
  );
  const hasImage = c.fields.some((f) => f.source === "src" || f.name.toLowerCase().includes("image"));
  const hasPrice = fieldNames.some((n) => n.includes("price") || n.includes("cost") || n.includes("$"));
  const hasRating = fieldNames.some((n) => n.includes("rating") || n.includes("review") || n.includes("star"));

  if (hasTitle) score += 30;
  if (hasLink) score += 30;
  if (hasImage) score += 25;
  if (hasPrice) score += 30;
  if (hasRating) score += 15;

  score += Math.min(25, c.fields.length * 4);

  // 3. Location & semantic context
  const selLower = c.selector.toLowerCase();
  if (/main|article|products|items|results|catalog|grid|listing|content/i.test(selLower)) {
    score += 40;
  }
  if (/header|nav|menu|sidebar|widget|banner|footer|breadcrumb|modal|popup/i.test(selLower)) {
    score -= 100;
  }

  // 4. Data tables adjustments
  if (c.isTable) {
    if (c.rowCount >= 4) {
      score += 20;
    } else {
      score -= 70; // 2-row layout table penalty
    }
  }

  return score;
}

/**
 * Clusters sibling elements within parent containers by structural and class similarity.
 */
function detectRepeatingCards(): CollectionCandidate[] {
  const candidates: CollectionCandidate[] = [];
  const parents = Array.from(document.querySelectorAll("body *")).filter((el) => {
    return (
      el.children.length >= 2 &&
      !IGNORED_PARENTS.has(el.tagName) &&
      isElementVisible(el) &&
      !el.closest("header, nav, footer, aside, .sidebar, #sidebar, .modal, .popup, .cookie-banner")
    );
  });

  const seenSelectors = new Set<string>();

  for (const parent of parents) {
    const visibleChildren = Array.from(parent.children).filter(isElementVisible);
    if (visibleChildren.length < 2) continue;

    // Detect common class across all or most children
    const classFrequency = new Map<string, number>();
    for (const child of visibleChildren) {
      for (const cls of Array.from(child.classList)) {
        if (cls.length > 2 && cls.length < 35 && !/^[a-z0-9_-]{10,}$/i.test(cls)) {
          classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
        }
      }
    }

    // Check if children share the same tag (e.g. li, article, div)
    const tagCounts = new Map<string, number>();
    for (const child of visibleChildren) {
      const tag = child.tagName.toLowerCase();
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    // Group children by tag + best common class
    const groups = new Map<string, Element[]>();

    for (const child of visibleChildren) {
      const tag = child.tagName.toLowerCase();
      // Find the most frequent class among this child's classes
      const bestClass = Array.from(child.classList)
        .filter((c) => (classFrequency.get(c) || 0) >= 2)
        .sort((a, b) => (classFrequency.get(b) || 0) - (classFrequency.get(a) || 0))[0];

      const groupKey = bestClass ? `${tag}.${bestClass}` : tag;
      const arr = groups.get(groupKey) || [];
      arr.push(child);
      groups.set(groupKey, arr);
    }

    // If tag alone matches all children (e.g. all 48 are <li> or <div>), also consider pure tag
    for (const [tag, count] of tagCounts.entries()) {
      if (count >= 3 && count === visibleChildren.length && !groups.has(tag)) {
        groups.set(tag, visibleChildren);
      }
    }

    for (const [groupKey, group] of groups.entries()) {
      if (group.length < 2) continue;

      const firstItem = group[0];
      const textLengths = group.map((g) => cleanText(g.textContent).length);
      const avgLen = textLengths.reduce((a, b) => a + b, 0) / textLengths.length;

      // Filter out empty items or huge page containers
      if (avgLen < 8 || avgLen > 3000) continue;

      const parentSelector = generatePageSelector(parent);
      const rowSelector = `${parentSelector} > ${groupKey}`;

      if (seenSelectors.has(rowSelector)) continue;
      seenSelectors.add(rowSelector);

      // Infer fields from the first item
      const fields = inferFieldsFromContainer(firstItem);
      if (fields.length === 0) continue;

      const sampleRows = extractRows({ selector: rowSelector, fields }, 5);
      if (sampleRows.length === 0) continue;

      const tagDesc = firstItem.tagName.toLowerCase();
      candidates.push({
        id: crypto.randomUUID(),
        label: `${group.length} repeated <${tagDesc}> cards`,
        selector: rowSelector,
        score: 50, // will be computed in discoverCollections
        rowCount: group.length,
        isTable: false,
        fields,
        sampleRows,
      });
    }
  }

  return candidates;
}

/**
 * Discovers all collection candidates on current page, scored so the primary main dataset
 * is always ranked #1.
 */
export function discoverCollections(): CollectionCandidate[] {
  const tableCandidates = detectTables();
  const cardCandidates = detectRepeatingCards();

  const all = [...tableCandidates, ...cardCandidates];

  // Compute intelligent priority score for every candidate
  for (const c of all) {
    c.score = computeCandidateScore(c);
  }

  // Sort descending by score, then row count
  all.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);

  // Return top 10 unique candidates
  return all.slice(0, 10);
}

/**
 * Creates a collection candidate from an element selected interactively by user.
 */
export function candidateFromElement(element: Element): CollectionCandidate | null {
  // Check if element itself has repeating siblings
  let candidateContainer: Element | null = element;
  let matchingSiblings: Element[] = [];

  for (let depth = 0; depth < 4 && candidateContainer && candidateContainer !== document.body; depth++) {
    const parent: Element | null = candidateContainer.parentElement;
    if (!parent) break;

    const tag = candidateContainer.tagName.toLowerCase();
    const firstClass = Array.from(candidateContainer.classList).find(
      (c) => c.length > 2 && !/^[a-z0-9_-]{10,}$/i.test(c)
    );
    const selectorKey = firstClass ? `${tag}.${firstClass}` : tag;

    const siblings = Array.from(parent.children).filter((c) => {
      try {
        return c.matches(selectorKey) && isElementVisible(c);
      } catch {
        return false;
      }
    });

    if (siblings.length >= 2) {
      matchingSiblings = siblings;
      break;
    }

    candidateContainer = parent;
  }

  if (!candidateContainer || matchingSiblings.length < 1) {
    // Single container fallback
    candidateContainer = element;
    matchingSiblings = [element];
  }

  const parent = candidateContainer.parentElement;
  const parentSel = parent ? generatePageSelector(parent) : "body";
  const tag = candidateContainer.tagName.toLowerCase();
  const firstClass = Array.from(candidateContainer.classList).find(
    (c) => c.length > 2 && !/^[a-z0-9_-]{10,}$/i.test(c)
  );
  const rowSelector = firstClass ? `${parentSel} > ${tag}.${firstClass}` : `${parentSel} > ${tag}`;

  const fields = inferFieldsFromContainer(candidateContainer);
  const sampleRows = extractRows({ selector: rowSelector, fields }, 5);

  return {
    id: crypto.randomUUID(),
    label: `Custom collection: ${matchingSiblings.length} items (${tag})`,
    selector: rowSelector,
    score: 100,
    rowCount: matchingSiblings.length,
    isTable: tag === "tr",
    fields,
    sampleRows,
  };
}
