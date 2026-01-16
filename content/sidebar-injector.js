/**
 * Sidebar Injector - Injects CRM sidebar into WhatsApp Web
 */

class SidebarInjector {
  constructor() {
    this.sidebar = null;
    this.isVisible = false;
    this.apiBaseUrl = 'http://localhost:3000/api'; // TODO: Make configurable
    this.activeTab = 'overview'; // 'overview' or 'chat'
    this.workQueueData = {
      counts: { new_lead: 0, follow_up: 0, paid: 0, closed: 0 },
      followUps: [],
      newLeads: []
    };
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

    // Listen for chat changes
    window.addEventListener('whatsapp-crm:chat-changed', (e) => {
      this.onChatChanged(e.detail);
    });
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
      
      <!-- Authentication Section -->
      <div id="crm-auth-section" class="crm-sidebar-content" style="display: none;">
        <div class="crm-section">
          <h4>Login / Register</h4>
          <div id="crm-auth-tabs" class="crm-auth-tabs">
            <button class="crm-tab-btn active" data-tab="login">Login</button>
            <button class="crm-tab-btn" data-tab="register">Register</button>
          </div>
          
          <!-- Login Form -->
          <div id="crm-login-form" class="crm-auth-form">
            <input 
              type="email" 
              id="crm-login-email" 
              class="crm-input" 
              placeholder="Email"
            />
            <input 
              type="password" 
              id="crm-login-password" 
              class="crm-input" 
              placeholder="Password"
            />
            <button class="crm-save-btn" id="crm-login-btn">Login</button>
            <div id="crm-auth-error" class="crm-error" style="display: none;"></div>
          </div>
          
          <!-- Register Form -->
          <div id="crm-register-form" class="crm-auth-form" style="display: none;">
            <input 
              type="email" 
              id="crm-register-email" 
              class="crm-input" 
              placeholder="Email"
            />
            <input 
              type="password" 
              id="crm-register-password" 
              class="crm-input" 
              placeholder="Password"
            />
            <button class="crm-save-btn" id="crm-register-btn">Register</button>
            <div id="crm-register-error" class="crm-error" style="display: none;"></div>
          </div>
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

        <!-- User Info Bar -->
        <div class="crm-user-bar">
          <span id="crm-user-email" class="crm-user-email"></span>
          <button class="crm-logout-btn" id="crm-logout-btn">Logout</button>
        </div>

        <!-- Overview Tab -->
        <div id="crm-tab-content-overview" class="crm-tab-content active">
          <!-- Summary Counters -->
          <div class="crm-summary-compact">
            <div class="crm-summary-item">
              <span class="crm-summary-icon">🟢</span>
              <span class="crm-summary-label">New Leads</span>
              <span class="crm-summary-value" id="crm-count-new-lead">0</span>
            </div>
            <div class="crm-summary-item">
              <span class="crm-summary-icon">🟡</span>
              <span class="crm-summary-label">Follow-ups</span>
              <span class="crm-summary-value" id="crm-count-follow-up">0</span>
              <span class="crm-summary-badge" id="crm-follow-up-badge" style="display: none;">(2 due)</span>
            </div>
            <div class="crm-summary-item">
              <span class="crm-summary-icon">🔵</span>
              <span class="crm-summary-label">Paid</span>
              <span class="crm-summary-value" id="crm-count-paid">0</span>
            </div>
            <div class="crm-summary-item">
              <span class="crm-summary-icon">⚫</span>
              <span class="crm-summary-label">Closed</span>
              <span class="crm-summary-value" id="crm-count-closed">0</span>
            </div>
          </div>

          <div class="crm-divider"></div>

          <!-- Work Queue: Follow-ups -->
          <div class="crm-work-queue-section">
            <h4 class="crm-work-queue-title">FOLLOW-UPS (priority)</h4>
            <div id="crm-follow-ups-list" class="crm-work-queue-list">
              <div class="crm-empty-state">No follow-ups</div>
            </div>
          </div>

          <div class="crm-divider"></div>

          <!-- Work Queue: New Leads -->
          <div class="crm-work-queue-section">
            <h4 class="crm-work-queue-title">NEW LEADS</h4>
            <div id="crm-new-leads-list" class="crm-work-queue-list">
              <div class="crm-empty-state">No new leads</div>
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
              <option value="new_lead">New Lead</option>
              <option value="follow_up">Follow-up</option>
              <option value="paid">Paid</option>
              <option value="closed">Closed</option>
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

    // Auth tab buttons
    const authTabs = this.sidebar.querySelectorAll('.crm-tab-btn');
    authTabs.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchAuthTab(tab);
      });
    });

    // Login button
    const loginBtn = this.sidebar.querySelector('#crm-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.login());
    }

    // Register button
    const registerBtn = this.sidebar.querySelector('#crm-register-btn');
    if (registerBtn) {
      registerBtn.addEventListener('click', () => this.register());
    }

    // Logout button
    const logoutBtn = this.sidebar.querySelector('#crm-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
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

    // Check authentication status on init
    this.checkAuthStatus();

    // Load saved tab preference
    this.loadTabPreference();
  }

  /**
   * Check authentication status and show appropriate UI
   */
  async checkAuthStatus() {
    const { token, userEmail } = await chrome.storage.local.get(['token', 'userEmail']);

    if (token) {
      this.showMainUI(userEmail);
    } else {
      this.showAuthUI();
    }
  }

  /**
   * Show authentication UI
   */
  showAuthUI() {
    const authSection = this.sidebar.querySelector('#crm-auth-section');
    const mainContent = this.sidebar.querySelector('#crm-main-content');

    if (authSection) authSection.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';
  }

  /**
   * Show main CRM UI
   */
  showMainUI(userEmail) {
    const authSection = this.sidebar.querySelector('#crm-auth-section');
    const mainContent = this.sidebar.querySelector('#crm-main-content');
    const userEmailEl = this.sidebar.querySelector('#crm-user-email');

    if (authSection) authSection.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (userEmailEl && userEmail) {
      userEmailEl.textContent = userEmail;
    }

    // Load Overview data when authenticated
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
   * Load Overview tab data (work queue)
   */
  async loadOverviewData() {
    try {
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) return;

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

      // Update work queue lists
      this.updateWorkQueue('followUps', followUps);
      this.updateWorkQueue('newLeads', newLeads);

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
   * Update work queue list
   */
  updateWorkQueue(type, chats) {
    const listEl = this.sidebar.querySelector(`#crm-${type === 'followUps' ? 'follow-ups' : 'new-leads'}-list`);
    if (!listEl) return;

    if (chats.length === 0) {
      listEl.innerHTML = `<div class="crm-empty-state">No ${type === 'followUps' ? 'follow-ups' : 'new leads'}</div>`;
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
          reminderText = isToday ? ' ⏰ Today' : '';
        }
      }

      return `
        <div class="crm-work-queue-item-compact" data-chat-id="${chat.whatsapp_id}">
          <span class="crm-work-queue-bullet">•</span>
          <span class="crm-work-queue-item-name">${this.escapeHtml(name)}</span>
          ${reminderText || (timeAgo ? ` <span class="crm-work-queue-time">(${timeAgo})</span>` : '')}
        </div>
      `;
    }).join('');

    // Attach click handlers
    listEl.querySelectorAll('.crm-work-queue-item-compact').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        this.openChat(chatId);
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
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
    window.location.href = whatsappUrl;
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
   * Switch between login and register tabs
   */
  switchAuthTab(tab) {
    const loginForm = this.sidebar.querySelector('#crm-login-form');
    const registerForm = this.sidebar.querySelector('#crm-register-form');
    const tabButtons = this.sidebar.querySelectorAll('.crm-tab-btn');

    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (tab === 'login') {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
    }
  }

  /**
   * Handle login
   */
  async login() {
    const email = this.sidebar.querySelector('#crm-login-email')?.value.trim();
    const password = this.sidebar.querySelector('#crm-login-password')?.value;
    const errorEl = this.sidebar.querySelector('#crm-auth-error');

    if (!email || !password) {
      this.showError(errorEl, 'Please enter email and password');
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Store token and user info
        await chrome.storage.local.set({
          token: data.token,
          userEmail: data.user.email
        });

        this.showError(errorEl, ''); // Clear error
        this.showMainUI(data.user.email);

        // Clear form
        this.sidebar.querySelector('#crm-login-email').value = '';
        this.sidebar.querySelector('#crm-login-password').value = '';
      } else {
        this.showError(errorEl, data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showError(errorEl, 'Failed to connect to server. Is the backend running?');
    }
  }

  /**
   * Handle register
   */
  async register() {
    const email = this.sidebar.querySelector('#crm-register-email')?.value.trim();
    const password = this.sidebar.querySelector('#crm-register-password')?.value;
    const errorEl = this.sidebar.querySelector('#crm-register-error');

    if (!email || !password) {
      this.showError(errorEl, 'Please enter email and password');
      return;
    }

    if (password.length < 6) {
      this.showError(errorEl, 'Password must be at least 6 characters');
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Store token and user info
        await chrome.storage.local.set({
          token: data.token,
          userEmail: data.user.email
        });

        this.showError(errorEl, ''); // Clear error
        this.showMainUI(data.user.email);

        // Clear form
        this.sidebar.querySelector('#crm-register-email').value = '';
        this.sidebar.querySelector('#crm-register-password').value = '';
      } else {
        this.showError(errorEl, data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Register error:', error);
      this.showError(errorEl, 'Failed to connect to server. Is the backend running?');
    }
  }

  /**
   * Handle logout
   */
  async logout() {
    await chrome.storage.local.remove(['token', 'userEmail']);
    this.showAuthUI();
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

    // If on Chat tab, load chat data
    if (this.activeTab === 'chat') {
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
      // Get auth token from storage
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) {
        console.warn('Not authenticated');
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
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Error loading chat:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error loading chat data:', error);
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

      console.log('Creating chat:', { rawChatId: chatId, normalizedChatId, phoneNumber, chatName });

      const response = await fetch(`${this.apiBaseUrl}/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          whatsappId: normalizedChatId,
          phoneNumber,
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

    // Update status selector
    const statusSelector = this.sidebar.querySelector('#crm-status-selector');
    if (statusSelector) {
      statusSelector.value = chat.tag || '';
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
      if (setBtn) setBtn.style.display = 'none';
    } else {
      if (displayEl) displayEl.style.display = 'none';
      if (setBtn) setBtn.style.display = 'block';
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
        // Hide modal
        this.hideReminderModal();

        // Reload chat data to update reminder display
        await this.loadChatData(chatId);

        // Schedule notification in background
        chrome.runtime.sendMessage({
          type: 'SCHEDULE_REMINDER',
          reminder: await reminderResponse.json()
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


