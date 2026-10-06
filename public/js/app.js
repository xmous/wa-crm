// State Management
const state = {
  currentTab: 'inbox',
  currentUser: {
    id: 'cs-1',
    name: 'Admin Utama',
    email: 'admin@wa-crm.io',
    role: 'ADMIN'
  },
  activeConversationId: null,
  conversations: [],
  accounts: [],
  campaigns: [],
  contacts: [],
  botRules: [],
  reports: null,
  activeQrAccountId: null
};

// Preset Templates
const PRESET_TEMPLATES = {
  promo: '🎉 {Halo|Hai|Selamat {pagi|siang}} {Kak|Bapak|Ibu} {nama},\n\nDapatkan diskon spesial hingga 50% hanya hari ini! Gunakan voucher eksklusif: GAJIANHEMAT.\n\nKetik STOP jika tidak ingin menerima promo ini.',
  reminder: '⏰ {Halo|Hai} {Kak|Bapak|Ibu} {nama},\n\nPengingat ramah untuk jadwal reservasi Anda besok. Mohon konfirmasi kehadiran dengan membalas pesan ini.\n\nKetik STOP jika tidak ingin menerima pesan ini.',
  followup: '🤝 {Halo|Hai} {Kak|Bapak|Ibu} {nama},\n\nTerima kasih telah menghubungi kami sebelumnya. Apakah ada kebutuhan lain yang bisa kami bantu hari ini?\n\nKetik STOP untuk berhenti.',
  service: '🛠️ Notifikasi Sistem: Halo {nama}, sistem layanan Anda telah aktif. Jika ada pertanyaan, balas pesan ini langsung.'
};

// Spintax Resolver Utility for Preview
function resolveSpintax(text) {
  const spintaxRegex = /\{([^{}]+)\}/;
  let matches;
  let resolved = text;
  while ((matches = spintaxRegex.exec(resolved)) !== null) {
    const options = matches[1].split('|');
    const randomOption = options[Math.floor(Math.random() * options.length)];
    resolved = resolved.replace(matches[0], randomOption);
  }
  return resolved;
}

// Sleek Floating Toast Notification System
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 3500);
}

// Socket.IO Realtime Connection
const socket = io();

socket.on('connect', () => {
  console.log('⚡ Connected to Realtime Socket.IO server');
  const pill = document.querySelector('.brand-sub');
  if (pill) pill.innerHTML = '<span class="dot green"></span> Engine Aktif';
});

socket.on('disconnect', () => {
  const pill = document.querySelector('.brand-sub');
  if (pill) pill.innerHTML = '<span class="dot" style="background:#ef4444;"></span> Server Terputus';
});

socket.on('wa:qr', (data) => {
  console.log('QR Code received for account:', data.accountId);
  if (state.activeQrAccountId === data.accountId) {
    const spinner = document.getElementById('qr-loading-spinner');
    const img = document.getElementById('qr-image');
    if (spinner) spinner.style.display = 'none';
    if (img && data.qrImage) {
      img.src = data.qrImage;
      img.style.display = 'block';
    }
  }
});

socket.on('wa:connected', (data) => {
  console.log('WhatsApp connected:', data);
  loadAccounts();
  const modal = document.getElementById('qr-modal');
  if (modal && state.activeQrAccountId === data.accountId) {
    modal.style.display = 'none';
    state.activeQrAccountId = null;
    showToast(`Nomor WhatsApp ${data.phone || ''} berhasil terhubung!`, 'success');
  }
});

socket.on('wa:banned', (data) => {
  showToast(`⚠️ Akun WhatsApp ${data.accountId} terdeteksi bermasalah/diblokir oleh WhatsApp! Sistem otomatis mem-pause antrean.`, 'error');
  loadAccounts();
});

// Realtime Inbound Message Event
socket.on('chat:inbound', (data) => {
  console.log('📩 Inbound message received:', data);
  showToast(`📩 Pesan baru dari ${data.senderJid.split('@')[0]}: "${data.text.slice(0, 35)}..."`, 'info');
  
  // Reload conversation list
  loadConversations();
  loadSummaryMetrics();

  // If viewing this conversation, reload messages
  if (state.activeConversationId && data.conversationId === state.activeConversationId) {
    loadActiveMessages(state.activeConversationId);
  }
});

// Realtime Contacts Sync Event
socket.on('contacts:synced', (data) => {
  showToast(`🔄 Berhasil menyinkronkan kontak dari WhatsApp HP (${data.count} kontak terdata)!`, 'success');
  if (state.currentTab === 'contacts') loadContacts();
  updateContactsCountBadge();
});

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTabs();
  initInbox();
  initAccounts();
  initContacts();
  initBotRules();
  initBroadcast();
  loadSummaryMetrics();

  // Periodic polling for background updates
  setInterval(() => {
    if (state.currentTab === 'inbox') loadConversations();
    if (state.currentTab === 'reports') loadReports();
    loadSummaryMetrics();
  }, 5000);
});

