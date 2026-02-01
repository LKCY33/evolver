const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { getAllUsers, getAttendance, sendMessage } = require('./lib/api');

// Allow overriding Admin ID via env var, fallback to Master's ID
const ADMIN_ID = process.env.FEISHU_ADMIN_ID || 'ou_cdc63fe05e88c580aedead04d851fc04';

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('date', {
      alias: 'd',
      type: 'string',
      description: 'Date to check (YYYY-MM-DD)',
      default: new Date().toISOString().split('T')[0]
    })
    .option('notify', {
      alias: 'n',
      type: 'boolean',
      description: 'Send DM notifications to users (Default: false)',
      default: false
    })
    .option('dry-run', {
      type: 'boolean',
      description: 'Do not send any messages (even to Admin)',
      default: false
    })
    .command('check', 'Check attendance and notify')
    .help()
    .argv;

  if (!argv._.includes('check')) {
    console.log('Use "check" command. Example: node index.js check --date 2023-10-27');
    return;
  }

  let dateStr = argv.date;
  
  // Smart date parsing: Handle "1.27", "01-27" -> "2026-01-27"
  const currentYear = new Date().getFullYear();
  const shortDateMatch = dateStr.match(/^(\d{1,2})[.-](\d{1,2})$/);
  if (shortDateMatch) {
      const month = shortDateMatch[1].padStart(2, '0');
      const day = shortDateMatch[2].padStart(2, '0');
      dateStr = `${currentYear}-${month}-${day}`;
      console.log(`Auto-completed date input "${argv.date}" to: ${dateStr}`);
  }

  const dateInt = parseInt(dateStr.replace(/-/g, ''), 10);
  
  console.log(`Checking attendance for ${dateStr} (${dateInt})...`);

  // Holiday Check
  let isWorkday = true;
  let dayType = 'Workday';
  let holidayCheckWarning = '';
  
  try {
      console.log('Checking holiday status...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const holidayRes = await fetch(`https://timor.tech/api/holiday/info/${dateStr}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!holidayRes.ok) throw new Error(`HTTP ${holidayRes.status}`);

      const holidayData = await holidayRes.json();
      // type: 0=workday, 1=weekend, 2=holiday, 3=makeup
      if (holidayData && holidayData.type) {
          const type = holidayData.type.type;
          if (type === 1 || type === 2) {
              isWorkday = false;
              dayType = type === 1 ? 'Weekend' : 'Holiday';
          } else {
              dayType = type === 3 ? 'Makeup Workday' : 'Workday';
          }
          console.log(`Date ${dateStr} is a ${dayType} (type: ${type}).`);
      }
  } catch (e) {
      console.error('Failed to check holiday API (using default: Workday):', e.message);
      holidayCheckWarning = `⚠️ *Warning*: Holiday check failed (${e.message}). Assumed Workday.`;
  }

  // Safety: If holiday check failed, DO NOT spam users with DMs. Only report to admin.
  const safeMode = !!holidayCheckWarning;
  if (safeMode) {
      console.log("SAFE MODE ACTIVE: User DMs disabled due to holiday API failure.");
  }

  try {
    // 1. Get all users
    console.log('Fetching users...');
    const users = await getAllUsers();
    console.log(`Found ${users.length} users.`);
    const userMap = {};
    users.forEach(u => userMap[u.open_id] = u); // Map open_id to user details
    // Also map user_id if available, but response usually uses user_id or open_id depending on token type?
    // user_task/query uses user_ids. contact/v3/users returns open_id and user_id.
    // Let's create a map for both.
    users.forEach(u => {
        if(u.user_id) userMap[u.user_id] = u;
    });

    const userIds = users.map(u => u.user_id).filter(id => !!id); // Use user_id (employee_id) for querying

    if (userIds.length === 0) {
      console.log("No users found to check.");
      return;
    }

    // 2. Get attendance
    console.log('Fetching attendance records...');
    const results = await getAttendance(userIds, dateInt);
    
    // 3. Analyze
    const report = {
      late: [],
      early: [],
      absent: [],
      total: results.length
    };

    for (const res of results) {
      const userId = res.user_id;
      const userName = userMap[userId] ? userMap[userId].name : userId;
      const records = res.records || [];

      let isLate = false;
      let isEarly = false;
      let isAbsent = false;

      if (records.length === 0) {
        // No records usually means "No Shift" or "Rest Day" in Feishu.
        // Do NOT mark as absent.
        console.log(`[Info] ${userName}: No shift records found.`);
      } else {
        for (const record of records) {
           // Check In Result
           if (record.check_in_result === 'Late') isLate = true;
           if (record.check_in_result === 'Lack') isAbsent = true; // Lack of check-in

           // Check Out Result
           if (record.check_out_result === 'Early') isEarly = true;
           if (record.check_out_result === 'Lack') isAbsent = true; // Lack of check-out
        }
      }

      // Prepare messages (Only send if enabled and safe)
      if (isAbsent) {
        report.absent.push(userName);
        console.log(`[Absent] ${userName}`);
        if (!safeMode && argv.notify && !argv.dryRun) {
            await sendMessage(userId, `[Attendance Alert] You are marked as ABSENT for ${dateStr}. Please submit a request if this is an error.`);
        }
      } else {
        if (isLate) {
          report.late.push(userName);
          console.log(`[Late] ${userName}`);
          if (!safeMode && argv.notify && !argv.dryRun) {
              await sendMessage(userId, `[Attendance Alert] You were LATE on ${dateStr}. Please be on time.`);
          }
        }
        if (isEarly) {
          report.early.push(userName);
          console.log(`[Early] ${userName}`);
          if (!safeMode && argv.notify && !argv.dryRun) {
             await sendMessage(userId, `[Attendance Alert] You left EARLY on ${dateStr}.`);
          }
        }
      }
    }

    // 4. Report to Admin
    let summary = `📋 *Attendance Report (${dateStr})*\nType: ${dayType} ${!isWorkday ? '(No Absent Checks)' : ''}\nTotal Checked: ${report.total}\n`;
    if (holidayCheckWarning) summary += `${holidayCheckWarning}\n`;
    if (argv.dryRun) summary += `\n(DRY RUN: No messages sent)\n`;
    summary += `\n`;

    if (report.late.length > 0) summary += `🔴 *Late*:\n${report.late.join(', ')}\n\n`;
    if (report.early.length > 0) summary += `🟡 *Early Leave*:\n${report.early.join(', ')}\n\n`;
    if (report.absent.length > 0) summary += `⚫ *Absent*:\n${report.absent.join(', ')}\n\n`;

    if (report.late.length === 0 && report.early.length === 0 && report.absent.length === 0) {
        summary += "✅ *All Good!* No anomalies detected today.\n";
    }

    // Add detailed logs for debugging/detailed view
    summary += "\n*Detailed Logs:*\n";
    let details = "";
    for (const res of results) {
        const userId = res.user_id;
        const userName = userMap[userId] ? userMap[userId].name : userId;
        const records = res.records || [];
        if (records.length > 0) {
            const r = records[0]; // Assuming one shift per day for simplicity
            details += `- ${userName}: In ${r.check_in_record_id ? '✅' : '❌'} | Out ${r.check_out_record_id ? '✅' : '❌'} (${r.check_in_result}/${r.check_out_result})\n`;
        } else {
             details += `- ${userName}: No shift/records\n`;
        }
    }
    
    // Truncate details if too long (max ~2000 chars for safety)
    if (details.length > 2000) {
        details = details.substring(0, 2000) + "\n... (truncated)";
    }
    summary += details;

    console.log('Sending report to Admin...');
    if (!argv.dryRun) {
        await sendMessage(ADMIN_ID, summary);
        console.log('Report sent.');
    } else {
        console.log('DRY RUN: Report NOT sent.');
    }
    console.log('Done.');
    console.log(JSON.stringify(report, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
