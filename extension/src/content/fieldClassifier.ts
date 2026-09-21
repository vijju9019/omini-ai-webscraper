import type { FieldDefinition, FieldSource } from "../shared/models";

const IGNORED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "PATH",
  "OPTION",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
]);

const CURRENCY_REGEX = /[$€£¥₹元]|usd|eur|gbp|inr|\d+\s*(?:dollars?|cents?|kr)/i;
const PRICE_CLASS_REGEX = /price|cost|amount|sale|discount|pricing/i;
const DATE_CLASS_REGEX = /date|time|published|created|timestamp|ago|posted/i;
const RATING_CLASS_REGEX = /rating|star|score|review/i;
const TITLE_CLASS_REGEX = /title|name|headline|header/i;
const DESC_CLASS_REGEX = /desc|summary|snippet|excerpt|detail|bio/i;
const BADGE_CLASS_REGEX = /badge|tag|category|label|status|chip/i;
const AUTHOR_CLASS_REGEX = /author|seller|byline|brand|user|vendor/i;

export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}

/**
 * Gets clean, stable class names for building selectors, skipping hashes and utility noise.
 */
function getMeaningfulClasses(el: Element): string[] {
  return Array.from(el.classList).filter(
    (cls) =>
      cls.length > 2 &&
      cls.length < 40 &&
      !/^[a-z0-9_-]{10,}$/i.test(cls) && // skip random hashes
      !/^(active|selected|hover|focus|visible|open)$/i.test(cls)
  );
}

/**
 * Computes a robust relative CSS selector from container to target element.
 */
export function computeRelativeSelector(container: Element, target: Element): string {
  if (container === target) return "";

  const steps: string[] = [];
  let curr: Element | null = target;

  while (curr && curr !== container && steps.length < 5) {
    const parent: Element | null = curr.parentElement;
    if (!parent) break;

    const tag = curr.tagName.toLowerCase();
    const classes = getMeaningfulClasses(curr);

    let stepSelector = tag;
    if (classes.length > 0) {
      // Pick the most specific-looking class
      const bestClass = classes[0];
      stepSelector = `${tag}.${CSS.escape(bestClass)}`;
    }

    // Check if stepSelector uniquely identifies curr among parent's children
    const siblingsWithSameSel = Array.from(parent.children).filter((c) => {
      try {
        return c.matches(stepSelector);
      } catch {
        return false;
      }
    });

    if (siblingsWithSameSel.length > 1) {
      const idx = siblingsWithSameSel.indexOf(curr) + 1;
      stepSelector = `${stepSelector}:nth-of-type(${idx})`;
    }

    steps.unshift(stepSelector);
    curr = parent;
  }

  const fullSelector = steps.join(" > ");

  // Test if this selector uniquely locates the target within container
  try {
    const match = container.querySelector(fullSelector);
    if (match === target) return fullSelector;
  } catch {
    // fallback below
  }

  // Simpler descendant fallback: tag + primary class
  const targetClasses = getMeaningfulClasses(target);
  if (targetClasses.length > 0) {
    const classSel = `${target.tagName.toLowerCase()}.${CSS.escape(targetClasses[0])}`;
    try {
      if (container.querySelector(classSel) === target) return classSel;
    } catch {
      // ignore
    }
  }

  // nth child fallback path
  return steps.join(" > ");
}

/**
 * Resolves an image URL checking modern lazy-load attributes.
 */
export function extractImageUrl(img: HTMLImageElement): string {
  const candidate =
    img.currentSrc ||
    img.src ||
    img.getAttribute("data-src") ||
    img.getAttribute("data-lazy-src") ||
    img.getAttribute("data-original") ||
    img.getAttribute("srcset")?.split(/\s+/)[0] ||
    "";

  if (!candidate) return "";
  try {
    return new URL(candidate, window.location.href).href;
  } catch {
    return candidate;
  }
}

/**
 * Extracts a link URL resolving relative paths to absolute.
 */
export function extractLinkUrl(a: HTMLAnchorElement): string {
  const href = a.getAttribute("href") || a.href || "";
  if (!href || href.startsWith("javascript:") || href.startsWith("#")) return "";
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
}

/**
 * Infers semantic field name based on tag, classes, attributes, and content.
 */
function inferSemanticName(element: Element, source: FieldSource, content: string, existingNames: Set<string>): string {
  let baseName = "";

  const classString = element.className && typeof element.className === "string" ? element.className : "";
  const aria = element.getAttribute("aria-label") || "";
  const itemprop = element.getAttribute("itemprop") || "";

  if (itemprop) {
    baseName = itemprop.toLowerCase();
  } else if (source === "src") {
    baseName = "Image";
  } else if (source === "alt") {
    baseName = "Image Alt";
  } else if (source === "datetime" || DATE_CLASS_REGEX.test(classString) || element instanceof HTMLTimeElement) {
    baseName = "Date";
  } else if (PRICE_CLASS_REGEX.test(classString) || (source === "text" && CURRENCY_REGEX.test(content) && content.length < 30)) {
    baseName = "Price";
  } else if (RATING_CLASS_REGEX.test(classString) || RATING_CLASS_REGEX.test(aria)) {
    baseName = "Rating";
  } else if (AUTHOR_CLASS_REGEX.test(classString)) {
    baseName = "Author";
  } else if (BADGE_CLASS_REGEX.test(classString)) {
    baseName = "Tag";
  } else if (DESC_CLASS_REGEX.test(classString)) {
    baseName = "Description";
  } else if (/^h[1-6]$/i.test(element.tagName) || TITLE_CLASS_REGEX.test(classString)) {
    baseName = "Title";
  } else if (source === "href") {
    baseName = "Link";
  } else {
    // Check if element is a paragraph with substantial text
    if (element.tagName === "P" && content.length > 40) {
      baseName = "Description";
    } else {
      baseName = "Text";
    }
  }

  // Ensure uniqueness
  let finalName = baseName;
  let counter = 2;
  while (existingNames.has(finalName)) {
    finalName = `${baseName} ${counter}`;
    counter++;
  }
  existingNames.add(finalName);
  return finalName;
}

