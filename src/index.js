import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import * as twitter from './twitter.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname)

const main = () => {
  const usernameList = [
    'TakumaNitori',
  ];
  
  Promise.all(usernameList.map(username => {
    return twitter.getSpacesByUsername(username).then(currentSpaces => {
      if(!currentSpaces.data) currentSpaces.data = [];
      //console.log(currentSpaces);

      // read previous state
      fs.readFile(
        path.join(__dirname, './tmp/', `${username}.json`),
        'utf8'
      ).then(_textPrevious => {
        const previousSpaces = JSON.parse(_textPrevious);
        if(!previousSpaces.data) previousSpaces.data = [];

        // compare state
        const flags = {
          removed: [],
          created: [],
        };
        for(const prev of previousSpaces.data) {
          const removed = currentSpaces.data.findIndex(curr => curr.id === prev.id) === -1;
          if(removed) flags.removed.push(prev);
        }
        for(const curr of currentSpaces.data) {
          const created = previousSpaces.data.findIndex(prev => prev.id === curr.id) === -1;
          if(created) flags.created.push(curr);
        }

        console.log(JSON.stringify(flags, null, 2))
        
        // rewrite current state
        fs.writeFile(
          path.join(__dirname, './tmp/', `${username}.json`),
          JSON.stringify(currentSpaces)
        );
      });
    });
  }));
};

cron.schedule('*/5 * * * * *', main);

