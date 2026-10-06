// State Management
const state = {
  currentTab: 'inbox',
  currentAgent: { id: 'cs-1', name: 'Siti Nurhaliza' },
  activeConversationId: null,
  conversations: [],
  accounts: [],
  campaigns: [],
  reports: null,
  activeQrAccountId: null
};

// Socket.IO Realtime Connection
const socket = io();

socket.on('connect', () => {
  console.log('⚡ Connected to Realtime Socket.IO server');
  const pill = document.getElementById('system-status-indicator');
  if (pill) pill.innerHTML = '<span class="dot green"></span> Engine Aktif';
});

socket.on('disconnect', () => {
  const pill = document.getElementById('system-status-indicator');
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

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAgentSelector();
  initInbox();
  initAccounts();
  initBroadcast();
  loadSummaryMetrics();

  // Periodic refresh
  setInterval(() => {
    if (state.currentTab === 'inbox') loadConversations();
    if (state.currentTab === 'reports') loadReports();
    loadSummaryMetrics();
  }, 5000);
});

// Tab Navigation
function initTabs() {
  const tabBtns = document.querySelectorAll('.nav-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      state.currentTab = target;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      const activeView = document.getElementById(`view-${target}`);
      if (activeView) activeView.classList.add('active');

      const titles = {
        inbox: 'Live Chat Inbox Multi-Agent',
        accounts: 'Manajemen Akun WhatsApp (Multi-Device)',
        broadcast: 'Broadcast Kampanye & Proteksi Anti-Ban',
        reports: 'Laporan Performa CS & Log Audit Pesan'
      };
      document.getElementById('page-title').textContent = titles[target] || 'Dashboard';

      if (target === 'inbox') loadConversations();
      if (target === 'accounts') loadAccounts();
      if (target === 'broadcast') loadCampaigns();
      if (target === 'reports') loadReports();
    });
  });
}

// Agent Identity Switching
function initAgentSelector() {
  const select = document.getElementById('agent-switch');
  const nameEl = document.getElementById('current-agent-name');
  const avatarEl = document.getElementById('current-agent-avatar');
  const sendLabel = document.getElementById('send-as-label');

  select.addEventListener('change', (e) => {
    const [id, name] = e.target.value.split('|');
    state.currentAgent = { id, name };
    nameEl.textContent = name;
    avatarEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    sendLabel.textContent = `sebagai ${name.split(' ')[0]}`;
  });
}

