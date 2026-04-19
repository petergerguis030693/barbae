const { listEmailLogs } = require('../../services/email-log.service');

async function index(req, res) {
  const logs = await listEmailLogs();

  res.render('layouts/admin', {
    title: 'E-Mail-Logs',
    activeMenu: 'email-logs',
    body: 'email-logs',
    data: { logs }
  });
}

module.exports = { index };
