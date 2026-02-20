/**
 * Sidebar Injector - Injects CRM sidebar into WhatsApp Web
 */

class SidebarInjector {
  constructor() {
    this.sidebar = null;
    this.isVisible = false;
    this.apiBaseUrl = (window.WHATSAPP_CRM_CONFIG?.API_BASE_URL) || 'http://localhost:3000/api';
    this.activeTab = 'overview'; // 'overview' or 'chat'
    this.workQueueData = {
      counts: { new_lead: 0, follow_up: 0, paid: 0, closed: 0 },
      followUps: [],
      newLeads: []
    };
    this.storeBridgeReady = false;
  }

  /**
   * Initialize sidebar injection
   */
  init() {
    // Wait for WhatsApp to load
    if (!DOMUtils.isWhatsAppLoaded()) {
      setTimeout(() => this.init(), 1000);
      return;
    }

    // Create sidebar
    this.createSidebar();

    // Add toggle button
    this.addToggleButton();

    // Check for version updates
    this.checkVersion();

    // Listen for chat changes
    window.addEventListener('whatsapp-crm:chat-changed', (e) => {
      this.onChatChanged(e.detail);
    });

    // Inject page-context script and set up bridge
    this.setupBridge();
  }

  /**
   * Get current extension version from manifest
   */
  getCurrentVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return '1.0.0';
    }
  }

  /**
   * Check for version updates
   */
  async checkVersion() {
    const currentVersion = this.getCurrentVersion();
    
    // Update version badge in header
    const versionBadge = this.sidebar.querySelector('#crm-version-badge');
    if (versionBadge) {
      versionBadge.textContent = `v${currentVersion}`;
    }

    // Check if we should skip the update check (dismissed recently)
    const { updateDismissedAt } = await chrome.storage.local.get(['updateDismissedAt']);
    const dismissedRecently = updateDismissedAt && (Date.now() - updateDismissedAt) < 24 * 60 * 60 * 1000; // 24 hours

    try {
      const response = await fetch(`${this.apiBaseUrl}/version/check?current=${currentVersion}`);
      
      if (!response.ok) {
        console.log('Version check failed:', response.status);
        return;
      }

      const versionInfo = await response.json();
      
      if (versionInfo.updateType === 'hard') {
        // Show hard block modal
        this.showUpdateModal(versionInfo);
      } else if (versionInfo.updateType === 'soft' && !dismissedRecently) {
        // Show soft nudge banner
        this.showUpdateBanner(versionInfo);
      }
    } catch (error) {
      console.log('Version check error (server may be offline):', error.message);
    }
  }

  /**
   * Show update banner (soft nudge)
   */
  showUpdateBanner(versionInfo) {
    const banner = this.sidebar.querySelector('#crm-update-banner');
    const versionEl = this.sidebar.querySelector('#crm-update-version');
    const updateBtn = this.sidebar.querySelector('#crm-update-btn');
    const dismissBtn = this.sidebar.querySelector('#crm-update-dismiss');

    if (!banner) return;

    if (versionEl) versionEl.textContent = `v${versionInfo.latestVersion}`;
    
    if (updateBtn) {
      updateBtn.onclick = () => {
        window.open(versionInfo.downloadUrl, '_blank');
      };
    }

    if (dismissBtn) {
      dismissBtn.onclick = async () => {
        banner.style.display = 'none';
        await chrome.storage.local.set({ updateDismissedAt: Date.now() });
      };
    }

    banner.style.display = 'block';
  }

  /**
   * Show update modal (hard block)
   */
  showUpdateModal(versionInfo) {
    const modal = this.sidebar.querySelector('#crm-update-modal');
    const currentVersionEl = this.sidebar.querySelector('#crm-current-version');
    const requiredVersionEl = this.sidebar.querySelector('#crm-required-version');
    const notesEl = this.sidebar.querySelector('#crm-update-notes');
    const updateBtn = this.sidebar.querySelector('#crm-update-modal-btn');

    if (!modal) return;

    if (currentVersionEl) currentVersionEl.textContent = `v${this.getCurrentVersion()}`;
    if (requiredVersionEl) requiredVersionEl.textContent = `v${versionInfo.minVersion}`;
    
    if (notesEl && versionInfo.releaseNotes) {
      notesEl.innerHTML = `<strong>What's new:</strong><br>${versionInfo.releaseNotes.replace(/\n/g, '<br>')}`;
    }

    if (updateBtn) {
      updateBtn.href = versionInfo.downloadUrl;
    }

    modal.style.display = 'flex';
  }

  /**
   * Set up the page-context bridge for non-refreshing chat opening
   */
  setupBridge() {
    // Listen for bridge ready message
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const { type, myNumber } = event.data || {};
      
      if (type === 'WA_CRM_STORE_READY') {
        console.log('WhatsApp CRM: Bridge is ready, myNumber:', myNumber);
        this.storeBridgeReady = true;
        
        // Store detected number if available
        if (myNumber) {
          this.detectedNumber = myNumber;
          this.checkOnboardingNeeded();
        }
      }
      
      if (type === 'WA_CRM_MY_NUMBER') {
        console.log('WhatsApp CRM: Received my number:', myNumber);
        if (myNumber) {
          this.detectedNumber = myNumber;
          this.checkOnboardingNeeded();
        }
      }
    });

    // Inject the page-context script
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/page-script.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
      console.log('WhatsApp CRM: Page script injected');
    } catch (e) {
      console.error('WhatsApp CRM: Failed to inject page script', e);
    }
    
    // Also try DOM-based detection after a delay
    setTimeout(() => {
      if (!this.detectedNumber) {
        const domNumber = DOMUtils.detectOwnNumber();
        if (domNumber) {
          console.log('WhatsApp CRM: Detected number from DOM:', domNumber);
          this.detectedNumber = domNumber;
          this.checkOnboardingNeeded();
        }
      }
    }, 3000);
  }

  /**
   * Check if onboarding is needed and show it
   */
  async checkOnboardingNeeded() {
    const { whatsappNumber } = await chrome.storage.local.get(['whatsappNumber']);
    
    if (!whatsappNumber && this.detectedNumber) {
      // Show onboarding with detected number
      this.showOnboarding(this.detectedNumber);
    }
  }

  /**
   * Show onboarding modal with detected number
   */
  showOnboarding(number) {
    const onboardingSection = this.sidebar.querySelector('#crm-onboarding-section');
    const authSection = this.sidebar.querySelector('#crm-auth-section');
    const mainContent = this.sidebar.querySelector('#crm-main-content');
    const detectedNumberEl = this.sidebar.querySelector('#crm-detected-number');
    
    // Format number for display
    const formattedNumber = this.formatPhoneNumber(number);
    if (detectedNumberEl) {
      detectedNumberEl.textContent = formattedNumber;
    }
    
    // Show onboarding, hide others
    if (onboardingSection) onboardingSection.style.display = 'block';
    if (authSection) authSection.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    
    // Auto-show sidebar if not visible
    if (!this.isVisible) {
      this.show();
    }
  }

  /**
   * Format phone number for display
   */
  formatPhoneNumber(number) {
    if (!number) return '';
    // Remove any non-digit characters
    const digits = number.replace(/\D/g, '');
    
    // Format as +XX XXX XXX XXXX (for Indian numbers starting with 91)
    if (digits.startsWith('91') && digits.length >= 12) {
      return `+91 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    
    // Generic format
    if (digits.length >= 10) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    
    return `+${digits}`;
  }

  /**
   * Confirm the detected WhatsApp number and auto-authenticate
   */
  async confirmNumber(number) {
    try {
      // Save the number to storage
      await chrome.storage.local.set({ whatsappNumber: number });
      console.log('WhatsApp CRM: Number confirmed and saved:', number);
      
      // Auto-register/login with this WhatsApp number
      await this.autoAuthenticate(number);
    } catch (error) {
      console.error('Error saving number:', error);
      const errorEl = this.sidebar.querySelector('#crm-onboarding-error');
      if (errorEl) {
        errorEl.textContent = 'Failed to save. Please try again.';
        errorEl.style.display = 'block';
      }
    }
  }

  /**
   * Auto-authenticate user with WhatsApp number
   */
  async autoAuthenticate(whatsappNumber) {
    try {
      // Try to register/login with WhatsApp number
      const response = await fetch(`${this.apiBaseUrl}/auth/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ whatsappNumber })
      });

      const data = await response.json();

      if (response.ok) {
        // Store token
        await chrome.storage.local.set({ token: data.token });
        console.log('WhatsApp CRM: Auto-authenticated successfully');
        
        // Show main UI
        this.showMainUI();
      } else {
        console.error('Auto-authentication failed:', data.error);
        // Still show main UI, will work in offline mode
        this.showMainUI();
      }
    } catch (error) {
      console.error('Error during auto-authentication:', error);
      // Still show main UI even if backend is down
      this.showMainUI();
    }
  }

  /**
   * Create sidebar element
   */
  createSidebar() {
    // Check if sidebar already exists
    if (document.getElementById('whatsapp-crm-sidebar')) {
      return;
    }

    const sidebar = document.createElement('div');
    sidebar.id = 'whatsapp-crm-sidebar';
    sidebar.className = 'whatsapp-crm-sidebar';
    sidebar.innerHTML = this.getSidebarHTML();

    // Find WhatsApp's main panel to inject sidebar
    const mainPanel = DOMUtils.safeQuerySelector([
      '[data-testid="chat-panel"]',
      '[role="main"]',
      '#main'
    ]);

    if (mainPanel) {
      // Insert sidebar into main panel
      mainPanel.style.position = 'relative';
      mainPanel.appendChild(sidebar);
    } else {
      // Fallback: append to body
      document.body.appendChild(sidebar);
    }

    this.sidebar = sidebar;
    this.attachEventListeners();
  }

  /**
   * Get sidebar HTML
   */
  getSidebarHTML() {
    return `
      <div class="crm-sidebar-header">
        <h3>CRM</h3>
        <button class="crm-close-btn" id="crm-close-btn">×</button>
      </div>
      
      <!-- Update Banner (Soft Nudge) -->
      <div id="crm-update-banner" class="crm-update-banner" style="display: none;">
        <div class="crm-update-banner-content">
          <span class="crm-update-icon">🚀</span>
          <div class="crm-update-text">
            <strong>Update available!</strong>
            <span id="crm-update-version">v1.1.0</span>
          </div>
          <button class="crm-update-btn" id="crm-update-btn">Update</button>
          <button class="crm-update-dismiss" id="crm-update-dismiss">×</button>
        </div>
      </div>

      <!-- Hard Block Modal -->
      <div id="crm-update-modal" class="crm-update-modal" style="display: none;">
        <div class="crm-update-modal-content">
          <div class="crm-update-modal-icon">⚠️</div>
          <h3>Update Required</h3>
          <p>Your version is outdated and no longer supported. Please update to continue using WhatsApp CRM.</p>
          <div class="crm-update-modal-versions">
            <span>Your version: <strong id="crm-current-version">v1.0.0</strong></span>
            <span>Required: <strong id="crm-required-version">v1.1.0</strong></span>
          </div>
          <div class="crm-update-modal-notes" id="crm-update-notes"></div>
          <a href="#" class="crm-btn-primary crm-update-modal-btn" id="crm-update-modal-btn" target="_blank">Update Now</a>
        </div>
      </div>

      <!-- Onboarding Section (Number Detection) -->
      <div id="crm-onboarding-section" class="crm-sidebar-content" style="display: none;">
        <div class="crm-onboarding">
          <div class="crm-onboarding-icon">📱</div>
          <h4 class="crm-onboarding-title">Welcome to WhatsApp CRM!</h4>
          <p class="crm-onboarding-text">We detected your WhatsApp number:</p>
          <div class="crm-onboarding-number" id="crm-detected-number">+91 XXX XXX XXXX</div>
          <p class="crm-onboarding-subtext">This number will be used to save your CRM data. Different WhatsApp accounts will have separate data.</p>
          <button class="crm-btn-primary crm-onboarding-confirm" id="crm-confirm-number">Yes, use this number</button>
          <button class="crm-btn-secondary crm-onboarding-manual" id="crm-manual-number">Enter manually</button>
          <div id="crm-manual-number-form" class="crm-manual-form" style="display: none;">
            <input type="tel" id="crm-manual-number-input" class="crm-input" placeholder="Enter your WhatsApp number (e.g., 919876543210)" />
            <button class="crm-btn-primary" id="crm-save-manual-number">Save</button>
          </div>
          <div id="crm-onboarding-error" class="crm-error" style="display: none;"></div>
        </div>
      </div>

      <!-- Main CRM Content -->
      <div id="crm-main-content" class="crm-sidebar-content" style="display: none;">
        <!-- Tabs -->
        <div class="crm-tabs-container">
          <button class="crm-main-tab active" data-tab="overview" id="crm-tab-overview">
            Overview
            <span class="crm-tab-badge" id="crm-overview-badge" style="display: none;"></span>
          </button>
          <button class="crm-main-tab" data-tab="chat" id="crm-tab-chat">Chat</button>
        </div>

        

        <!-- Overview Tab -->
        <div id="crm-tab-content-overview" class="crm-tab-content active">
          <!-- Accordion: New Leads (expanded by default) -->
          <div class="crm-accordion expanded" data-status="new_lead">
            <div class="crm-accordion-header" data-toggle="new_lead">
              <span class="crm-accordion-icon">🟢</span>
              <span class="crm-accordion-label">New Leads</span>
              <span class="crm-accordion-count" id="crm-count-new-lead">0</span>
              <span class="crm-accordion-arrow">▼</span>
            </div>
            <div class="crm-accordion-content" id="crm-list-new-lead">
              <div class="crm-empty-state">No new leads</div>
            </div>
          </div>

          <!-- Accordion: Follow-ups (expanded by default) -->
          <div class="crm-accordion expanded" data-status="follow_up">
            <div class="crm-accordion-header" data-toggle="follow_up">
              <span class="crm-accordion-icon">🟡</span>
              <span class="crm-accordion-label">Follow-ups</span>
              <span class="crm-accordion-badge" id="crm-follow-up-badge" style="display: none;">(0 due)</span>
              <span class="crm-accordion-count" id="crm-count-follow-up">0</span>
              <span class="crm-accordion-arrow">▼</span>
            </div>
            <div class="crm-accordion-content" id="crm-list-follow-up">
              <div class="crm-empty-state">No follow-ups</div>
            </div>
          </div>

          <!-- Accordion: Paid -->
          <div class="crm-accordion" data-status="paid">
            <div class="crm-accordion-header" data-toggle="paid">
              <span class="crm-accordion-icon">🔵</span>
              <span class="crm-accordion-label">Paid</span>
              <span class="crm-accordion-count" id="crm-count-paid">0</span>
              <span class="crm-accordion-arrow">▼</span>
            </div>
            <div class="crm-accordion-content" id="crm-list-paid">
              <div class="crm-empty-state">No paid chats</div>
            </div>
          </div>

          <!-- Accordion: Closed -->
          <div class="crm-accordion" data-status="closed">
            <div class="crm-accordion-header" data-toggle="closed">
              <span class="crm-accordion-icon">⚫</span>
              <span class="crm-accordion-label">Closed</span>
              <span class="crm-accordion-count" id="crm-count-closed">0</span>
              <span class="crm-accordion-arrow">▼</span>
            </div>
            <div class="crm-accordion-content" id="crm-list-closed">
              <div class="crm-empty-state">No closed chats</div>
            </div>
          </div>
        </div>

        <!-- Chat Tab -->
        <div id="crm-tab-content-chat" class="crm-tab-content">
          <!-- Chat Header -->
          <div class="crm-chat-header-compact">
            <div class="crm-chat-info">
              <span class="crm-chat-label">Chat:</span>
              <span class="crm-chat-name" id="crm-chat-name">No chat selected</span>
            </div>
          </div>

          <div class="crm-divider"></div>

          <!-- Status Selector -->
          <div class="crm-section-compact">
            <div class="crm-section-header">
              <span class="crm-section-icon">📊</span>
              <span class="crm-section-label">Status:</span>
              
            </div>
            <select id="crm-status-selector" class="crm-select-compact">
              <option value="">No status</option>
              <option value="new_lead">🟢 New Lead</option>
              <option value="follow_up">🟡 Follow-up</option>
              <option value="paid">🔵 Paid</option>
              <option value="closed">⚫ Closed</option>
            </select>
          </div>

          <div class="crm-divider"></div>

          <!-- Notes Section -->
          <div class="crm-section-compact">
            <div class="crm-section-header">
              <span class="crm-section-icon">📝</span>
              <span class="crm-section-label">Notes</span>
            </div>
            <textarea 
              id="crm-notes-input" 
              class="crm-notes-input-compact" 
              placeholder="Internal notes (not sent to customer)..."
              rows="3"
            ></textarea>
          </div>

          <div class="crm-divider"></div>

          <!-- Follow-up Reminder -->
          <div class="crm-section-compact">
            <div class="crm-section-header">
              <span class="crm-section-icon">⏰</span>
              <span class="crm-section-label">Reminder</span>
            </div>
            <button class="crm-reminder-btn-compact" id="crm-set-reminder-btn">Set follow-up</button>
            <div id="crm-reminder-display" class="crm-reminder-display-compact" style="display: none;">
              <span id="crm-reminder-text"></span>
              <button class="crm-reminder-remove" id="crm-reminder-remove">×</button>
            </div>
          </div>

        </div>
      </div>

      <!-- Reminder Modal -->
      <div id="crm-reminder-modal" class="crm-modal" style="display: none;">
        <div class="crm-modal-content">
          <div class="crm-modal-header">
            <h4>Set Follow-up Reminder</h4>
            <button class="crm-modal-close" id="crm-reminder-modal-close">×</button>
          </div>
          <div class="crm-modal-body">
            <div class="crm-form-group">
              <label>Date</label>
              <input type="date" id="crm-reminder-date" class="crm-input" />
            </div>
            <div class="crm-form-group">
              <label>Time</label>
              <input type="time" id="crm-reminder-time" class="crm-input" />
            </div>
            <div class="crm-form-group">
              <label>Message (optional)</label>
              <input type="text" id="crm-reminder-message" class="crm-input" placeholder="Reminder message" />
            </div>
          </div>
          <div class="crm-modal-footer">
            <button class="crm-btn-secondary" id="crm-reminder-modal-cancel">Cancel</button>
            <button class="crm-btn-primary" id="crm-reminder-modal-save">Save</button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="crm-sidebar-footer">
        <span class="crm-version-badge" id="crm-version-badge">v1.0.0</span>
      </div>
    `;
  }

  /**
   * Attach event listeners to sidebar
   */
  attachEventListeners() {
    // Close button
    const closeBtn = this.sidebar.querySelector('#crm-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }

    // Onboarding: Confirm number button
    const confirmNumberBtn = this.sidebar.querySelector('#crm-confirm-number');
    if (confirmNumberBtn) {
      confirmNumberBtn.addEventListener('click', () => {
        if (this.detectedNumber) {
          this.confirmNumber(this.detectedNumber);
        }
      });
    }

    // Onboarding: Manual number button
    const manualNumberBtn = this.sidebar.querySelector('#crm-manual-number');
    if (manualNumberBtn) {
      manualNumberBtn.addEventListener('click', () => {
        const manualForm = this.sidebar.querySelector('#crm-manual-number-form');
        if (manualForm) {
          manualForm.style.display = manualForm.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    // Onboarding: Save manual number
    const saveManualBtn = this.sidebar.querySelector('#crm-save-manual-number');
    if (saveManualBtn) {
      saveManualBtn.addEventListener('click', () => {
        const input = this.sidebar.querySelector('#crm-manual-number-input');
        const errorEl = this.sidebar.querySelector('#crm-onboarding-error');
        const number = input?.value.replace(/\D/g, '');
        
        if (!number || number.length < 10) {
          if (errorEl) {
            errorEl.textContent = 'Please enter a valid phone number (at least 10 digits)';
            errorEl.style.display = 'block';
          }
          return;
        }
        
        this.confirmNumber(number);
      });
    }

    // Main tabs (Overview/Chat)
    const mainTabs = this.sidebar.querySelectorAll('.crm-main-tab');
    mainTabs.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab || e.target.closest('.crm-main-tab').dataset.tab;
        this.switchTab(tab);
      });
    });

    // Status selector (Chat tab)
    const statusSelector = this.sidebar.querySelector('#crm-status-selector');
    if (statusSelector) {
      statusSelector.addEventListener('change', (e) => {
        this.setStatus(e.target.value);
      });
    }

    // Notes autosave (Chat tab)
    const notesInput = this.sidebar.querySelector('#crm-notes-input');
    if (notesInput) {
      notesInput.addEventListener('blur', () => {
        this.saveNotes();
      });
    }

    // Set reminder button (Chat tab)
    const setReminderBtn = this.sidebar.querySelector('#crm-set-reminder-btn');
    if (setReminderBtn) {
      setReminderBtn.addEventListener('click', () => {
        this.showReminderModal();
      });
    }

    // Reminder modal
    const reminderModalClose = this.sidebar.querySelector('#crm-reminder-modal-close');
    const reminderModalCancel = this.sidebar.querySelector('#crm-reminder-modal-cancel');
    if (reminderModalClose) {
      reminderModalClose.addEventListener('click', () => this.hideReminderModal());
    }
    if (reminderModalCancel) {
      reminderModalCancel.addEventListener('click', () => this.hideReminderModal());
    }

    const reminderModalSave = this.sidebar.querySelector('#crm-reminder-modal-save');
    if (reminderModalSave) {
      reminderModalSave.addEventListener('click', () => this.saveReminderFromModal());
    }

    const reminderRemove = this.sidebar.querySelector('#crm-reminder-remove');
    if (reminderRemove) {
      reminderRemove.addEventListener('click', () => this.removeReminder());
    }

    // Accordion toggle handlers
    const accordionHeaders = this.sidebar.querySelectorAll('.crm-accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const accordion = header.closest('.crm-accordion');
        accordion.classList.toggle('expanded');
      });
    });

    // Check authentication status on init
    this.checkAuthStatus();

    // Load saved tab preference
    this.loadTabPreference();
  }

  /**
   * Check if user has completed onboarding and show appropriate UI
   */
  async checkAuthStatus() {
    const { whatsappNumber, token } = await chrome.storage.local.get(['whatsappNumber', 'token']);

    // Check if onboarding is needed (no WhatsApp number saved)
    if (!whatsappNumber) {
      // Try to detect number if not already detected
      if (!this.detectedNumber) {
        window.postMessage({ type: 'WA_CRM_GET_MY_NUMBER' }, '*');
      } else {
        this.showOnboarding(this.detectedNumber);
      }
      return;
    }

    // WhatsApp number is confirmed
    // Auto-authenticate if no token yet
    if (!token) {
      await this.autoAuthenticate(whatsappNumber);
    } else {
      this.showMainUI();
    }
  }

  /**
   * Show main CRM UI
   */
  async showMainUI() {
    const onboardingSection = this.sidebar.querySelector('#crm-onboarding-section');
    const mainContent = this.sidebar.querySelector('#crm-main-content');
    const userWhatsappEl = this.sidebar.querySelector('#crm-user-whatsapp');

    if (onboardingSection) onboardingSection.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    
    // Display WhatsApp number
    const { whatsappNumber } = await chrome.storage.local.get(['whatsappNumber']);
    if (userWhatsappEl && whatsappNumber) {
      userWhatsappEl.textContent = this.formatPhoneNumber(whatsappNumber);
    }

    // Load Overview data
    if (this.activeTab === 'overview') {
      this.loadOverviewData();
    }
  }

  /**
   * Switch between Overview and Chat tabs
   */
  switchTab(tab) {
    if (tab !== 'overview' && tab !== 'chat') return;

    this.activeTab = tab;

    // Update tab buttons
    const tabButtons = this.sidebar.querySelectorAll('.crm-main-tab');
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab content
    const overviewContent = this.sidebar.querySelector('#crm-tab-content-overview');
    const chatContent = this.sidebar.querySelector('#crm-tab-content-chat');

    if (overviewContent) overviewContent.classList.toggle('active', tab === 'overview');
    if (chatContent) chatContent.classList.toggle('active', tab === 'chat');

    // Load data for active tab
    if (tab === 'overview') {
      this.loadOverviewData();
    } else if (tab === 'chat') {
      // Chat tab data loads automatically on chat change
      const chatId = chatObserver.getCurrentChatId();
      if (chatId) {
        this.loadChatData(chatId);
      }
    }

    // Save tab preference
    this.saveTabPreference(tab);
  }

  /**
   * Load saved tab preference
   */
  async loadTabPreference() {
    const { activeTab } = await chrome.storage.local.get(['activeTab']);
    if (activeTab && (activeTab === 'overview' || activeTab === 'chat')) {
      this.switchTab(activeTab);
    }
  }

  /**
   * Save tab preference
   */
  async saveTabPreference(tab) {
    await chrome.storage.local.set({ activeTab: tab });
  }

  /**
   * Load Overview tab data (all accordions)
   */
  async loadOverviewData() {
    try {
      let { token, whatsappNumber } = await chrome.storage.local.get(['token', 'whatsappNumber']);
      
      // If no token but have WhatsApp number, try to authenticate
      if (!token && whatsappNumber) {
        console.log('No token for overview, attempting auto-authentication...');
        await this.autoAuthenticate(whatsappNumber);
        const storage = await chrome.storage.local.get(['token']);
        token = storage.token;
      }
      
      if (!token) {
        console.warn('Cannot load overview - not authenticated');
        return;
      }

      // Fetch all chats with tags
      const [newLeads, followUps, paid, closed] = await Promise.all([
        this.fetchChatsByTag('new_lead'),
        this.fetchChatsByTag('follow_up'),
        this.fetchChatsByTag('paid'),
        this.fetchChatsByTag('closed')
      ]);

      // Update counts
      this.updateCounts({
        new_lead: newLeads.length,
        follow_up: followUps.length,
        paid: paid.length,
        closed: closed.length
      });

      // Update accordion lists
      this.updateAccordionList('new_lead', newLeads);
      this.updateAccordionList('follow_up', followUps);
      this.updateAccordionList('paid', paid);
      this.updateAccordionList('closed', closed);

      // Check for due reminders
      this.checkDueReminders(followUps);
    } catch (error) {
      console.error('Error loading overview data:', error);
    }
  }

  /**
   * Fetch chats by tag
   */
  async fetchChatsByTag(tag) {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return [];

      const response = await fetch(`${this.apiBaseUrl}/chats?tag=${tag}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error(`Error fetching chats for tag ${tag}:`, error);
      return [];
    }
  }

  /**
   * Update summary counters
   */
  updateCounts(counts) {
    const countEls = {
      new_lead: this.sidebar.querySelector('#crm-count-new-lead'),
      follow_up: this.sidebar.querySelector('#crm-count-follow-up'),
      paid: this.sidebar.querySelector('#crm-count-paid'),
      closed: this.sidebar.querySelector('#crm-count-closed')
    };

    Object.keys(counts).forEach(tag => {
      if (countEls[tag]) {
        countEls[tag].textContent = counts[tag];
      }
    });
  }

  /**
   * Update accordion list for a status
   */
  updateAccordionList(status, chats) {
    const listEl = this.sidebar.querySelector(`#crm-list-${status.replace('_', '-')}`);
    if (!listEl) return;

    const emptyLabels = {
      new_lead: 'No new leads',
      follow_up: 'No follow-ups',
      paid: 'No paid chats',
      closed: 'No closed chats'
    };

    if (chats.length === 0) {
      listEl.innerHTML = `<div class="crm-empty-state">${emptyLabels[status] || 'No chats'}</div>`;
      return;
    }

    // Sort by urgency: reminders due first, then oldest last activity
    const sorted = chats.sort((a, b) => {
      const aHasReminder = a.reminders && a.reminders.length > 0;
      const bHasReminder = b.reminders && b.reminders.length > 0;
      if (aHasReminder && !bHasReminder) return -1;
      if (!aHasReminder && bHasReminder) return 1;

      const aTime = new Date(a.updated_at || a.created_at).getTime();
      const bTime = new Date(b.updated_at || b.created_at).getTime();
      return aTime - bTime;
    });

    listEl.innerHTML = sorted.map(chat => {
      const name = chat.chat_name || chat.phone_number || 'Unknown';
      const hasReminder = chat.reminders && chat.reminders.length > 0;
      const timeAgo = this.formatTimeAgo(new Date(chat.updated_at || chat.created_at));

      // Check if reminder is due today
      let reminderText = '';
      if (hasReminder) {
        const activeReminder = chat.reminders.find(r => !r.notified);
        if (activeReminder) {
          const reminderDate = new Date(activeReminder.reminderTime);
          const today = new Date();
          const isToday = reminderDate.toDateString() === today.toDateString();
          reminderText = isToday ? ' ⏰' : '';
        }
      }

      return `
        <div class="crm-accordion-item" data-chat-id="${chat.whatsapp_id}" data-chat-db-id="${chat.id}">
          <span class="crm-accordion-item-name">${this.escapeHtml(name)}</span>
          ${reminderText}
          <span class="crm-accordion-item-time">${timeAgo}</span>
          <button class="crm-accordion-item-delete" data-chat-db-id="${chat.id}" title="Remove from list">×</button>
        </div>
      `;
    }).join('');

    // Attach click handlers for opening chats
    listEl.querySelectorAll('.crm-accordion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't open chat if delete button was clicked
        if (e.target.classList.contains('crm-accordion-item-delete')) return;
        e.stopPropagation();
        const chatId = item.dataset.chatId;
        this.openChat(chatId);
      });
    });

    // Attach delete handlers
    listEl.querySelectorAll('.crm-accordion-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const chatDbId = btn.dataset.chatDbId;
        const item = btn.closest('.crm-accordion-item');
        const chatName = item.querySelector('.crm-accordion-item-name')?.textContent || 'this contact';
        
        if (confirm(`Remove "${chatName}" from this list?`)) {
          await this.deleteChat(chatDbId);
        }
      });
    });
  }

  /**
   * Open chat in WhatsApp Web
   */
  openChat(chatId) {

    const normalizedChatId = DOMUtils.normalizeChatId(chatId);
    if (!normalizedChatId) return;
    this.switchTab('chat');


    const phoneNumber = DOMUtils.extractPhoneNumber(normalizedChatId);
    if (!phoneNumber) return;

    // Try to open via bridge first (no refresh)
    if (this.storeBridgeReady) {
      console.log('WhatsApp CRM: Opening chat via bridge:', normalizedChatId);
      window.postMessage({
        type: 'WA_CRM_OPEN_CHAT',
        chatId: normalizedChatId
      }, '*');
    } else {
      // Fallback: use legacy method (full refresh)
      console.log('WhatsApp CRM: Bridge not ready, using fallback');
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
      window.location.href = whatsappUrl;
    }
  }

  /**
   * Delete (soft delete) a chat from the CRM
   * @param {string} chatDbId - Database ID of the chat
   */
  async deleteChat(chatDbId) {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) {
        console.warn('Not authenticated');
        return;
      }

      const response = await fetch(`${this.apiBaseUrl}/chats/${chatDbId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        console.log('Chat deleted successfully:', chatDbId);
        // Refresh the overview data to update the lists
        await this.loadOverviewData();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to delete chat:', response.status, errorData);
        alert('Failed to remove contact. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('Failed to remove contact. Please try again.');
    }
  }


  /**
   * Format time ago (compact format)
   */
  formatTimeAgo(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    // Check if today
    if (dateOnly.getTime() === today.getTime()) {
      if (hours < 1) return `${minutes}m ago`;
      return `${hours}h ago`;
    }

    // Check if yesterday
    if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }

    // Days ago
    if (days < 7) {
      return `${days}d ago`;
    }

    // Older dates
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check for due reminders and show badge
   */
  checkDueReminders(chats) {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dueTodayCount = 0;

    chats.forEach(chat => {
      if (chat.reminders && chat.reminders.length > 0) {
        chat.reminders.forEach(r => {
          if (!r.notified) {
            const reminderDate = new Date(r.reminderTime);
            reminderDate.setHours(0, 0, 0, 0);
            if (reminderDate.getTime() === today.getTime()) {
              dueTodayCount++;
            }
          }
        });
      }
    });

    const badge = this.sidebar.querySelector('#crm-overview-badge');
    const followUpBadge = this.sidebar.querySelector('#crm-follow-up-badge');

    if (badge) {
      badge.style.display = dueTodayCount > 0 ? 'inline-block' : 'none';
    }
    if (followUpBadge && dueTodayCount > 0) {
      followUpBadge.textContent = `(${dueTodayCount} due)`;
      followUpBadge.style.display = 'inline';
    } else if (followUpBadge) {
      followUpBadge.style.display = 'none';
    }
  }

  /**
   * Show error message
   */
  showError(errorEl, message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = message ? 'block' : 'none';
    }
  }

  /**
   * Add toggle button to WhatsApp UI
   */
  addToggleButton() {
    // Check if button already exists
    if (document.getElementById('whatsapp-crm-toggle')) {
      return;
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'whatsapp-crm-toggle';
    toggleBtn.className = 'whatsapp-crm-toggle';
    toggleBtn.innerHTML = '📋 CRM';
    toggleBtn.title = 'Toggle CRM Sidebar';

    toggleBtn.addEventListener('click', () => {
      this.toggle();
    });

    // Find WhatsApp's header or toolbar to add button
    const header = DOMUtils.safeQuerySelector([
      'header',
      '[data-testid="conversation-header"]',
      '[role="banner"]'
    ]);

    if (header) {
      header.style.position = 'relative';
      header.appendChild(toggleBtn);
    } else {
      // Fallback: add to top-right corner
      toggleBtn.style.position = 'fixed';
      toggleBtn.style.top = '10px';
      toggleBtn.style.right = '10px';
      toggleBtn.style.zIndex = '10000';
      document.body.appendChild(toggleBtn);
    }
  }

  /**
   * Toggle sidebar visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show sidebar
   */
  show() {
    if (this.sidebar) {
      this.sidebar.classList.add('visible');
      this.isVisible = true;
    }
  }

  /**
   * Hide sidebar
   */
  hide() {
    if (this.sidebar) {
      this.sidebar.classList.remove('visible');
      this.isVisible = false;
    }
  }

  /**
   * Handle chat change event
   */
  async onChatChanged(chatData) {
    if (!chatData.chatId) return;

    // Immediately show chat info from DOM while loading from backend
    if (this.activeTab === 'chat') {
      this.showChatFromDOM(chatData);
      await this.loadChatData(chatData.chatId);
    }

    // Refresh Overview if on Overview tab (counts might have changed)
    if (this.activeTab === 'overview') {
      this.loadOverviewData();
    }
  }

  /**
   * Load chat data (tag, notes, reminders)
   */
  async loadChatData(chatId) {
    try {
      // Get auth token and WhatsApp number from storage
      let { token, whatsappNumber } = await chrome.storage.local.get(['token', 'whatsappNumber']);
      
      // If no token but have WhatsApp number, try to authenticate
      if (!token && whatsappNumber) {
        console.log('No token found, attempting auto-authentication...');
        await this.autoAuthenticate(whatsappNumber);
        // Re-fetch token after auth attempt
        const storage = await chrome.storage.local.get(['token']);
        token = storage.token;
      }
      
      if (!token) {
        console.warn('Not authenticated - please complete setup');
        // Show a message in the UI
        this.showNotAuthenticatedMessage();
        return;
      }

      // Normalize chat ID (remove WhatsApp Web internal prefixes/suffixes)
      const normalizedChatId = DOMUtils.normalizeChatId(chatId);
      if (!normalizedChatId) {
        console.warn('Could not normalize chat ID:', chatId);
        return;
      }

      // Fetch chat data
      const response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(normalizedChatId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const chat = await response.json();
        this.updateSidebarUI(chat);
      } else if (response.status === 404) {
        // Chat not found, create new entry
        console.log('Chat not found, creating new chat:', normalizedChatId);
        await this.createChat(normalizedChatId);
        // Note: createChat will reload the data after creation
      } else if (response.status === 401) {
        // Token expired or invalid, try to re-authenticate
        console.log('Token invalid, re-authenticating...');
        if (whatsappNumber) {
          await this.autoAuthenticate(whatsappNumber);
          // Retry loading chat data
          await this.loadChatData(chatId);
        }
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Error loading chat:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error loading chat data:', error);
      this.showConnectionError();
    }
  }

  /**
   * Show chat info from DOM immediately (before backend loads)
   */
  showChatFromDOM(chatData) {
    const chatNameEl = this.sidebar.querySelector('#crm-chat-name');
    if (chatNameEl) {
      const name = chatData.chatName || DOMUtils.getChatName();
      const phoneNumber = chatData.phoneNumber || DOMUtils.extractPhoneNumber(chatData.chatId);
      
      if (name && phoneNumber) {
        chatNameEl.textContent = `${name} (${this.formatPhoneNumber(phoneNumber)})`;
      } else if (name) {
        chatNameEl.textContent = name;
      } else if (phoneNumber) {
        chatNameEl.textContent = this.formatPhoneNumber(phoneNumber);
      } else {
        chatNameEl.textContent = 'Loading...';
      }
    }
    
    // Reset status and notes while loading
    const statusSelector = this.sidebar.querySelector('#crm-status-selector');
    if (statusSelector) statusSelector.value = '';
    
    const statusIndicator = this.sidebar.querySelector('#crm-current-status');
    if (statusIndicator) statusIndicator.textContent = '';
    
    const notesInput = this.sidebar.querySelector('#crm-notes-input');
    if (notesInput) notesInput.value = '';
    
    // Hide reminder display
    const reminderDisplay = this.sidebar.querySelector('#crm-reminder-display');
    const setReminderBtn = this.sidebar.querySelector('#crm-set-reminder-btn');
    if (reminderDisplay) reminderDisplay.style.display = 'none';
    if (setReminderBtn) setReminderBtn.style.display = 'block';
  }

  /**
   * Show message when not authenticated
   */
  showNotAuthenticatedMessage() {
    const chatNameEl = this.sidebar.querySelector('#crm-chat-name');
    if (chatNameEl) {
      chatNameEl.textContent = 'Backend not connected';
    }
  }

  /**
   * Show connection error message
   */
  showConnectionError() {
    const chatNameEl = this.sidebar.querySelector('#crm-chat-name');
    if (chatNameEl) {
      chatNameEl.textContent = 'Connection error - check backend';
    }
  }

  /**
   * Update chat name if missing or placeholder
   */
  async updateChatNameIfNeeded(chat) {
    if (!chat || !chat.id) return;

    const isPlaceholder = (name) => {
      if (!name) return true;
      return /click here|contact info|tap here/i.test(name);
    };

    if (!isPlaceholder(chat.chat_name)) return;

    const newName = DOMUtils.getChatName();
    if (!newName || isPlaceholder(newName)) return;

    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      await fetch(`${this.apiBaseUrl}/chats/${chat.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chatName: newName })
      });
      // Update local object to reflect new name
      chat.chat_name = newName;
    } catch (error) {
      console.error('Error updating chat name:', error);
    }
  }

  /**
   * Create new chat entry
   */
  async createChat(chatId) {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) {
        console.warn('Not authenticated, cannot create chat');
        return;
      }

      // Always normalize the chat ID before storing
      const normalizedChatId = DOMUtils.normalizeChatId(chatId);
      if (!normalizedChatId) {
        console.error('Could not normalize chat ID for creation:', chatId);
        return;
      }

      const phoneNumber = DOMUtils.extractPhoneNumber(normalizedChatId);
      let chatName = DOMUtils.getChatName();

      // Filter out placeholder text
      if (chatName && (
        chatName.toLowerCase().includes('click here') ||
        chatName.toLowerCase().includes('contact info') ||
        chatName.toLowerCase().includes('tap here')
      )) {
        chatName = null; // Don't save placeholder text
      }

      console.log('Creating chat:', { rawChatId: chatId, normalizedChatId, chatName });

      const response = await fetch(`${this.apiBaseUrl}/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          whatsappId: normalizedChatId,
          chatName
        })
      });

      if (response.ok) {
        const chat = await response.json();
        console.log('Chat created successfully:', chat);
        // Update UI with the created chat (backend now returns full structure)
        this.updateSidebarUI(chat);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to create chat:', response.status, errorData);

        // If creation failed but chat might exist, try to fetch it
        if (response.status === 400 || response.status === 409) {
          console.log('Chat might already exist, fetching...');
          await this.loadChatData(normalizedChatId);
        }
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }

  /**
   * Update sidebar UI with chat data (Chat tab)
   */
  updateSidebarUI(chat) {
    // Update chat name with phone number if available
    const chatNameEl = this.sidebar.querySelector('#crm-chat-name');
    if (chatNameEl) {
      let name = chat.chat_name || 'Unknown';
      if (chat.phone_number && !chat.chat_name) {
        // Show phone number if no name
        name = `+91 ${chat.phone_number.substring(chat.phone_number.length - 9)}`;
      } else if (chat.chat_name && chat.phone_number) {
        // Show name with phone
        const shortPhone = chat.phone_number.length > 9
          ? `+91 ${chat.phone_number.substring(chat.phone_number.length - 9)}`
          : chat.phone_number;
        name = `${chat.chat_name} (${shortPhone})`;
      }
      chatNameEl.textContent = name;
    }

    // Update status selector and indicator
    const statusSelector = this.sidebar.querySelector('#crm-status-selector');
    const statusIndicator = this.sidebar.querySelector('#crm-current-status');
    if (statusSelector) {
      statusSelector.value = chat.tag || '';
    }
    if (statusIndicator) {
      const statusMap = {
        'new_lead': '🟢',
        'follow_up': '🟡',
        'paid': '🔵',
        'closed': '⚫'
      };
      statusIndicator.textContent = statusMap[chat.tag] || '';
    }

    // Update notes
    const notesInput = this.sidebar.querySelector('#crm-notes-input');
    if (notesInput) {
      if (chat.notes && chat.notes.length > 0) {
        notesInput.value = chat.notes[0].content;
      } else {
        notesInput.value = '';
      }
    }

    // Update reminder display
    this.updateReminderDisplay(chat.reminders || []);
  }

  /**
   * Update reminder display in Chat tab
   */
  updateReminderDisplay(reminders) {
    const displayEl = this.sidebar.querySelector('#crm-reminder-display');
    const textEl = this.sidebar.querySelector('#crm-reminder-text');
    const setBtn = this.sidebar.querySelector('#crm-set-reminder-btn');

    const activeReminder = reminders.find(r => !r.notified);

    if (activeReminder && displayEl && textEl) {
      const reminderDate = new Date(activeReminder.reminderTime);
      const formatted = reminderDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      textEl.textContent = `Reminder set for ${formatted}`;
      displayEl.style.display = 'flex';
      displayEl.dataset.reminderId = activeReminder.id; // Store ID for removal
      if (setBtn) setBtn.style.display = 'none';
    } else {
      if (displayEl) {
        displayEl.style.display = 'none';
        delete displayEl.dataset.reminderId;
      }
      if (setBtn) setBtn.style.display = 'block';
    }
  }

  /**
   * Remove the active reminder for current chat
   */
  async removeReminder() {
    const displayEl = this.sidebar.querySelector('#crm-reminder-display');
    const reminderId = displayEl?.dataset.reminderId;
    
    if (!reminderId) {
      console.warn('No reminder ID found to remove');
      return;
    }

    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      const response = await fetch(`${this.apiBaseUrl}/reminders/${reminderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Clear the display
        this.updateReminderDisplay([]);
        
        // Cancel the Chrome alarm if scheduled
        chrome.runtime.sendMessage({ 
          type: 'CANCEL_REMINDER', 
          reminderId: reminderId 
        });
        
        console.log('Reminder removed successfully');
      } else {
        console.error('Failed to remove reminder');
      }
    } catch (error) {
      console.error('Error removing reminder:', error);
    }
  }

  /**
   * Get normalized current chat ID
   * @returns {string|null} Normalized chat ID
   */
  getNormalizedChatId() {
    const rawChatId = chatObserver.getCurrentChatId();
    if (!rawChatId) return null;
    return DOMUtils.normalizeChatId(rawChatId);
  }

  /**
   * Set status (tag) for current chat
   */
  async setStatus(status) {
    const chatId = this.getNormalizedChatId();
    if (!chatId) return;

    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      const response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let chat;
      if (response.ok) {
        chat = await response.json();
      } else {
        // Create chat first
        await this.createChat(chatId);
        const newResponse = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        chat = await newResponse.json();
      }

      // Update tag
      const updateResponse = await fetch(`${this.apiBaseUrl}/chats/${chat.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tag: status || null })
      });

      if (updateResponse.ok) {
        // Update Overview counts if on Overview tab
        if (this.activeTab === 'overview') {
          this.loadOverviewData();
        }

        // Reload chat data to update UI
        await this.loadChatData(chatId);
      }
    } catch (error) {
      console.error('Error setting status:', error);
    }
  }

  /**
   * Save notes for current chat
   */
  async saveNotes() {
    const chatId = this.getNormalizedChatId();
    if (!chatId) return;

    const notesInput = this.sidebar.querySelector('#crm-notes-input');
    const content = notesInput?.value.trim();
    if (!content) return;

    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      // Get or create chat
      let response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let chat;
      if (response.ok) {
        chat = await response.json();
      } else {
        await this.createChat(chatId);
        response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        chat = await response.json();
      }

      // Save note (autosave on blur)
      await fetch(`${this.apiBaseUrl}/chats/${chat.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  }

  /**
   * Show reminder modal
   */
  showReminderModal() {
    const modal = this.sidebar.querySelector('#crm-reminder-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Set default date to today
      const dateInput = this.sidebar.querySelector('#crm-reminder-date');
      if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
      }
    }
  }

  /**
   * Hide reminder modal
   */
  hideReminderModal() {
    const modal = this.sidebar.querySelector('#crm-reminder-modal');
    if (modal) {
      modal.style.display = 'none';
      // Clear inputs
      const dateInput = this.sidebar.querySelector('#crm-reminder-date');
      const timeInput = this.sidebar.querySelector('#crm-reminder-time');
      const messageInput = this.sidebar.querySelector('#crm-reminder-message');
      if (dateInput) dateInput.value = '';
      if (timeInput) timeInput.value = '';
      if (messageInput) messageInput.value = '';
    }
  }

  /**
   * Save reminder from modal
   */
  async saveReminderFromModal() {
    const chatId = this.getNormalizedChatId();
    if (!chatId) {
      alert('Please select a chat first');
      this.hideReminderModal();
      return;
    }

    const dateInput = this.sidebar.querySelector('#crm-reminder-date');
    const timeInput = this.sidebar.querySelector('#crm-reminder-time');
    const messageInput = this.sidebar.querySelector('#crm-reminder-message');

    const date = dateInput?.value;
    const time = timeInput?.value;

    if (!date || !time) {
      alert('Please select both date and time');
      return;
    }

    // Create date in local timezone, then convert to ISO for storage
    const reminderTime = new Date(`${date}T${time}`).toISOString();
    const message = messageInput?.value || '';

    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      // Get or create chat
      let response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let chat;
      if (response.ok) {
        chat = await response.json();
      } else {
        await this.createChat(chatId);
        response = await fetch(`${this.apiBaseUrl}/chats?whatsappId=${encodeURIComponent(chatId)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        chat = await response.json();
      }

      // Save reminder
      const reminderResponse = await fetch(`${this.apiBaseUrl}/chats/${chat.id}/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reminderTime,
          message
        })
      });

      if (reminderResponse.ok) {
        const savedReminder = await reminderResponse.json();
        
        // Hide modal
        this.hideReminderModal();

        // Reload chat data to update reminder display
        await this.loadChatData(chatId);

        // Schedule notification in background
        chrome.runtime.sendMessage({
          type: 'SCHEDULE_REMINDER',
          reminder: {
            id: savedReminder.id,
            reminderTime: reminderTime,
            message: message,
            chatId: chatId
          }
        });
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
    }
  }

  /**
   * Update reminders list in UI
   */
  updateRemindersList(reminders) {
    const remindersList = this.sidebar.querySelector('#crm-active-reminders');
    if (!remindersList) return;

    if (reminders.length === 0) {
      remindersList.innerHTML = '<div class="crm-empty">No reminders</div>';
      return;
    }

    remindersList.innerHTML = reminders
      .filter(r => !r.notified)
      .map(reminder => `
        <div class="crm-reminder-item">
          <div class="crm-reminder-time">${new Date(reminder.reminderTime).toLocaleString()}</div>
          <div class="crm-reminder-message">${reminder.message || 'No message'}</div>
        </div>
      `).join('');
  }

  /**
   * Load quick replies
   */
  async loadQuickReplies() {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      const response = await fetch(`${this.apiBaseUrl}/quick-replies`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const quickReplies = await response.json();
        this.updateQuickRepliesList(quickReplies);
      }
    } catch (error) {
      console.error('Error loading quick replies:', error);
    }
  }

  /**
   * Update quick replies list in UI (horizontal layout)
   */
  updateQuickRepliesList(quickReplies) {
    const quickRepliesList = this.sidebar.querySelector('#crm-quick-replies-list');
    if (!quickRepliesList) return;

    if (quickReplies.length === 0) {
      quickRepliesList.innerHTML = '<div class="crm-empty-state-small">No quick replies</div>';
      return;
    }

    quickRepliesList.innerHTML = quickReplies.map(qr => `
      <button class="crm-quick-reply-btn" data-message="${qr.message.replace(/"/g, '&quot;')}" title="${this.escapeHtml(qr.title)}">
        ${this.escapeHtml(qr.title)}
      </button>
    `).join('');

    // Attach insert handlers
    quickRepliesList.querySelectorAll('.crm-quick-reply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const message = e.target.dataset.message;
        this.insertQuickReply(message);
      });
    });
  }

  /**
   * Insert quick reply into WhatsApp input
   */
  insertQuickReply(message) {
    // Find WhatsApp's message input
    const input = DOMUtils.safeQuerySelector([
      '[data-testid="conversation-compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]'
    ]);

    if (input) {
      // Set text content
      input.textContent = message;

      // Trigger input event
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);

      // Focus input
      input.focus();
    }
  }

  /**
   * Show add quick reply modal
   */
  showAddQuickReplyModal() {
    const title = prompt('Template title:');
    if (!title) return;

    const message = prompt('Template message:');
    if (!message) return;

    this.saveQuickReply(title, message);
  }

  /**
   * Save quick reply
   */
  async saveQuickReply(title, message) {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

      const response = await fetch(`${this.apiBaseUrl}/quick-replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, message })
      });

      if (response.ok) {
        await this.loadQuickReplies();
      }
    } catch (error) {
      console.error('Error saving quick reply:', error);
    }
  }

  /**
   * Format tag for display
   */
  formatTag(tag) {
    const tagMap = {
      'new_lead': 'New Lead',
      'follow_up': 'Follow-up',
      'paid': 'Paid',
      'closed': 'Closed'
    };
    return tagMap[tag] || tag;
  }
}

// Initialize sidebar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const sidebarInjector = new SidebarInjector();
    sidebarInjector.init();
    window.whatsappCRM = window.whatsappCRM || {};
    window.whatsappCRM.sidebar = sidebarInjector;
  });
} else {
  const sidebarInjector = new SidebarInjector();
  sidebarInjector.init();
  window.whatsappCRM = window.whatsappCRM || {};
  window.whatsappCRM.sidebar = sidebarInjector;
}


