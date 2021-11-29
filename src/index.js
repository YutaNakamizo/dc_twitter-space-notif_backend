import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import * as twitter from './twitter.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname)

const main = () => {
  const usernameList = process.env.NOTIF_TARGETS.replace(/ /g, '').split(',');
  fs.readFile(
    path.join(__dirname, './tmp/state.json'),
    'utf8'
  ).then(_textPrevious => {
    const previousSpacesAll = JSON.parse(_textPrevious);
    const currentSpacesAll = {};

    Promise.all(usernameList.map(username => {
      return twitter.getSpacesByUsername(username).then(currentSpaces => {
        const previousSpaces = previousSpacesAll[username] || { data: [] };
        if(!currentSpaces.data) currentSpaces.data = [];
        //console.log(currentSpaces);
  
        // read previous state
        
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
        currentSpacesAll[username] = currentSpaces;
      });
    })).then(() => {
      // rewrite current state
      fs.writeFile(
        path.join(__dirname, './tmp/state.json'),
        JSON.stringify(currentSpacesAll)
      );
    });
  });
};

cron.schedule(
  process.env.NOTIF_INTERVAL || '* */5 * * * *',
  main
);

