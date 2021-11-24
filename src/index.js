import cron from 'node-cron';
import * as twitter from './twitter.js';

const main = () => {
  twitter.getSpaceInfo('TakumaNitori').then(console.log).catch(console.error);
};

cron.schedule('*/5 * * * * *', main);

