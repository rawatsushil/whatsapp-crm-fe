/**
 * Background Service Worker
 * Handles reminders, notifications, and API communication
 */

// Default API URL (will be overridden by config)
const DEFAULT_API_URL = 'http://localhost:3000/api';

/**
 * Get API base URL from storage or use default
 */
async function getApiBaseUrl() {
  try {
    const { apiBaseUrl } = await chrome.storage.local.get(['apiBaseUrl']);
    return apiBaseUrl || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

// Listen for reminder scheduling requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCHEDULE_REMINDER') {
    scheduleReminder(message.reminder)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'CANCEL_REMINDER') {
    cancelReminder(message.reminderId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  return false;
});

/**
 * Cancel a scheduled reminder
 * @param {string} reminderId - Reminder ID
 */
async function cancelReminder(reminderId) {
  const alarmName = `reminder_${reminderId}`;
  
  // Clear the Chrome alarm
  await chrome.alarms.clear(alarmName);
  
  // Remove stored reminder data
  await chrome.storage.local.remove([alarmName]);
  
  console.log('Reminder cancelled:', reminderId);
}

// Listen for alarm triggers (reminders)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    handleReminder(alarm.name);
  }
});

/**
 * Schedule a reminder notification
 * @param {Object} reminder - Reminder object with id, reminderTime, message, chatId
 */
async function scheduleReminder(reminder) {
  const reminderTime = new Date(reminder.reminderTime).getTime();
  const now = Date.now();

  if (reminderTime <= now) {
    // Reminder is in the past, trigger immediately
    triggerReminder(reminder);
    return;
  }

  // Schedule alarm
  const alarmName = `reminder_${reminder.id}`;
  chrome.alarms.create(alarmName, {
    when: reminderTime
  });

  // Store reminder data
  await chrome.storage.local.set({
    [alarmName]: reminder
  });
}

/**
 * Handle reminder alarm
 * @param {string} alarmName - Alarm name (e.g., "reminder_123")
 */
async function handleReminder(alarmName) {
  const { [alarmName]: reminder } = await chrome.storage.local.get([alarmName]);
  
  if (!reminder) {
    console.error('Reminder data not found:', alarmName);
    return;
  }

  await triggerReminder(reminder);
  
  // Clean up
  await chrome.storage.local.remove([alarmName]);
}

/**
 * Trigger reminder notification
 * @param {Object} reminder - Reminder object
 */
async function triggerReminder(reminder) {
  // Show browser notification
  const notificationId = `reminder_${reminder.id}_${Date.now()}`;
  
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: 'Follow-up Reminder',
    message: reminder.message || 'You have a follow-up reminder',
    requireInteraction: true
  });

  // Store notification data for click handling
  await chrome.storage.local.set({
    [`notification_${notificationId}`]: {
      chatId: reminder.chatId,
      reminderId: reminder.id
    }
  });

  // Send email notification (if configured)
  await sendEmailNotification(reminder);

  // Mark reminder as notified in backend
  await markReminderNotified(reminder.id);
}

/**
 * Handle notification clicks
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // Open WhatsApp Web with the chat
    const { [`notification_${notificationId}`]: data } = await chrome.storage.local.get([`notification_${notificationId}`]);
    
    if (data && data.chatId) {
      const phoneNumber = data.chatId.replace('@c.us', '').replace('@g.us', '');
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
      
      chrome.tabs.create({ url: whatsappUrl });
    }
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const { [`notification_${notificationId}`]: data } = await chrome.storage.local.get([`notification_${notificationId}`]);
  
  if (data && data.chatId) {
    const phoneNumber = data.chatId.replace('@c.us', '').replace('@g.us', '');
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
    
    chrome.tabs.create({ url: whatsappUrl });
  }
});

/**
 * Send email notification (if email service is configured)
 * @param {Object} reminder - Reminder object
 */
async function sendEmailNotification(reminder) {
  // TODO: Implement email notification via backend API
  // This would require backend endpoint: POST /api/reminders/:id/notify
  try {
    const { token } = await chrome.storage.local.get(['token']);
    if (!token) return;

    const apiBaseUrl = await getApiBaseUrl();
    
    await fetch(`${apiBaseUrl}/reminders/${reminder.id}/notify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}

/**
 * Mark reminder as notified in backend
 * @param {string} reminderId - Reminder ID
 */
async function markReminderNotified(reminderId) {
  try {
    const { token } = await chrome.storage.local.get(['token']);
    if (!token) return;

    const apiBaseUrl = await getApiBaseUrl();
    
    await fetch(`${apiBaseUrl}/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ notified: true })
    });
  } catch (error) {
    console.error('Error marking reminder as notified:', error);
  }
}

// Check for due reminders on startup
chrome.runtime.onStartup.addListener(async () => {
  await checkDueReminders();
});

chrome.runtime.onInstalled.addListener(async () => {
  await checkDueReminders();
});

/**
 * Check for reminders that are due
 */
async function checkDueReminders() {
  try {
    const { token } = await chrome.storage.local.get(['token']);
    if (!token) return;

    const apiBaseUrl = await getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/reminders/due`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const reminders = await response.json();
      for (const reminder of reminders) {
        if (!reminder.notified) {
          await scheduleReminder(reminder);
        }
      }
    }
  } catch (error) {
    console.error('Error checking due reminders:', error);
  }
}



