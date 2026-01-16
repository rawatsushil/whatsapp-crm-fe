/**
 * DOM Utilities - Safe DOM manipulation for WhatsApp Web
 * Handles defensive coding against DOM changes
 */

class DOMUtils {
  /**
   * Safely query selector with multiple fallback strategies
   * @param {string[]} selectors - Array of selector strategies
   * @param {Element} context - Context element (default: document)
   * @returns {Element|null}
   */
  static safeQuerySelector(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element) return element;
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e);
      }
    }
    return null;
  }

  /**
   * Extract chat ID from WhatsApp Web DOM
   * Uses multiple strategies for reliability
   * @returns {string|null} Chat ID (e.g., "919876543210@c.us")
   */
  static extractChatId() {
    // Strategy 1: From active chat panel data-id
    const chatPanel = this.safeQuerySelector([
      '[data-testid="chat-panel"]',
      'div[data-id]',
      '[role="main"] div[data-id]'
    ]);
    
    if (chatPanel) {
      const chatId = chatPanel.getAttribute('data-id');
      if (chatId) return chatId;
    }

    // Strategy 2: From URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const phoneFromUrl = urlParams.get('phone');
    if (phoneFromUrl) {
      return `${phoneFromUrl.replace(/[^0-9]/g, '')}@c.us`;
    }

    // Strategy 3: From chat header title
    const chatHeader = this.safeQuerySelector([
      'header span[title]',
      '[data-testid="conversation-header"] span[title]',
      'header div[title]'
    ]);
    
    if (chatHeader) {
      const title = chatHeader.getAttribute('title');
      const phoneMatch = title?.match(/[\d]{10,}/);
      if (phoneMatch) {
        return `${phoneMatch[0]}@c.us`;
      }
    }

    // Strategy 4: From selected chat list item
    const selectedChat = this.safeQuerySelector([
      '[data-testid="list-item"][aria-selected="true"]',
      '[role="listitem"][aria-selected="true"]',
      'div[data-id][aria-selected="true"]'
    ]);
    
    if (selectedChat) {
      const chatId = selectedChat.getAttribute('data-id');
      if (chatId) return chatId;
    }

    return null;
  }

  /**
   * Extract phone number from chat ID
   * @param {string} chatId - Chat ID (e.g., "919876543210@c.us" or "true_918595186912@c.us_AC8DD0DBEE8D6C555FBB04E5A97DB924")
   * @returns {string|null} Phone number
   */
  static extractPhoneNumber(chatId) {
    if (!chatId) return null;
    // Handle formats like:
    // - "919876543210@c.us"
    // - "true_918595186912@c.us_AC8DD0DBEE8D6C555FBB04E5A97DB924"
    // - "918595186912@g.us" (groups)
    const match = chatId.match(/(\d{10,})@/);
    return match ? match[1] : null;
  }

  /**
   * Normalize chat ID to standard format
   * Removes prefixes like "true_" and suffixes like "_AC8DD0DBEE8D6C555FBB04E5A97DB924"
   * @param {string} chatId - Raw chat ID from WhatsApp Web
   * @returns {string|null} Normalized chat ID (e.g., "918595186912@c.us")
   */
  static normalizeChatId(chatId) {
    if (!chatId) return null;
    
    // Remove "true_" prefix if present
    let normalized = chatId.replace(/^true_/, '');
    
    // Extract phone number and domain (c.us or g.us)
    const match = normalized.match(/(\d{10,})@([cg]\.us)/);
    if (match) {
      return `${match[1]}@${match[2]}`;
    }
    
    // Fallback: return as-is if format is already standard
    return normalized;
  }

  /**
   * Get chat name/title
   * @returns {string|null}
   */
  static getChatName() {
    // Try multiple strategies to get the actual contact name
    
    // Strategy 1: Get from span with class _ao3e and dir="auto" (WhatsApp Web header name)
    const headerName = this.safeQuerySelector([
      'header span._ao3e[dir="auto"]',
      '[data-testid="conversation-header"] span._ao3e[dir="auto"]',
      'header span[dir="auto"]._ao3e',
      '[data-testid="conversation-header"] span[dir="auto"]._ao3e',
      'span._ao3e[dir="auto"]'
    ]);
    console.log('headerName', headerName);
    if (headerName) {
      const textContent =
        headerName.textContent?.trim() ||
        headerName.innerText?.trim();
      console.log('textContent', textContent);
      if (
        textContent &&
        textContent.length > 0 &&
        textContent.length < 100 &&
        !/click here|contact info|tap here/i.test(textContent)
      ) {
        console.log('textContent', textContent);
        return textContent;
      }
    }
    
    
    // Strategy 2: Get from the main header text (fallback)
    const headerMainText = this.safeQuerySelector([
      '[data-testid="conversation-header"] span[title] span',
      '[data-testid="conversation-header"] div[title] > span',
      'header span[title] > span',
      '[data-testid="conversation-header"] span[dir="ltr"]'
    ]);
    console.log('headerMainText', headerMainText);
    
    if (headerMainText) {
      const textContent = headerMainText.textContent?.trim();
      if (textContent && 
          textContent.length > 0 &&
          textContent.length < 100 &&
          !textContent.toLowerCase().includes('click here') &&
          !textContent.toLowerCase().includes('contact info') &&
          !textContent.toLowerCase().includes('tap here')) {
        return textContent;
      }
    }
    
    // Strategy 2: Get from header span text content (actual displayed name)
    const chatHeaderSpan = this.safeQuerySelector([
      '[data-testid="conversation-header"] span[title]',
      'header span[title]',
      '[data-testid="conversation-header"] div[title] span',
      'header div[title] span'
    ]);
    console.log('chatHeaderSpan', chatHeaderSpan);
    
    if (chatHeaderSpan) {
      // Try to get direct child text or first meaningful child
      const directText = chatHeaderSpan.textContent?.trim();
      if (directText && 
          directText.length > 0 &&
          directText.length < 100 &&
          !directText.toLowerCase().includes('click here') &&
          !directText.toLowerCase().includes('contact info') &&
          !directText.toLowerCase().includes('tap here')) {
        // Check if it's just placeholder - if it contains the actual name, extract it
        const lines = directText.split('\n').filter(line => line.trim().length > 0);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0 && 
              trimmed.length < 100 &&
              !trimmed.toLowerCase().includes('click here') &&
              !trimmed.toLowerCase().includes('contact info') &&
              !trimmed.toLowerCase().includes('tap here')) {
            return trimmed;
          }
        }
      }
    }
    
    // Strategy 2: Get from title attribute, but filter out placeholders
    const chatHeader = this.safeQuerySelector([
      '[data-testid="conversation-header"] span[title]',
      'header span[title]',
      '[data-testid="conversation-header"] div[title]',
      'header div[title]'
    ]);
    console.log('chatHeader', chatHeader);
    if (chatHeader) {
      const title = chatHeader.getAttribute('title');
      if (title && 
          !title.toLowerCase().includes('click here') &&
          !title.toLowerCase().includes('contact info')) {
        return title.trim();
      }
      
      // Fallback to text content
      const textContent = chatHeader.textContent?.trim();
      if (textContent && 
          !textContent.toLowerCase().includes('click here') &&
          !textContent.toLowerCase().includes('contact info') &&
          textContent.length > 0) {
        return textContent;
      }
    }
    
    // Strategy 3: Try to find the name in the header structure
    const header = this.safeQuerySelector([
      '[data-testid="conversation-header"]',
      'header'
    ]);
    
    if (header) {
      // First priority: Look for span with _ao3e class and dir="auto" (WhatsApp Web name element)
      const nameSpan = header.querySelector('span._ao3e[dir="auto"]');
      if (nameSpan) {
        const text = nameSpan.textContent?.trim();
        if (text && 
            text.length > 0 &&
            text.length < 100 &&
            !text.toLowerCase().includes('click here') &&
            !text.toLowerCase().includes('contact info') &&
            !text.toLowerCase().includes('tap here') &&
            !text.match(/^\+?\d+$/) &&
            !text.includes('@')) {
          return text;
        }
      }
      
      // Second priority: Look for any span with dir="auto"
      const autoSpans = header.querySelectorAll('span[dir="auto"]');
      for (const span of autoSpans) {
        const text = span.textContent?.trim();
        if (text && 
            text.length > 0 &&
            text.length < 100 &&
            !text.toLowerCase().includes('click here') &&
            !text.toLowerCase().includes('contact info') &&
            !text.toLowerCase().includes('tap here') &&
            !text.match(/^\+?\d+$/) &&
            !text.includes('@')) {
          return text;
        }
      }
      
      // Last fallback: Look for any span elements
      const spans = header.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && 
            text.length > 0 &&
            text.length < 100 &&
            !text.toLowerCase().includes('click here') &&
            !text.toLowerCase().includes('contact info') &&
            !text.toLowerCase().includes('tap here') &&
            !text.match(/^\+?\d+$/) &&
            !text.includes('@')) {
          return text;
        }
      }
    }
    
    return null;
  }

  /**
   * Wait for element to appear in DOM
   * @param {string[]} selectors - Selector strategies
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  static waitForElement(selectors, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const check = () => {
        const element = this.safeQuerySelector(selectors);
        if (element) {
          resolve(element);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          resolve(null);
          return;
        }
        
        setTimeout(check, 100);
      };
      
      check();
    });
  }

  /**
   * Observe DOM changes and call callback when element appears
   * @param {string[]} selectors - Selector strategies
   * @param {Function} callback - Callback function
   * @returns {MutationObserver}
   */
  static observeElement(selectors, callback) {
    const observer = new MutationObserver(() => {
      const element = this.safeQuerySelector(selectors);
      if (element) {
        callback(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  /**
   * Check if WhatsApp Web is loaded
   * @returns {boolean}
   */
  static isWhatsAppLoaded() {
    return !!this.safeQuerySelector([
      '[data-testid="chat"]',
      '[role="main"]',
      '#app'
    ]);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtils;
}