// ==========================================================================
// Authentication & RBAC Flow
// ==========================================================================
function initAuth() {
  const savedUser = localStorage.getItem('wa_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      applyUserRole(state.currentUser);
    } catch (_) {
      showLoginModal();
    }
  } else {
    // Default to admin from seed
    state.currentUser = {
      id: 'admin',
      name: 'Admin Utama',
      email: 'admin@wa-crm.io',
      role: 'ADMIN'
    };
    localStorage.setItem('wa_user', JSON.stringify(state.currentUser));
    applyUserRole(state.currentUser);
  }

  // Switch Account Button
  const btnSwitch = document.getElementById('btn-switch-account');
  if (btnSwitch) {
    btnSwitch.addEventListener('click', () => {
      showLoginModal();
    });
  }

  // Quick Login Buttons
  document.querySelectorAll('.btn-quick-login').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const pass = btn.dataset.pass;
      document.getElementById('login-email').value = email;
      document.getElementById('login-password').value = pass;
      performLogin(email, pass);
    });
  });

  // Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      performLogin(email, pass);
    });
  }
}

function showLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) modal.style.display = 'flex';
}

function hideLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) modal.style.display = 'none';
}

async function performLogin(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    if (json.success && json.user) {
      state.currentUser = json.user;
      localStorage.setItem('wa_user', JSON.stringify(json.user));
      if (json.token) localStorage.setItem('wa_token', json.token);
      applyUserRole(json.user);
      hideLoginModal();
      showToast(`Selamat datang, ${json.user.name}!`, 'success');
    } else {
      showToast(json.error || 'Login gagal. Periksa email & password.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat login: ' + err.message, 'error');
  }
}

function applyUserRole(user) {
  const nameEl = document.getElementById('current-agent-name');
  const roleEl = document.getElementById('current-agent-role');
  const avatarEl = document.getElementById('current-agent-avatar');
  const sendLabel = document.getElementById('send-as-label');

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) {
    avatarEl.textContent = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  if (sendLabel) sendLabel.textContent = `sebagai ${user.name.split(' ')[0]}`;

  // RBAC Menu Filtering
  const accountsTab = document.getElementById('tab-btn-accounts');
  const botRulesTab = document.getElementById('tab-btn-bot-rules');
  const broadcastTab = document.getElementById('tab-btn-broadcast');
  const reportsTab = document.getElementById('tab-btn-reports');

  if (user.role === 'AGENT') {
    if (accountsTab) accountsTab.style.display = 'none';
    if (botRulesTab) botRulesTab.style.display = 'none';
    if (broadcastTab) broadcastTab.style.display = 'none';
    if (reportsTab) reportsTab.style.display = 'none';
    
    // Switch to inbox if on hidden view
    if (['accounts', 'bot-rules', 'broadcast', 'reports'].includes(state.currentTab)) {
      switchTab('inbox');
    }
  } else {
    if (accountsTab) accountsTab.style.display = 'flex';
    if (botRulesTab) botRulesTab.style.display = 'flex';
    if (broadcastTab) broadcastTab.style.display = 'flex';
    if (reportsTab) reportsTab.style.display = 'flex';
  }
}

// ==========================================================================
// Tab Navigation Flow
// ==========================================================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.nav-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(target) {
  state.currentTab = target;

  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-btn-${target}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  const activeView = document.getElementById(`view-${target}`);
  if (activeView) activeView.classList.add('active');

  if (target === 'inbox') loadConversations();
  if (target === 'accounts') loadAccounts();
  if (target === 'contacts') loadContacts();
  if (target === 'bot-rules') loadBotRules();
  if (target === 'broadcast') {
    loadCampaigns();
    updateContactsCountBadge();
    updateMockupPreview();
  }
  if (target === 'reports') loadReports();
}

