let highlightOverlay: HTMLDivElement | null = null;
let activeHighlightElements: Element[] = [];

function ensureHighlightOverlay(): HTMLDivElement {
  if (!highlightOverlay || !document.contains(highlightOverlay)) {
    highlightOverlay = document.createElement("div");
    highlightOverlay.id = "__scraper_overlay_root__";
    highlightOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483640;
      overflow: visible;
    `;
    document.documentElement.appendChild(highlightOverlay);
  }
  return highlightOverlay;
}

/**
 * Highlights a list of elements on the page with glowing bounding boxes so the user sees what is being extracted.
 */
export function highlightElements(elements: Element[], badgeText = "⚡ Scraping"): void {
  clearHighlights();
  if (elements.length === 0) return;

  const overlay = ensureHighlightOverlay();
  activeHighlightElements = [...elements];

  elements.forEach((el, index) => {
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const box = document.createElement("div");
    box.className = "__scraper_highlight_box__";
    box.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #10b981;
      background: rgba(16, 185, 129, 0.12);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
      border-radius: 6px;
      pointer-events: none;
      box-sizing: border-box;
      transition: all 0.12s ease-out;
      z-index: 2147483645;
    `;

    // Add badge on the first few items or top item
    if (index < 3 || index === elements.length - 1) {
      const badge = document.createElement("div");
      badge.textContent = `${badgeText} #${index + 1}`;
      badge.style.cssText = `
        position: absolute;
        top: -24px;
        left: 0;
        background: #059669;
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      `;
      box.appendChild(badge);
    }

    overlay.appendChild(box);
  });
}

/**
 * Clears all active highlights.
 */
export function clearHighlights(): void {
  if (highlightOverlay) {
    highlightOverlay.innerHTML = "";
  }
  activeHighlightElements = [];
}

/**
 * Interactive DOM picker with hover highlight, keyboard navigation (up/down DOM hierarchy),
 * and click selection.
 */
export function startInteractivePicker<T>(
  options: {
    bannerText: string;
    onSelect: (el: HTMLElement) => T | null;
    validate?: (el: HTMLElement) => boolean;
  }
): Promise<T> {
  return new Promise((resolve, reject) => {
    let currentTarget: HTMLElement | null = null;

    // Create banner
    const banner = document.createElement("div");
    banner.id = "__scraper_picker_banner__";
    banner.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #1e293b;
      color: #f8fafc;
      padding: 10px 18px;
      border-radius: 9999px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      border: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      cursor: default;
    `;
    banner.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; animation: pulse 1.5s infinite;"></span>
      <span>${options.bannerText}</span>
      <span style="background:#334155; color:#94a3b8; padding:2px 8px; border-radius:6px; font-size:11px; margin-left:4px;">Esc to cancel</span>
    `;
    document.documentElement.appendChild(banner);

    // Hover outline element
    const hoverBox = document.createElement("div");
    hoverBox.id = "__scraper_hover_box__";
    hoverBox.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483645;
      border: 2px solid #10b981;
      background: rgba(16, 185, 129, 0.12);
      border-radius: 4px;
      display: none;
      transition: all 0.08s ease-out;
      box-sizing: border-box;
    `;
    document.documentElement.appendChild(hoverBox);

    const updateHoverBox = (el: HTMLElement | null) => {
      if (!el || !document.contains(el)) {
        hoverBox.style.display = "none";
        return;
      }
      const rect = el.getBoundingClientRect();
      hoverBox.style.top = `${rect.top}px`;
      hoverBox.style.left = `${rect.left}px`;
      hoverBox.style.width = `${rect.width}px`;
      hoverBox.style.height = `${rect.height}px`;
      hoverBox.style.display = "block";
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      banner.remove();
      hoverBox.remove();
    };

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("#__scraper_picker_banner__")) return;
      currentTarget = target;
      updateHoverBox(target);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("#__scraper_picker_banner__")) return;

      e.preventDefault();
      e.stopPropagation();

      if (currentTarget) {
        try {
          const result = options.onSelect(currentTarget);
          if (result) {
            cleanup();
            resolve(result);
            return;
          }
        } catch (err) {
          console.warn("Selection failed:", err);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        reject(new Error("Selection cancelled by user."));
        return;
      }

      // ArrowUp to expand to parent element
      if (e.key === "ArrowUp" && currentTarget?.parentElement) {
        e.preventDefault();
        currentTarget = currentTarget.parentElement;
        updateHoverBox(currentTarget);
      }

      // ArrowDown to descend to first child
      if (e.key === "ArrowDown" && currentTarget?.firstElementChild instanceof HTMLElement) {
        e.preventDefault();
        currentTarget = currentTarget.firstElementChild;
        updateHoverBox(currentTarget);
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  });
}

let lockShieldEl: HTMLDivElement | null = null;

/**
 * Locks all mouse and keyboard interactions on the page while the AI scraper is active.
 * Shows a modern floating glass banner explaining that the page is locked during extraction.
 */
export function showScraperLockShield(
  title = "🤖 AI Scraper Is Extracting Data…",
  subtitle = "Webpage interaction is locked to prevent interference. Control or stop from the side panel."
): void {
  if (!lockShieldEl || !document.contains(lockShieldEl)) {
    lockShieldEl = document.createElement("div");
    lockShieldEl.id = "__scraper_lock_shield__";
    lockShieldEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(11, 17, 32, 0.42);
      backdrop-filter: blur(3px);
      z-index: 2147483640;
      pointer-events: all;
      cursor: wait;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding-top: 24px;
      user-select: none;
      box-sizing: border-box;
      transition: all 0.2s ease;
    `;

    // Intercept clicks, context menus, and keys to prevent accidental user interference
    const blockEvent = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };

    lockShieldEl.addEventListener("click", blockEvent, true);
    lockShieldEl.addEventListener("mousedown", blockEvent, true);
    lockShieldEl.addEventListener("mouseup", blockEvent, true);
    lockShieldEl.addEventListener("keydown", blockEvent, true);
    lockShieldEl.addEventListener("contextmenu", blockEvent, true);

    document.documentElement.appendChild(lockShieldEl);
  }

  lockShieldEl.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid rgba(59, 130, 246, 0.5);
      box-shadow: 0 20px 40px -5px rgba(0, 0, 0, 0.6), 0 0 25px rgba(59, 130, 246, 0.3);
      border-radius: 16px;
      padding: 14px 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 500px;
      text-align: center;
      animation: fadeIn 0.25s ease-out;
    ">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
          animation: pulse 1.2s infinite;
        "></span>
        <span style="font-size: 14.5px; font-weight: 750; color: #60a5fa; letter-spacing: -0.01em;">
          ${title}
        </span>
      </div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.45;">
        ${subtitle}
      </div>
      <div style="
        font-size: 11px;
        color: #64748b;
        background: rgba(30, 41, 59, 0.6);
        padding: 3px 12px;
        border-radius: 9999px;
        border: 1px solid #334155;
        margin-top: 2px;
      ">
        🔒 Screen locked while scraping • Control or Stop in the side panel
      </div>
    </div>
  `;
}

export function updateScraperLockShield(title: string, subtitle?: string): void {
  if (lockShieldEl && document.contains(lockShieldEl)) {
    showScraperLockShield(title, subtitle);
  }
}

export function hideScraperLockShield(): void {
  if (lockShieldEl && document.contains(lockShieldEl)) {
    lockShieldEl.remove();
    lockShieldEl = null;
  }
}
