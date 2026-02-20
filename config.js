/**
 * Extension Configuration
 * Change API_BASE_URL before deploying to production
 */

const CONFIG = {
  // ============================================
  // CHANGE THIS URL AFTER VERCEL DEPLOYMENT
  // Example: 'https://whatsapp-crm.vercel.app/api'
  // ============================================
  // API_BASE_URL: 'http://localhost:3000/api',
  API_BASE_URL: 'https://whatsapp-crm-roan.vercel.app/api',
  
  // Set to true for production
  IS_PRODUCTION: true
};

// Make config available globally for content scripts
if (typeof window !== 'undefined') {
  window.WHATSAPP_CRM_CONFIG = CONFIG;
}

// Store API URL in chrome.storage for background script access
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.set({ apiBaseUrl: CONFIG.API_BASE_URL });
}