// Inbox Module
function initInbox() {
  const replyInput = document.getElementById('reply-message-input');
  const sendBtn = document.getElementById('btn-send-reply');
  const assignBtn = document.getElementById('btn-assign-me');

  loadConversations();

  sendBtn.addEventListener('click', sendReply);
  replyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendReply();
  });

  assignBtn.addEventListener('click', async () => {
    if (!state.activeConversationId) return;
    try {
      await fetch(`/api/conversations/${state.activeConversationId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: state.currentAgent.id })
      });
      loadConversations();
      loadActiveMessages(state.activeConversationId);
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

function renderConversationList(filter = 'all') {
  const container = document.getElementById('conversations-container');
  let list = state.conversations;

  if (filter === 'unassigned') {
    list = list.filter(c => !c.assignedAgentId);
  } else if (filter === 'mine') {
    list = list.filter(c => c.assignedAgentId === state.currentAgent.id);
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
  await loadActiveMessages(id);
};

async function loadActiveMessages(id) {
  try {
    const res = await fetch(`/api/conversations/${id}`);
    const json = await res.json();
    if (!json.success) return;

    const conv = json.data;
    document.getElementById('active-chat-title').textContent = conv.contact.name || conv.contact.phoneNumber;
    document.getElementById('active-chat-subtitle').textContent = `Akun WA: ${conv.whatsappAccount.labelName} | ${conv.contact.phoneNumber}`;
    document.getElementById('active-chat-actions').style.display = 'flex';
    document.getElementById('chat-compose-bar').style.display = 'flex';
    document.getElementById('active-chat-status').textContent = conv.status;

    const stream = document.getElementById('messages-stream');
    if (!conv.messages || conv.messages.length === 0) {
      stream.innerHTML = '<div class="chat-placeholder"><p>Belum ada pesan dalam obrolan ini.</p></div>';
      return;
    }

    stream.innerHTML = conv.messages.map(m => {
      const isInbound = m.direction === 'INBOUND';
      const bubbleClass = isInbound ? 'inbound' : 'outbound';
      
      let badge = '';
      if (!isInbound) {
        if (m.senderType === 'BOT') {
          badge = '<span class="bubble-agent-badge bot">🤖 BOT</span>';
        } else {
          badge = `<span class="bubble-agent-badge">👤 CS: ${m.agentNameSnapshot || 'Staf'}</span>`;
        }
      }

      return `
        <div class="chat-bubble ${bubbleClass}">
          <div class="bubble-meta-header">
            ${badge}
          </div>
          <div class="bubble-content">
            ${m.text}
            <div class="bubble-time">${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

async function sendReply() {
  const input = document.getElementById('reply-message-input');
  const text = input.value.trim();
  if (!text || !state.activeConversationId) return;

  try {
    const res = await fetch(`/api/conversations/${state.activeConversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        agentId: state.currentAgent.id,
        agentName: state.currentAgent.name
      })
    });
    const json = await res.json();
    if (json.success) {
      input.value = '';
      loadActiveMessages(state.activeConversationId);
      loadConversations();
    }
  } catch (err) {
    console.error('Failed to send reply:', err);
  }
}

// Accounts Module
function initAccounts() {
  const addModal = document.getElementById('add-account-modal');
  const openBtn = document.getElementById('btn-open-add-account');
  const closeBtn = document.getElementById('btn-close-add-account');
  const closeQrBtn = document.getElementById('btn-close-qr');
  const form = document.getElementById('add-account-form');

  openBtn.addEventListener('click', () => addModal.style.display = 'flex');
  closeBtn.addEventListener('click', () => addModal.style.display = 'none');
  closeQrBtn.addEventListener('click', () => document.getElementById('qr-modal').style.display = 'none');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const labelName = document.getElementById('acc-label').value;
    const dailyLimit = document.getElementById('acc-limit').value;

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelName, dailyLimit })
      });
      const json = await res.json();
      if (json.success) {
        addModal.style.display = 'none';
        form.reset();
        loadAccounts();
        openQrModal(json.data.id, json.data.labelName);
      }
    } catch (err) {
      console.error(err);
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
      const grid = document.getElementById('accounts-grid');
      let onlineCount = 0;

      grid.innerHTML = state.accounts.map(acc => {
        if (acc.status === 'CONNECTED') onlineCount++;
        const pct = Math.min(100, Math.round((acc.sentToday / acc.dailyLimit) * 100));
        const statusBadge = acc.status === 'CONNECTED' 
          ? '<span class="badge-status" style="background:rgba(37,211,102,0.15); color:#25d366;">🟢 CONNECTED</span>'
          : `<span class="badge-status" style="background:rgba(239,68,68,0.15); color:#ef4444;">${acc.status}</span>`;

        return `
          <div class="account-card">
            <div class="acc-card-top">
              <div class="acc-title">
                <h4>${acc.labelName}</h4>
                <p>${acc.phoneNumber || 'Belum ditautkan'}</p>
              </div>
              ${statusBadge}
            </div>
            <div class="acc-quota-bar">
              <div class="quota-labels">
                <span>Kuota Terpakai Hari Ini</span>
                <span>${acc.sentToday} / ${acc.dailyLimit}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%"></div>
              </div>
            </div>
            <div class="acc-card-actions">
              <button class="btn btn-outline btn-sm btn-block" onclick="openQrModal('${acc.id}', '${acc.labelName}')">
                📷 Hubungkan / Scan QR
              </button>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('top-online-count').textContent = onlineCount;
    }
  } catch (err) {
    console.warn(err);
  }
}

window.openQrModal = async function(id, label) {
  state.activeQrAccountId = id;
  const modal = document.getElementById('qr-modal');
  const title = document.getElementById('qr-modal-title');
  const spinner = document.getElementById('qr-loading-spinner');
  const img = document.getElementById('qr-image');

  title.textContent = `Scan QR: ${label}`;
  if (img) img.style.display = 'none';
  if (spinner) spinner.style.display = 'block';
  modal.style.display = 'flex';

  // Check if QR already cached on backend
  try {
    const qrRes = await fetch(`/api/accounts/${id}/qr`);
    const qrJson = await qrRes.json();
    if (qrJson.success && qrJson.qrImage) {
      if (spinner) spinner.style.display = 'none';
      if (img) {
        img.src = qrJson.qrImage;
        img.style.display = 'block';
      }
    }
  } catch (_) {}

  fetch(`/api/accounts/${id}/connect`, { method: 'POST' });
};

// Broadcast Module
function initBroadcast() {
  const form = document.getElementById('broadcast-form');
  const templateInput = document.getElementById('campaign-template');
  const testBtn = document.getElementById('btn-test-spintax');

  testBtn.addEventListener('click', () => {
    updateSpintaxPreview();
  });
  templateInput.addEventListener('input', () => {
    updateSpintaxPreview();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('campaign-title').value;
    const rawNumbers = document.getElementById('campaign-recipients').value;
    const messageTemplate = document.getElementById('campaign-template').value;

    const recipients = rawNumbers
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 5)
      .map(phone => ({ phone }));

    if (recipients.length === 0) {
      showToast('Masukkan minimal 1 nomor tujuan yang valid.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, messageTemplate, recipients })
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Kampanye "${title}" berhasil didaftarkan ke antrean dengan ${json.totalQueued} pesan.`, 'success');
        form.reset();
        loadCampaigns();
      } else {
        showToast(json.error || 'Gagal membuat kampanye.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  });

  loadCampaigns();
}

function updateSpintaxPreview() {
  const text = document.getElementById('campaign-template').value;
  const output = document.getElementById('spintax-preview-output');
  if (!text) {
    output.textContent = 'Ketik template spintax di atas...';
    return;
  }

  // Client-side spintax preview simulator
  let preview = text;
  const spintaxRegex = /\{([^{}]+)\}/g;
  let matches = preview.match(spintaxRegex);
  while (matches && matches.length > 0) {
    for (const match of matches) {
      const choices = match.slice(1, -1).split('|');
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      preview = preview.replace(match, randomChoice);
    }
    matches = preview.match(spintaxRegex);
  }
  preview = preview.replace(/\{name\}/gi, 'Budi');
  output.textContent = preview;
}

async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const json = await res.json();
    if (json.success) {
      state.campaigns = json.data;
      const tbody = document.getElementById('campaigns-tbody');
      if (state.campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada riwayat kampanye.</td></tr>';
        return;
      }
      tbody.innerHTML = state.campaigns.map(c => `
        <tr>
          <td><strong>${c.title}</strong></td>
          <td>${c.totalTargets}</td>
          <td><span style="color:#25d366; font-weight:700;">${c.sentCount}</span> / ${c.totalTargets}</td>
          <td><span class="badge-tag">${c.status}</span></td>
          <td>${new Date(c.createdAt).toLocaleDateString()}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.warn(err);
  }
}

// Reports Module
async function loadReports() {
  try {
    const [agentsRes, accountsRes] = await Promise.all([
      fetch('/api/reports/agents'),
      fetch('/api/reports/accounts')
    ]);

    const agentsJson = await agentsRes.json();
    const accountsJson = await accountsRes.json();

    if (agentsJson.success) {
      const tbody = document.getElementById('agent-report-tbody');
      if (agentsJson.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada staf terdaftar.</td></tr>';
      } else {
        tbody.innerHTML = agentsJson.data.map(a => `
          <tr>
            <td><strong>${a.name}</strong></td>
            <td>${a.email}</td>
            <td>${a._count?.sentMessages || 0}</td>
            <td>${a._count?.conversations || 0}</td>
          </tr>
        `).join('');
      }
    }

    if (accountsJson.success) {
      const tbody = document.getElementById('account-report-tbody');
      if (accountsJson.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada akun WhatsApp.</td></tr>';
      } else {
        tbody.innerHTML = accountsJson.data.map(a => `
          <tr>
            <td>${a.labelName}</td>
            <td>${a.phoneNumber || '-'}</td>
            <td><span class="badge-tag">${a.status}</span></td>
            <td><strong>${a.sentToday}</strong></td>
            <td>${a.dailyLimit}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.warn(err);
  }
}

async function loadSummaryMetrics() {
  try {
    const res = await fetch('/api/reports/summary');
    const json = await res.json();
    if (json.success) {
      const d = json.data;
      document.getElementById('kpi-total-contacts').textContent = d.totalContacts;
      document.getElementById('kpi-total-messages').textContent = d.totalMessages;
      document.getElementById('kpi-bot-replies').textContent = d.botReplies;
      document.getElementById('kpi-agent-replies').textContent = d.agentReplies;
      document.getElementById('top-sent-count').textContent = d.totalMessages;
    }
  } catch (_) {}
}
