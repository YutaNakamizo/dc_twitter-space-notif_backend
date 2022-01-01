import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as twitter from './twitter.js';
import {
  firestore,
  FieldValue,
} from '../common/firebase.js';

const main = () => {
  const usernameList = process.env.NOTIF_TARGETS.replace(/ /g, '').split(',');
  fs.readFile(
    '/usr/data/notif/state.json',
    'utf8'
  ).then(_textPrevious => {
    const previousSpacesAll = JSON.parse(_textPrevious);
    const currentSpacesAll = {};

    Promise.allSettled(usernameList.map(username => {
      return new Promise((resolveHandleUser, rejectHandleUser) => {
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
          
          Promise.allSettled([
            Promise.allSettled(flags.created.map(created => {
              return new Promise((resolveHandleCreated, rejectHandleCreated) => {
                const {
                  id,
                } = created;
                
                // handle created
                Promise.allSettled([
                  new Promise((resolveNotifAll, rejectNotifAll) => {
                    // notify
                    firestore.collection('endpoints').where('username', '==', username).get().then(querySnap => {
                      if(querySnap.empty) resolveNotifAll();
                      Promise.allSettled(querySnap.docs.map(endpoint => {
                        return new Promise((resolveNotif, rejectNotif) => { 
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
                          
                          axios(config).then(() => {
                            console.log(`Sent to ${config.url}. (id: ${endpoint.id})`);
                            resolveNotif(endpoint.id);
                          }).catch(err => {
                            console.error(`Failed to send to ${config.url}. (id: ${endpoint.id}).`, err);
                            rejectNotif(err);
                          });
                        });
                      })).then(notifResults => {
                        const resolvedCount = notifResults.filter(r => r.status === 'fulfilled').length;
                        const rejectedCount = notifResults.filter(r => r.status === 'rejected').length;
                        console.log(`${resolvedCount}/${notifResults.length} notified. (${rejectedCount} failed)`);
                        resolveNotifAll({
                          resolvedCount,
                          rejectedCount,
                        });
                      });
                    }).catch(err => {
                      console.error(err);
                      rejectNotifAll(err);
                    });
                  }),
                  new Promise((resolveStore, rejectStore) => {
                    // store start
                    firestore.doc(`spaces/${id}`).set({
                      username,
                      startAt: FieldValue.serverTimestamp(),
                    }).then(() => {
                      console.log(`Stored space ${id}.`);
                      resolveStore(id);
                    }).catch(err => {
                      console.error(`Failed to store space ${id}`, err);
                      rejectStore(err);
                    });
                  }),
                ]).then(handleCreatedResult => {
                  resolveHandleCreated(id);
                });
              });
            })),
            Promise.allSettled(flags.removed.map(removed => {
              return new Promise((resolveHandleRemoved, rejectHandleRemoved) => {
                const {
                  id,
                } = removed;

                // store
                return firestore.doc(`spaces/${id}`).update({
                  endAt: FieldValue.serverTimestamp(),
                }).then(() => {
                  console.log(`Stored removed time of ${id}.`);
                  resolveHandleRemoved(id);
                }).catch(err => {
                  console.error(`Failed to store removed time of ${id}.`, err);
                  rejectHandleRemoved(err);
                });
              });
            })),
          ]).then(handleUserResult => {
            console.log(`Completed processing @${username}.`);
            resolveHandleUser(username);
          });
        });
      });
    })).then(resultHandleUserAll => {
      // rewrite current state
      fs.writeFile(
        '/usr/data/notif/state.json',
        JSON.stringify(currentSpacesAll)
      );
      console.log('Completed all target users.');
    });
  });
};

cron.schedule(
  process.env.NOTIF_INTERVAL || '* */5 * * * *',
  main
);

