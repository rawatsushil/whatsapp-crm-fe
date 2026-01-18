/**
 * Page Context Script - Using window.require
 * Runs in the main page context to access WhatsApp's internal modules
 */

(function () {
  console.log('WhatsApp CRM: Page script loaded');

  window.WACRM = {
    ChatCollection: null,
    Cmd: null,
    isReady: false
  };

  /**
   * Initialize the bridge using window.require
   */
  function initBridge() {
    console.log('WhatsApp CRM: Initializing bridge...');

    if (typeof window.require !== 'function') {
      console.error('WhatsApp CRM: window.require is not available');
      return;
    }

    try {
      const chatCollectionModule = window.require('WAWebChatCollection');
      const cmdModule = window.require('WAWebCmd');

      const chatCollection = chatCollectionModule?.ChatCollection;
      const cmd = cmdModule?.Cmd;

      if (chatCollection && cmd) {
        window.WACRM.ChatCollection = chatCollection;
        window.WACRM.Cmd = cmd;
        window.WACRM.isReady = true;
        console.log('WhatsApp CRM: Bridge is READY');
        window.postMessage({ type: 'WA_CRM_STORE_READY' }, '*');
      } else {
        console.log('WhatsApp CRM: Modules not available yet, retrying...');
        setTimeout(initBridge, 2000);
      }
    } catch (e) {
      console.error('WhatsApp CRM: Error initializing bridge:', e);
      setTimeout(initBridge, 2000);
    }
  }

  /**
   * Open a specific chat without refresh
   */
  async function openChat(chatId) {
    console.log('WhatsApp CRM: Opening chat:', chatId);

    if (!window.WACRM.isReady) {
      console.warn('WhatsApp CRM: Bridge not ready');
      return false;
    }

    try {
      const { ChatCollection, Cmd } = window.WACRM;

      // Find the chat in the collection
      let chat = ChatCollection._models.find(c => c.id?._serialized === chatId);

      if (!chat) {
        // Try to find by phone number
        const phoneNumber = chatId.replace('@c.us', '').replace('@g.us', '');
        chat = ChatCollection._models.find(c => c.id?._serialized?.includes(phoneNumber));
      }

      if (chat) {
        console.log('WhatsApp CRM: Found chat, opening...');
        // The correct API: pass an object with chat property
        Cmd.openChatAt({ chat: chat });
        return true;
      } else {
        console.warn('WhatsApp CRM: Chat not found in collection:', chatId);
        return false;
      }
    } catch (e) {
      console.error('WhatsApp CRM: Error opening chat:', e);
      return false;
    }
  }

  // Listen for messages from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    const { type, chatId } = event.data || {};

    if (type === 'WA_CRM_OPEN_CHAT' && chatId) {
      const success = await openChat(chatId);
      window.postMessage({ type: 'WA_CRM_OPEN_CHAT_RESULT', success, chatId }, '*');
    }
  });

  // Initialize when ready
  if (document.readyState === 'complete') {
    setTimeout(initBridge, 2000);
  } else {
    window.addEventListener('load', () => setTimeout(initBridge, 2000));
  }
})();
