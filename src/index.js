import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as twitter from './twitter.js';
import * as restapi from './restapi.js'
import {
  firestore,
  FieldValue,
} from './firebase.js';

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

        Promise.all(flags.created.map(created => {
          const {
            id,
          } = created;

          // notify
          firestore.collection('endpoints').where('username', '==', username).get().then(querySnap => {
            if(querySnap.empty) return;
            Promise.all(querySnap.docs.map(endpoint => {
              const {
                dest,
                destDetails,
              } = endpoint.data();
              console.log(dest, destDetails);

              const config = {
                headers: {
                },
              };

              switch(dest) {
                case 'discord-webhook': {
                  const {
                    url,
                  } = destDetails;
                  config.headers['Content-Type'] = 'application/json';
                  config.method = 'post';
                  config.url = url;
                  config.data = {
                    content: `@${username} が Twitter Space を開始しました.\rhttps://twitter.com/i/spaces/${id}`,
                  };
                  break;
                }
                case 'json': {
                  const {
                    method,
                    url,
                  } = destDetails;
                  config.headers['Content-Type'] = 'application/json';
                  config.method = method.toLowerCase();
                  config.url = url;
                  switch(method) {
                    case 'POST': {
                      config.data = {
                        username,
                        id,
                      };
                    }
                    case 'GET': {
                      config.params = {
                        username,
                        id,
                      };
                    }
                  }
                  break;
                }
                default: {
                  return;
                }
              }
              
              return axios(config).then(() => {
                console.log(`Sent to ${config.url}.`);
              }).catch(err => {
                console.error(err);
                return;
              });
            }));
          }).catch(err => {
            console.error(err);
            return;
          });

          return firestore.doc(`spaces/${id}`).set({
            username,
            startAt: FieldValue.serverTimestamp(),
          }).catch(err => {
            console.error(err);
            return;
          });
        }));

        Promise.all(flags.removed.map(removed => {
          const {
            id,
          } = removed;
          return firestore.doc(`spaces/${id}`).update({
            endAt: FieldValue.serverTimestamp(),
          }).catch(err => {
            console.error(err);
            return;
          });
        }));

        return;
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


restapi.launch();