/**
 * Inspects a card or repeating element container and automatically infers useful fields.
 */
export function inferFieldsFromContainer(container: Element): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  const existingNames = new Set<string>();
  const seenSelectorsAndSource = new Set<string>();

  // Candidates inside container
  const childNodes = Array.from(
    container.querySelectorAll("h1, h2, h3, h4, h5, h6, a, img, time, p, span, strong, b, [class*='price'], [class*='rating'], [class*='badge'], [itemprop]")
  ).filter((node) => !IGNORED_TAGS.has(node.tagName) && isElementVisible(node));

  // If container itself has text and no children, include it
  if (childNodes.length === 0) {
    const text = cleanText(container.textContent);
    if (text) {
      fields.push({
        id: crypto.randomUUID(),
        name: "text",
        relativeSelector: "",
        source: "text",
        selected: true,
        sampleValue: text.slice(0, 100),
      });
    }
    return fields;
  }

  for (const node of childNodes) {
    const relSelector = computeRelativeSelector(container, node);

    // 1. Text extraction
    const text = cleanText(node.textContent);
    const textKey = `${relSelector}:text`;
    const isActionBoilerplate = /^(add\s+to\s+cart|buy\s+now|buy\s+it\s+now|add\s+to\s+wishlist|quick\s+view|quick\s+look|compare|select\s+options|see\s+details|view\s+details|view\s+product|view\s+item|read\s+more|show\s+more|learn\s+more|click\s+here|share|save|close|next|prev|previous|›|»|★|♥|\+[\s]*more|\d+\s*colors?)$/i.test(text);

    if (text && text.length > 0 && text.length < 500 && !isActionBoilerplate && !seenSelectorsAndSource.has(textKey)) {
      // Don't add text if parent anchor or heading already captured it identically
      const isDupe = fields.some((f) => f.sampleValue === text && f.source === "text");
      if (!isDupe) {
        seenSelectorsAndSource.add(textKey);
        const name = inferSemanticName(node, "text", text, existingNames);
        fields.push({
          id: crypto.randomUUID(),
          name,
          relativeSelector: relSelector,
          source: "text",
          selected: fields.length < 8,
          sampleValue: text.slice(0, 100),
        });
      }
    }

    // 2. Link extraction (if anchor)
    if (node instanceof HTMLAnchorElement && node.href) {
      const linkUrl = extractLinkUrl(node);
      const linkKey = `${relSelector}:href`;
      if (linkUrl && !seenSelectorsAndSource.has(linkKey)) {
        seenSelectorsAndSource.add(linkKey);
        const name = inferSemanticName(node, "href", linkUrl, existingNames);
        fields.push({
          id: crypto.randomUUID(),
          name,
          relativeSelector: relSelector,
          source: "href",
          selected: false, // Default FALSE: No links in ML dataset
          sampleValue: linkUrl,
        });
      }
    }

    // 3. Image extraction (if img)
    if (node instanceof HTMLImageElement) {
      const imgUrl = extractImageUrl(node);
      const imgKey = `${relSelector}:src`;
      if (imgUrl && !seenSelectorsAndSource.has(imgKey)) {
        seenSelectorsAndSource.add(imgKey);
        const name = inferSemanticName(node, "src", imgUrl, existingNames);
        fields.push({
          id: crypto.randomUUID(),
          name,
          relativeSelector: relSelector,
          source: "src",
          selected: false, // unselected by default per user request ("i dont need any image")
          sampleValue: imgUrl,
        });
      }

      if (node.alt && cleanText(node.alt)) {
        const altText = cleanText(node.alt);
        const altKey = `${relSelector}:alt`;
        if (!seenSelectorsAndSource.has(altKey)) {
          seenSelectorsAndSource.add(altKey);
          const name = inferSemanticName(node, "alt", altText, existingNames);
          fields.push({
            id: crypto.randomUUID(),
            name,
            relativeSelector: relSelector,
            source: "alt",
            selected: false,
            sampleValue: altText,
          });
        }
      }
    }

    // 4. Datetime extraction (if time)
    if (node instanceof HTMLTimeElement && node.dateTime) {
      const dateKey = `${relSelector}:datetime`;
      if (!seenSelectorsAndSource.has(dateKey)) {
        seenSelectorsAndSource.add(dateKey);
        const name = inferSemanticName(node, "datetime", node.dateTime, existingNames);
        fields.push({
          id: crypto.randomUUID(),
          name,
          relativeSelector: relSelector,
          source: "datetime",
          selected: true,
          sampleValue: node.dateTime,
        });
      }
    }

    if (fields.length >= 14) break;
  }

  return fields;
}
