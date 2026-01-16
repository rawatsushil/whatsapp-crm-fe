/**
 * Chat Observer - Monitors active chat changes
 * Extracts chat identifiers and notifies sidebar
 */

class ChatObserver {
  constructor() {
    this.currentChatId = null;
    this.observers = [];
    this.onChatChangeCallbacks = [];
  }

  /**
   * Initialize chat observation
   */
  init() {
    if (!DOMUtils.isWhatsAppLoaded()) {
      console.warn('WhatsApp Web not fully loaded, retrying...');
      setTimeout(() => this.init(), 1000);
      return;
    }

    // Initial chat detection
    this.detectActiveChat();

    // Observe URL changes (WhatsApp uses SPA navigation)
    this.observeUrlChanges();

    // Observe DOM changes for chat panel
    this.observeChatPanel();

    // Observe chat list selection
    this.observeChatList();
  }

  /**
   * Detect current active chat
   */
  detectActiveChat() {
    const rawChatId = DOMUtils.extractChatId();
    if (!rawChatId) return;
    
    // Normalize chat ID to remove WhatsApp Web internal prefixes/suffixes
    const chatId = DOMUtils.normalizeChatId(rawChatId);
    if (chatId && chatId !== this.currentChatId) {
      this.currentChatId = chatId;
      this.notifyChatChange(chatId);
    }
  }

  /**
   * Observe URL changes (WhatsApp Web uses hash-based routing)
   */
  observeUrlChanges() {
    let lastUrl = window.location.href;

    const checkUrl = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Small delay to let DOM update
        setTimeout(() => this.detectActiveChat(), 500);
      }
    };

    // Check periodically
    setInterval(checkUrl, 1000);

    // Also listen to popstate events
    window.addEventListener('popstate', () => {
      setTimeout(() => this.detectActiveChat(), 500);
    });
  }

  /**
   * Observe chat panel changes
   */
  observeChatPanel() {
    const observer = DOMUtils.observeElement(
      [
        '[data-testid="chat-panel"]',
        '[role="main"]',
        'div[data-id]'
      ],
      () => {
        this.detectActiveChat();
      }
    );

    this.observers.push(observer);
  }

  /**
   * Observe chat list selection changes
   */
  observeChatList() {
    const observer = new MutationObserver(() => {
      const selectedChat = DOMUtils.safeQuerySelector([
        '[data-testid="list-item"][aria-selected="true"]',
        '[role="listitem"][aria-selected="true"]',
        'div[data-id][aria-selected="true"]'
      ]);

      if (selectedChat) {
        const rawChatId = selectedChat.getAttribute('data-id');
        if (rawChatId) {
          const chatId = DOMUtils.normalizeChatId(rawChatId);
          if (chatId && chatId !== this.currentChatId) {
            this.currentChatId = chatId;
            this.notifyChatChange(chatId);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'data-id']
    });

    this.observers.push(observer);
  }

  /**
   * Register callback for chat changes
   * @param {Function} callback - Callback function(chatId, chatData)
   */
  onChatChange(callback) {
    this.onChatChangeCallbacks.push(callback);
  }

  /**
   * Notify all callbacks of chat change
   * @param {string} chatId - New chat ID
   */
  notifyChatChange(chatId) {
    const chatData = {
      chatId,
      phoneNumber: DOMUtils.extractPhoneNumber(chatId),
      chatName: DOMUtils.getChatName(),
      timestamp: Date.now()
    };

    // Dispatch custom event for sidebar
    window.dispatchEvent(new CustomEvent('whatsapp-crm:chat-changed', {
      detail: chatData
    }));

    // Call registered callbacks
    this.onChatChangeCallbacks.forEach(callback => {
      try {
        callback(chatId, chatData);
      } catch (e) {
        console.error('Error in chat change callback:', e);
      }
    });
  }

  /**
   * Get current chat ID
   * @returns {string|null}
   */
  getCurrentChatId() {
    return this.currentChatId;
  }

  /**
   * Cleanup observers
   */
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.onChatChangeCallbacks = [];
  }
}

// Initialize chat observer
const chatObserver = new ChatObserver();
chatObserver.init();

// Export for use in sidebar
window.whatsappCRM = window.whatsappCRM || {};
window.whatsappCRM.chatObserver = chatObserver;