// ==========================================================================
// View 1: Live Inbox Module
// ==========================================================================
function initInbox() {
  const replyInput = document.getElementById('reply-message-input');
  const sendBtn = document.getElementById('btn-send-reply');
  const assignBtn = document.getElementById('btn-assign-me');
  const searchInput = document.getElementById('chat-search');

  loadConversations();

  sendBtn.addEventListener('click', sendReply);
  replyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendReply();
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderConversationList(document.querySelector('.filter-tab.active')?.dataset.filter || 'all', e.target.value);
    });
  }

  assignBtn.addEventListener('click', async () => {
    if (!state.activeConversationId) return;
    try {
      await fetch(`/api/conversations/${state.activeConversationId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: state.currentUser.id })
      });
      loadConversations();
      loadActiveMessages(state.activeConversationId);
      showToast('Chat berhasil diambil alih oleh Anda', 'success');
    } catch (err) {
      console.error(err);
    }
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderConversationList(tab.dataset.filter);
    });
  });
}

async function loadConversations() {
  try {
    const res = await fetch('/api/conversations');
    const json = await res.json();
    if (json.success) {
      state.conversations = json.data;
      const activeFilter = document.querySelector('.filter-tab.active')?.dataset.filter || 'all';
      renderConversationList(activeFilter);
    }
  } catch (err) {
    console.warn('Failed to load conversations:', err);
  }
}

function renderConversationList(filter = 'all', searchKeyword = '') {
  const container = document.getElementById('conversations-container');
  let list = state.conversations;

  if (searchKeyword.trim()) {
    const q = searchKeyword.toLowerCase().trim();
    list = list.filter(c => {
      const name = (c.contact?.name || '').toLowerCase();
      const phone = (c.contact?.phoneNumber || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }

  if (filter === 'unassigned') {
    list = list.filter(c => !c.assignedAgentId);
  } else if (filter === 'mine') {
    list = list.filter(c => c.assignedAgentId === state.currentUser.id);
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:24px; text-align:center; color:#64748b;">Tidak ada percakapan.</div>';
    return;
  }

  container.innerHTML = list.map(c => {
    const lastMsg = c.messages?.[0]?.text || 'Percakapan baru';
    const contactName = c.contact?.name || c.contact?.phoneNumber || 'Pelanggan';
    const isActive = c.id === state.activeConversationId ? 'active' : '';
    const agentBadge = c.assignedAgent 
      ? `<span class="badge-tag agent">${c.assignedAgent.name}</span>`
      : '<span class="badge-tag">Belum ada CS</span>';

    return `
      <div class="conv-item ${isActive}" onclick="selectConversation('${c.id}')">
        <div class="conv-avatar">${contactName.slice(0, 2).toUpperCase()}</div>
        <div class="conv-details">
          <div class="conv-top-row">
            <span class="conv-name">${contactName}</span>
            <span class="conv-time">${new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="conv-snippet">${lastMsg}</div>
          <div class="conv-meta">
            ${agentBadge}
            <span class="badge-tag">${c.status}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.selectConversation = async function(id) {
  state.activeConversationId = id;
  renderConversationList();

  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;

  const contactName = conv.contact?.name || conv.contact?.phoneNumber || 'Pelanggan';
  document.getElementById('active-chat-title').textContent = contactName;
  document.getElementById('active-chat-subtitle').textContent = `WA: ${conv.contact?.phoneNumber || '-'} | Terhubung ke: ${conv.whatsappAccount?.labelName || 'Akun WA'}`;
  document.getElementById('active-chat-avatar').textContent = contactName.slice(0, 2).toUpperCase();
  document.getElementById('active-chat-status').textContent = conv.status;

  document.getElementById('active-chat-actions').style.display = 'flex';
  document.getElementById('chat-compose-bar').style.display = 'flex';

  await loadActiveMessages(id);
};

async function loadActiveMessages(conversationId) {
  try {
    const res = await fetch(`/api/conversations/${conversationId}`);
    const json = await res.json();
    if (json.success) {
      renderMessagesStream(json.data.messages);
    }
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function renderMessagesStream(messages) {
  const stream = document.getElementById('messages-stream');
  if (!messages || messages.length === 0) {
    stream.innerHTML = '<div class="chat-placeholder"><div class="icon">💬</div><h3>Belum ada pesan</h3><p>Mulai percakapan dengan mengetik di bawah.</p></div>';
    return;
  }

  stream.innerHTML = messages.map(m => {
    const isOutbound = m.direction === 'OUTBOUND';
    const rowClass = isOutbound ? 'outbound' : 'inbound';
    const isBot = m.senderType === 'BOT';
    const bubbleClass = isBot ? 'bot-bubble' : '';
    const staffName = m.agentNameSnapshot || (m.agent ? m.agent.name : (isBot ? 'Bot Otomatis' : 'CS'));

    return `
      <div class="msg-row ${rowClass}">
        <div class="msg-bubble-box ${bubbleClass}">
          ${m.text}
        </div>
        <div class="msg-info-sub">
          ${isOutbound ? `<span class="sender-tag ${isBot ? 'bot' : 'cs'}">${staffName}</span> • ` : ''}
          <span>${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    `;
  }).join('');

  stream.scrollTop = stream.scrollHeight;
}

async function sendReply() {
  const input = document.getElementById('reply-message-input');
  const text = input.value.trim();
  if (!text || !state.activeConversationId) return;

  try {
    input.value = '';
    const res = await fetch(`/api/conversations/${state.activeConversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        agentId: state.currentUser.id,
        agentNameSnapshot: state.currentUser.name
      })
    });
    const json = await res.json();
    if (json.success) {
      loadActiveMessages(state.activeConversationId);
      loadConversations();
    } else {
      showToast(json.error || 'Gagal mengirim pesan', 'error');
    }
  } catch (err) {
    showToast('Gagal mengirim pesan: ' + err.message, 'error');
  }
}

// ==========================================================================
// View 2: WhatsApp Accounts Module
// ==========================================================================
function initAccounts() {
  const addBtn = document.getElementById('btn-open-add-account');
  const closeBtn = document.getElementById('btn-close-add-account');
  const closeQrBtn = document.getElementById('btn-close-qr');
  const form = document.getElementById('add-account-form');

  addBtn.addEventListener('click', () => {
    document.getElementById('add-account-modal').style.display = 'flex';
  });

  closeBtn.addEventListener('click', () => {
    document.getElementById('add-account-modal').style.display = 'none';
  });

  closeQrBtn.addEventListener('click', () => {
    document.getElementById('qr-modal').style.display = 'none';
    state.activeQrAccountId = null;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('acc-label').value;
    const limit = parseInt(document.getElementById('acc-limit').value, 10);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelName: label, dailyLimit: limit })
      });
      const json = await res.json();
      if (json.success) {
        document.getElementById('add-account-modal').style.display = 'none';
        form.reset();
        loadAccounts();
        openQrModal(json.data.id);
      }
    } catch (err) {
      showToast('Gagal membuat akun: ' + err.message, 'error');
    }
  });

  loadAccounts();
}

async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const json = await res.json();
    if (json.success) {
      state.accounts = json.data;
      renderAccountsGrid();
      const onlineCount = state.accounts.filter(a => a.status === 'CONNECTED').length;
      const dot = document.getElementById('dot-connected');
      if (dot) {
        dot.style.backgroundColor = onlineCount > 0 ? 'var(--brand-green)' : '#ef4444';
      }
    }
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}

function renderAccountsGrid() {
  const container = document.getElementById('accounts-grid');
  if (!container) return;

  if (state.accounts.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 40px;">Belum ada akun WhatsApp terdaftar. Klik "+ Tambah Nomor Baru" di atas.</div>';
    return;
  }

  container.innerHTML = state.accounts.map(acc => {
    const isConn = acc.status === 'CONNECTED';
    return `
      <div class="account-card">
        <div class="account-card-header">
          <div>
            <div class="account-label">${acc.labelName}</div>
            <div class="account-phone">${acc.phoneNumber || 'Belum di-scan'}</div>
          </div>
          <span class="status-badge ${isConn ? 'connected' : 'disconnected'}">
            ${acc.status}
          </span>
        </div>
        <div class="account-stats">
          <div>
            <span style="color:#64748b;">Kuota Hari Ini:</span>
            <strong> ${acc.sentToday} / ${acc.dailyLimit}</strong>
          </div>
          <div>
            <span style="color:#64748b;">Tersedia:</span>
            <strong style="color:var(--brand-green);"> ${acc.dailyLimit - acc.sentToday}</strong>
          </div>
        </div>
        <div class="account-actions">
          ${!isConn ? `<button class="btn btn-primary btn-sm btn-block" onclick="openQrModal('${acc.id}')">Scan QR Login</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="reconnectAccount('${acc.id}')">🔄 Hubungkan Ulang</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openQrModal = async function(accountId) {
  state.activeQrAccountId = accountId;
  const modal = document.getElementById('qr-modal');
  const spinner = document.getElementById('qr-loading-spinner');
  const img = document.getElementById('qr-image');

  modal.style.display = 'flex';
  spinner.style.display = 'flex';
  img.style.display = 'none';

  try {
    const res = await fetch(`/api/accounts/${accountId}/connect`, { method: 'POST' });
    const json = await res.json();
    if (json.qrImage) {
      spinner.style.display = 'none';
      img.src = json.qrImage;
      img.style.display = 'block';
    }
  } catch (err) {
    showToast('Gagal memuat QR Code: ' + err.message, 'error');
  }
};

window.reconnectAccount = async function(accountId) {
  try {
    showToast('Menghubungkan ulang sesi WhatsApp...', 'info');
    await fetch(`/api/accounts/${accountId}/connect`, { method: 'POST' });
    loadAccounts();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
};

// ==========================================================================
// View 3: Contacts Book Module
// ==========================================================================
function initContacts() {
  const syncBtn = document.getElementById('btn-sync-phone-contacts');
  const addBtn = document.getElementById('btn-open-add-contact');
  const closeBtn = document.getElementById('btn-close-add-contact');
  const searchInput = document.getElementById('contacts-search');
  const form = document.getElementById('add-contact-form');

  if (syncBtn) {
    syncBtn.addEventListener('click', syncPhoneContacts);
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('add-contact-modal').style.display = 'flex';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('add-contact-modal').style.display = 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('contact-phone').value;
      const name = document.getElementById('contact-name').value;

      try {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone, name })
        });
        const json = await res.json();
        if (json.success) {
          showToast('Kontak berhasil disimpan', 'success');
          document.getElementById('add-contact-modal').style.display = 'none';
          form.reset();
          loadContacts();
          updateContactsCountBadge();
        } else {
          showToast(json.error || 'Gagal menyimpan kontak', 'error');
        }
      } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const activeFilter = document.querySelector('.filter-pill.active')?.dataset.filter || 'all';
      loadContacts(activeFilter, e.target.value);
    });
  }

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const q = document.getElementById('contacts-search')?.value || '';
      loadContacts(pill.dataset.filter, q);
    });
  });
}

async function syncPhoneContacts() {
  const connectedAccount = state.accounts.find(a => a.status === 'CONNECTED');
  if (!connectedAccount) {
    showToast('Tidak ada akun WhatsApp yang sedang terhubung. Hubungkan akun terlebih dahulu.', 'warning');
    return;
  }

  try {
    showToast('Sedang menarik kontak dari WhatsApp HP...', 'info');
    const res = await fetch(`/api/contacts/sync/${connectedAccount.id}`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(json.message || 'Sinkronisasi kontak dipicu', 'success');
      loadContacts();
      updateContactsCountBadge();
    } else {
      showToast(json.error || 'Gagal sinkronisasi kontak', 'error');
    }
  } catch (err) {
    showToast('Gagal memicu sinkronisasi: ' + err.message, 'error');
  }
}

async function loadContacts(filter = 'all', q = '') {
  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.append('filter', filter);
    if (q) params.append('q', q);

    const res = await fetch(`/api/contacts?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      state.contacts = json.contacts;
      renderContactsTable();
    }
  } catch (err) {
    console.warn('Failed to load contacts:', err);
  }
}

function renderContactsTable() {
  const tbody = document.getElementById('contacts-tbody');
  if (!tbody) return;

  if (state.contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 24px; color: #64748b;">Belum ada kontak. Klik "+ Tambah Kontak Manual" atau "Tarik Kontak dari WA HP".</td></tr>';
    return;
  }

  tbody.innerHTML = state.contacts.map(c => {
    const isBl = c.isBlacklisted;
    const statusBadge = isBl
      ? '<span class="badge-blacklist">BLACKLIST (STOP)</span>'
      : '<span class="badge-active">AKTIF</span>';

    return `
      <tr>
        <td><strong>${c.phoneNumber}</strong></td>
        <td>${c.name || '<span style="color:#64748b;">Tanpa Nama</span>'}</td>
        <td>${statusBadge}</td>
        <td>${new Date(c.updatedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="toggleBlacklistContact('${c.id}', ${!isBl})">
              ${isBl ? 'Pulihkan' : 'Blacklist'}
            </button>
            <button class="btn btn-outline btn-sm" style="color:var(--accent-red);" onclick="deleteContact('${c.id}')">
              Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleBlacklistContact = async function(id, isBlacklisted) {
  try {
    const res = await fetch(`/api/contacts/${id}/blacklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isBlacklisted })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Kontak berhasil di-${isBlacklisted ? 'blacklist' : 'aktifkan'}`, 'success');
      loadContacts();
    }
  } catch (err) {
    showToast('Gagal mengubah status kontak: ' + err.message, 'error');
  }
};

window.deleteContact = async function(id) {
  if (!confirm('Yakin ingin menghapus kontak ini?')) return;
  try {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Kontak berhasil dihapus', 'success');
      loadContacts();
      updateContactsCountBadge();
    }
  } catch (err) {
    showToast('Gagal menghapus kontak: ' + err.message, 'error');
  }
};

async function updateContactsCountBadge() {
  try {
    const res = await fetch('/api/contacts');
    const json = await res.json();
    if (json.success) {
      const activeContacts = json.contacts.filter(c => !c.isBlacklisted);
      const badge = document.getElementById('count-available-contacts');
      if (badge) badge.textContent = `${activeContacts.length} nomor aktif`;
    }
  } catch (_) {}
}

// ==========================================================================
// View 4: Bot Rules Module & Sandbox Simulator
// ==========================================================================
function initBotRules() {
  const addBtn = document.getElementById('btn-open-add-rule');
  const closeBtn = document.getElementById('btn-close-bot-rule');
  const form = document.getElementById('bot-rule-form');
  const testSandboxBtn = document.getElementById('btn-test-sandbox');
  const sandboxInput = document.getElementById('sandbox-input');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('bot-rule-id').value = '';
      document.getElementById('bot-rule-form').reset();
      document.getElementById('bot-rule-modal-title').textContent = 'Tambah Aturan Balasan Bot';
      document.getElementById('bot-rule-modal').style.display = 'flex';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('bot-rule-modal').style.display = 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('bot-rule-id').value;
      const triggerType = document.getElementById('rule-trigger-type').value;
      const keyword = document.getElementById('rule-keyword').value;
      const action = document.getElementById('rule-action').value;
      const replyText = document.getElementById('rule-reply-text').value;
      const priority = parseInt(document.getElementById('rule-priority').value, 10);

      const payload = { triggerType, keyword, action, replyText, priority };

      try {
        const url = id ? `/api/bot-rules/${id}` : '/api/bot-rules';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          showToast('Aturan bot berhasil disimpan', 'success');
          document.getElementById('bot-rule-modal').style.display = 'none';
          loadBotRules();
        } else {
          showToast(json.error || 'Gagal menyimpan aturan', 'error');
        }
      } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
      }
    });
  }

  // Interactive Sandbox Simulator
  if (testSandboxBtn && sandboxInput) {
    const handleSandboxSubmit = async () => {
      const text = sandboxInput.value.trim();
      if (!text) return;
      sandboxInput.value = '';

      const chatArea = document.getElementById('sandbox-chat-stream');
      // Append user msg
      chatArea.innerHTML += `
        <div class="sandbox-msg user">
          <div class="msg-bubble">${text}</div>
        </div>
      `;
      chatArea.scrollTop = chatArea.scrollHeight;

      try {
        const res = await fetch('/api/bot-rules/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const json = await res.json();
        if (json.success) {
          if (json.matched) {
            const isHandover = json.action === 'HANDOVER_AGENT';
            chatArea.innerHTML += `
              <div class="sandbox-msg bot">
                <div class="msg-bubble" style="${isHandover ? 'border-left: 3px solid var(--accent-blue);' : ''}">
                  ${json.replyText || (isHandover ? 'Mohon tunggu, staf CS kami akan segera membantu.' : 'Balasan bot.')}
                  ${isHandover ? '<br><small style="color:var(--accent-blue); font-weight:700;">[STATUS: DIALIHKAN KE CS MANUSIA]</small>' : ''}
                </div>
              </div>
            `;
          } else {
            chatArea.innerHTML += `
              <div class="sandbox-msg bot">
                <div class="msg-bubble" style="color:#94a3b8; font-style:italic;">
                  (Tidak ada aturan kata kunci yang cocok. Pesan akan masuk ke inbox CS secara normal.)
                </div>
              </div>
            `;
          }
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      } catch (err) {
        console.error(err);
      }
    };

    testSandboxBtn.addEventListener('click', handleSandboxSubmit);
    sandboxInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSandboxSubmit();
    });
  }
}

async function loadBotRules() {
  try {
    const res = await fetch('/api/bot-rules');
    const json = await res.json();
    if (json.success) {
      state.botRules = json.rules;
      renderBotRulesTable();
    }
  } catch (err) {
    console.warn('Failed to load bot rules:', err);
  }
}

function renderBotRulesTable() {
  const tbody = document.getElementById('bot-rules-tbody');
  if (!tbody) return;

  if (state.botRules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Belum ada aturan bot. Klik "+ Tambah Aturan Baru".</td></tr>';
    return;
  }

  tbody.innerHTML = state.botRules.map(r => {
    return `
      <tr>
        <td><strong>${r.priority}</strong></td>
        <td><span class="badge-tag">${r.triggerType}</span></td>
        <td><code>${r.keyword}</code></td>
        <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.replyText}</td>
        <td>
          <span class="badge-tag ${r.action === 'HANDOVER_AGENT' ? 'agent' : ''}">
            ${r.action}
          </span>
        </td>
        <td>
          <span class="badge-active" style="${r.isActive ? '' : 'background:#374151; color:#9ca3af;'}">
            ${r.isActive ? 'AKTIF' : 'NONAKTIF'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="editBotRule('${r.id}')">Edit</button>
            <button class="btn btn-outline btn-sm" style="color:var(--accent-red);" onclick="deleteBotRule('${r.id}')">Hapus</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.editBotRule = function(id) {
  const rule = state.botRules.find(r => r.id === id);
  if (!rule) return;

  document.getElementById('bot-rule-id').value = rule.id;
  document.getElementById('rule-trigger-type').value = rule.triggerType;
  document.getElementById('rule-keyword').value = rule.keyword;
  document.getElementById('rule-action').value = rule.action;
  document.getElementById('rule-reply-text').value = rule.replyText;
  document.getElementById('rule-priority').value = rule.priority;

  document.getElementById('bot-rule-modal-title').textContent = 'Edit Aturan Balasan Bot';
  document.getElementById('bot-rule-modal').style.display = 'flex';
};

window.deleteBotRule = async function(id) {
  if (!confirm('Yakin ingin menghapus aturan bot ini?')) return;
  try {
    const res = await fetch(`/api/bot-rules/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Aturan bot berhasil dihapus', 'success');
      loadBotRules();
    }
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
};

// ==========================================================================
// View 5: Revamped Broadcast UI & WhatsApp Smartphone Mockup
// ==========================================================================
function initBroadcast() {
  const form = document.getElementById('broadcast-form');
  const templateArea = document.getElementById('campaign-template');
  const presetSelect = document.getElementById('template-preset-select');
  const fillContactsBtn = document.getElementById('btn-fill-phone-contacts');
  const rerollBtn = document.getElementById('btn-reroll-mockup');
  const nameSelect = document.getElementById('mockup-name-select');

  // Realtime Keystroke Listener for Live Phone Mockup Preview
  if (templateArea) {
    templateArea.addEventListener('input', () => {
      updateMockupPreview();
    });
  }

  // Preset Template Select
  if (presetSelect && templateArea) {
    presetSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key && PRESET_TEMPLATES[key]) {
        templateArea.value = PRESET_TEMPLATES[key];
        updateMockupPreview();
      }
    });
  }

  // Smart Chips 1-Click Insert
  document.querySelectorAll('.smart-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const insertText = chip.dataset.insert;
      insertAtCursor(templateArea, insertText);
      updateMockupPreview();
    });
  });

  // Fill Phone Contacts automatically
  if (fillContactsBtn) {
    fillContactsBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/contacts?filter=active');
        const json = await res.json();
        if (json.success && json.contacts.length > 0) {
          const phones = json.contacts.map(c => c.phoneNumber).join('\n');
          document.getElementById('campaign-recipients').value = phones;
          showToast(`Berhasil memasukkan ${json.contacts.length} nomor aktif dari buku kontak`, 'success');
        } else {
          showToast('Belum ada kontak aktif. Tarik kontak dari WhatsApp HP terlebih dahulu.', 'warning');
        }
      } catch (err) {
        showToast('Gagal memuat kontak: ' + err.message, 'error');
      }
    });
  }

  // Reroll Spintax Mockup
  if (rerollBtn) {
    rerollBtn.addEventListener('click', () => {
      updateMockupPreview();
      showToast('🎲 Variasi pesan spintax berhasil diacak ulang', 'info');
    });
  }

  if (nameSelect) {
    nameSelect.addEventListener('change', (e) => {
      const targetNameEl = document.getElementById('mockup-target-name');
      if (targetNameEl) targetNameEl.textContent = e.target.value;
      updateMockupPreview();
    });
  }

  // Submit Broadcast Campaign
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('campaign-title').value.trim();
      const recipientsRaw = document.getElementById('campaign-recipients').value;
      const messageTemplate = document.getElementById('campaign-template').value.trim();

      const recipients = recipientsRaw.split('\n').map(s => s.trim()).filter(Boolean);
      if (recipients.length === 0) {
        showToast('Daftar nomor penerima tidak boleh kosong', 'warning');
        return;
      }

      try {
        const btn = document.getElementById('btn-submit-campaign');
        btn.disabled = true;
        btn.textContent = 'Menyiapkan Antrean...';

        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, recipients, messageTemplate })
        });
        const json = await res.json();
        if (json.success) {
          showToast(`Kampanye "${title}" berhasil dimulai! Pesan masuk ke antrean anti-ban.`, 'success');
          form.reset();
          loadCampaigns();
          updateMockupPreview();
        } else {
          showToast(json.error || 'Gagal memulai kampanye', 'error');
        }
      } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
      } finally {
        const btn = document.getElementById('btn-submit-campaign');
        btn.disabled = false;
        btn.textContent = '🚀 Mulai Antrean Broadcast Sekarang';
      }
    });
  }

  loadCampaigns();
  updateContactsCountBadge();
  updateMockupPreview();
}

function insertAtCursor(myField, myValue) {
  if (myField.selectionStart || myField.selectionStart === 0) {
    const startPos = myField.selectionStart;
    const endPos = myField.selectionEnd;
    myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
    myField.selectionStart = startPos + myValue.length;
    myField.selectionEnd = startPos + myValue.length;
  } else {
    myField.value += myValue;
  }
  myField.focus();
}

function updateMockupPreview() {
  const templateArea = document.getElementById('campaign-template');
  const previewBubble = document.getElementById('mockup-rendered-text');
  const nameSelect = document.getElementById('mockup-name-select');
  const targetName = nameSelect ? nameSelect.value : 'Budi Santoso';

  if (!previewBubble) return;

  const rawText = templateArea && templateArea.value.trim() 
    ? templateArea.value 
    : '{Halo|Hai} {Kak|Bapak|Ibu} {nama}, kami ingin menginfokan penawaran menarik hari ini...';

  // Evaluate spintax
  let evaluated = resolveSpintax(rawText);
  // Replace {nama} or {name}
  evaluated = evaluated.replace(/\{nama\}|\{name\}/gi, targetName);

  previewBubble.innerHTML = evaluated.replace(/\n/g, '<br>');

  const timeEl = document.getElementById('mockup-bubble-time');
  if (timeEl) {
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const json = await res.json();
    if (json.success) {
      state.campaigns = json.data;
      renderCampaignsTable();
    }
  } catch (err) {
    console.warn('Failed to load campaigns:', err);
  }
}

function renderCampaignsTable() {
  const tbody = document.getElementById('campaigns-tbody');
  if (!tbody) return;

  if (state.campaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:20px; color:#64748b;">Belum ada riwayat kampanye broadcast.</td></tr>';
    return;
  }

  tbody.innerHTML = state.campaigns.map(c => `
    <tr>
      <td><strong>${c.title}</strong></td>
      <td>${c.totalTargets} nomor</td>
      <td><span style="color:var(--brand-green); font-weight:700;">${c.sentCount}</span> / ${c.totalTargets}</td>
      <td><span class="badge-tag">${c.status}</span></td>
      <td>${new Date(c.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
    </tr>
  `).join('');
}

// ==========================================================================
// View 6: Reports & Analytics Module
// ==========================================================================
async function loadSummaryMetrics() {
  try {
    const res = await fetch('/api/reports/summary');
    const json = await res.json();
    if (json.success) {
      const d = json.data;
      const topSent = document.getElementById('top-sent-count');
      if (topSent) topSent.textContent = d.totalMessages;

      const kpiContacts = document.getElementById('kpi-total-contacts');
      const kpiMsgs = document.getElementById('kpi-total-messages');
      const kpiBot = document.getElementById('kpi-bot-replies');
      const kpiAgent = document.getElementById('kpi-agent-replies');

      if (kpiContacts) kpiContacts.textContent = d.totalContacts;
      if (kpiMsgs) kpiMsgs.textContent = d.totalMessages;
      if (kpiBot) kpiBot.textContent = d.botReplies;
      if (kpiAgent) kpiAgent.textContent = d.agentReplies;
    }
  } catch (_) {}
}

async function loadReports() {
  loadSummaryMetrics();
  loadAgentProductivity();
  loadAccountReports();
}

async function loadAgentProductivity() {
  try {
    const res = await fetch('/api/reports/agents');
    const json = await res.json();
    const tbody = document.getElementById('agent-report-tbody');
    if (!tbody) return;

    if (json.success && json.data.length > 0) {
      tbody.innerHTML = json.data.map(a => `
        <tr>
          <td><strong>${a.name}</strong></td>
          <td>${a.email}</td>
          <td>${a._count?.sentMessages || 0}</td>
          <td>${a._count?.conversations || 0}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:20px; color:#64748b;">Belum ada aktivitas staf CS.</td></tr>';
    }
  } catch (_) {}
}

async function loadAccountReports() {
  try {
    const res = await fetch('/api/reports/accounts');
    const json = await res.json();
    const tbody = document.getElementById('account-report-tbody');
    if (!tbody) return;

    if (json.success && json.data.length > 0) {
      tbody.innerHTML = json.data.map(acc => `
        <tr>
          <td><strong>${acc.labelName}</strong></td>
          <td>${acc.phoneNumber || '-'}</td>
          <td><span class="badge-tag">${acc.status}</span></td>
          <td>${acc.sentToday}</td>
          <td>${acc.dailyLimit}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:20px; color:#64748b;">Belum ada akun WhatsApp.</td></tr>';
    }
  } catch (_) {}
}
