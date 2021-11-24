import cron from 'node-cron';

import * as twitter from './twitter.js';

twitter.getUser('kuzichaki').then(console.log)

cron.schedule('*/5 * * * * *', () => console.log('5 秒毎実行'));

