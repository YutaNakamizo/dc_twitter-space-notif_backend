const cron = require('node-cron');

cron.schedule('*/5 * * * * *', () => console.log('5 秒毎実行'));

