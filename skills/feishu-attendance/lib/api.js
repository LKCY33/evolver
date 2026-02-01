const fetch = require('node-fetch');
const { getTenantAccessToken } = require('./auth');

async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // If 5xx error, throw to trigger retry
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Request failed (${error.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function getAllUsers() {
  const token = await getTenantAccessToken();
  let users = [];
  let pageToken = '';
  
  do {
    const url = `https://open.feishu.cn/open-apis/contact/v3/users?department_id_type=open_department_id&department_id=0&page_size=50${pageToken ? '&page_token=' + pageToken : ''}`;
    const response = await fetchWithRetry(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.code !== 0) {
      console.warn('Failed to fetch users:', data.msg);
      break;
    }
    if (data.data.items) {
      users = users.concat(data.data.items);
    }
    pageToken = data.data.page_token;
  } while (pageToken);

  return users;
}

async function getAttendance(userIds, dateInt) {
  const token = await getTenantAccessToken();
  const url = 'https://open.feishu.cn/open-apis/attendance/v1/user_tasks/query?employee_type=employee_id';
  
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 50) {
    chunks.push(userIds.slice(i, i + 50));
  }

  let allTasks = [];

  for (const chunk of chunks) {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_ids: chunk,
        check_date_from: dateInt,
        check_date_to: dateInt
      })
    });
    const data = await response.json();
    if (data.code === 0 && data.data.user_task_results) {
      allTasks = allTasks.concat(data.data.user_task_results);
    } else {
      console.error('Attendance query failed for chunk:', JSON.stringify(data));
    }
  }

  return allTasks;
}

async function sendMessage(receiveId, content) {
  const token = await getTenantAccessToken();
  const type = receiveId.startsWith('ou_') ? 'open_id' : 'user_id';
  
  // Determine if content is text or card (JSON)
  let msgType = 'text';
  let bodyContent = '';

  if (typeof content === 'object') {
      msgType = 'interactive';
      bodyContent = JSON.stringify(content);
  } else {
      msgType = 'text';
      bodyContent = JSON.stringify({ text: content });
  }

  const response = await fetchWithRetry(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${type}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: msgType,
      content: bodyContent
    })
  });
  
  return response.json();
}

module.exports = {
  getAllUsers,
  getAttendance,
  sendMessage
};
