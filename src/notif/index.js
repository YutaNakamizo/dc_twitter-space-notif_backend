import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import axios from 'axios';
import log4js from 'log4js';
import * as twitter from './twitter.js';
import {
  firestore,
  FieldValue,
} from '../common/firebase.js';

log4js.configure({
  appenders: {
    console: {
      type: 'console',
    },
    system: {
      type: 'dateFile',
      filename: '/usr/data/notif/log/system.log',
      pattern: '-yyyy-MM-dd',
    },
    error: {
      type: 'dateFile',
      filename: '/usr/data/notif/log/error.log',
      pattern: '-yyyy-MM-dd',
    },
  },
  categories: {
    default: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
    notif_default: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
    notif_error: {
      appenders: [
        'console',
        'error',
      ],
      level: 'warn',
    },
  },
});

const logger = log4js.getLogger('notif_default');
const errorLogger = log4js.getLogger('notif_error');

const main = () => {
  logger.info('Start main process.');
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
          logger.info(`Start processing @${username}`);
          const previousSpaces = previousSpacesAll[username] || { data: [] };
          if(!currentSpaces.data) currentSpaces.data = [];
  
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
  
          logger.info(`flags for @${username}: ${JSON.stringify(flags)}`);
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
                    firestore.collection('endpoints').where('usernames', 'array-contains', username).get().then(querySnap => {
                      if(querySnap.empty) resolveNotifAll();
                      Promise.allSettled(querySnap.docs.map(endpoint => {
                        return new Promise((resolveNotif, rejectNotif) => { 
                          const {
                            dest,
                            destDetails,
                          } = endpoint.data();
                          logger.info(`dest: ${dest}, dest details: ${destDetails}`);

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
                            logger.info(`Sent to ${config.url}. (id: ${endpoint.id})`);
                            resolveNotif(endpoint.id);
                          }).catch(err => {
                            errorLogger.error(`Failed to send to ${config.url}. (id: ${endpoint.id}). / ${err.code} ${err.name} ${err.message}`);
                            rejectNotif(err);
                          });
                        });
                      })).then(notifResults => {
                        const resolvedCount = notifResults.filter(r => r.status === 'fulfilled').length;
                        const rejectedCount = notifResults.filter(r => r.status === 'rejected').length;
                        logger.info(`${resolvedCount}/${notifResults.length} notified. (${rejectedCount} failed)`);
                        resolveNotifAll({
                          resolvedCount,
                          rejectedCount,
                        });
                      });
                    }).catch(err => {
                      errorLogger.error(`Failed to load endpoints from database. / ${err.code} ${err.name} ${err.message}`);
                      rejectNotifAll(err);
                    });
                  }),
                  new Promise((resolveStore, rejectStore) => {
                    // store start
                    firestore.doc(`spaces/${id}`).set({
                      username,
                      startAt: FieldValue.serverTimestamp(),
                    }).then(() => {
                      logger.info(`Stored space ${id}.`);
                      resolveStore(id);
                    }).catch(err => {
                      errorLogger.error(`Failed to store space ${id} / ${err.code} ${err.name} ${err.message}`);
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
                  logger.info(`Stored removed time of ${id}.`);
                  resolveHandleRemoved(id);
                }).catch(err => {
                  errorLogger.error(`Failed to store removed time of ${id}. / ${err.code} ${err.name} ${err.message}`);
                  rejectHandleRemoved(err);
                });
              });
            })),
          ]).then(handleUserResult => {
            logger.info(`Completed processing @${username}.`);
            resolveHandleUser(username);
          });
        });
      });
    })).then(resultHandleUserAll => {
      // rewrite current state
      fs.writeFile(
        '/usr/data/notif/state.json',
        JSON.stringify(currentSpacesAll)
      ).catch(err => {
        errorLogger.error(`Failed to update state.json. / ${err.code} ${err.name} ${err.message}`);
      });
      logger.info('Completed all target users.');
    });
  });
};


logger.info('Checking state.json');
fs.readFile(
  '/usr/data/notif/state.json',
  'utf8'
).then(() => {
  logger.info('state.json already exists.');
}).catch(err => {
  if(err.code === 'ENOENT') {
    logger.info('creating state.json....');
    fsSync.writeFileSync(
      '/usr/data/notif/state.json',
      '{}',
      'utf8'
    );
    logger.info('created empty state.json');
  }
  else {
    errorLogger.error(`${err.code} ${err.name} ${err.message}`);
  }
  return;
}).finally(() => {
  logger.info('Start cron.');
  cron.schedule(
    process.env.NOTIF_INTERVAL || '* */5 * * * *',
    main
  );
});

