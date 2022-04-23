import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import YAML from 'yaml';
import axios from 'axios';
import log4js from 'log4js';
import * as twitterWrap from './twitter.js';
import {
  getFirebase,
  FieldValue,
} from './firebase.js';

const global = {
  config: undefined,
  twitter: {},
  firebase: {},
};

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

const main = (twitterUserId, targetConfig) => {
  logger.info(`Start main process for ${twitterUserId}.`);

  const pidFilePath = `/usr/data/notif/main-${twitterUserId}.pid`;

  return fs.readFile(
    pidFilePath,
    'utf8'
  ).then(() => {
    logger.info(`Another main process for ${twitterUserId} is running.`);
  }).catch(err => {
    return new Promise((resolve, reject) => {
      if(err.code === 'ENOENT') {
        fs.writeFile(
          pidFilePath,
          String(process.pid)
        ).catch(err => {
          errorLogger.error(`Failed to create main-${twitterUserId}.pid. ([${err.code} / ${err.name}] ${err.message})`);
          reject(err);
        }).then(() => {
          notify(twitterUserId, targetConfig).finally(() => {
            fs.rm(
              pidFilePath
            ).then(() => {
              logger.info(`Completed main process for ${twitterUserId}.`);
              resolve();
            }).catch(err => {
              errorLogger.error(`Failed to remove main-${twitterUserId}.pid. ([${err.code} / ${err.name}] ${err.message})`);
              reject(err);
            });
          });
        });
      }
      else {
        errorLogger.error(`Failed to read main-${twitterUserId}.pid. ([${err.code} / ${err.name}] ${err.message})`);
        reject(err);
      }
    });
  }).catch(err => {
    errorLogger.error(`Mainprocess for ${twitterUserId} crashed. ([${err.code} / ${err.name}] ${err.message})`);
    return;
  });
};

const notify = (twitterUserId, targetConfig) => {
  const stateFilePath = `/usr/data/notif/state-${twitterUserId}.json`;

  const destParentDocPath = targetConfig.destinations_firestore.destination_document;
  const destCollectionPath = destParentDocPath === '' ? 'endpoints' : destParentDocPath.replace(/\/$/, '') + '/endpoints';

  const historyParentDocPath = targetConfig.destinations_firestore.history_document;
  const historyCollectionPath = historyParentDocPath === '' ? 'spaces' : historyParentDocPath.replace(/\/$/, '') + '/spaces';

  return fs.readFile(
    stateFilePath,
    'utf8'
  ).catch(err => {
    errorLogger.error(`Failed to read state-${twitterUserId}.json. ([${err.code} / ${err.name}] ${err.message})`);
    throw err;
  }).then(_textPrevious => {
    const previousSpaces = JSON.parse(_textPrevious) || { data: [] };
    if(!previousSpaces.data) previousSpaces.data = [];
    
    if(!global.twitter[targetConfig.twitter_bearer_token]) {
      const twitterBearerToken = fsSync.readFileSync(
        '/usr/src/notif-app/twitter.d/' + global.config.twitter_bearer_tokens[targetConfig.twitter_bearer_token].filename,
        'utf8'
      ).trim();
      global.twitter[targetConfig.twitter_bearer_token] = twitterWrap.getTwitter(twitterBearerToken);
    }
    const twitter = global.twitter[targetConfig.twitter_bearer_token];

    twitter.getSpacesByUserId(twitterUserId).catch(err => {
      errorLogger.error(`Failed to get Twitter Space information of ${twitterUserId} ([${err.code} / ${err.name}] ${err.message})`);
      throw err;
    }).then(async currentSpaces => {
      logger.info(`Start processing ${twitterUserId}`);
      if(!currentSpaces.data) currentSpaces.data = [];

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

      logger.info(`flags for ${twitterUserId}: ${JSON.stringify(flags)}`);
      
      if(!global.firebase[targetConfig.destinations_firestore.token]) {
        global.firebase[targetConfig.destinations_firestore.token] = getFirebase('/usr/src/notif-app/firebase.d/' + global.config.firebase_tokens[targetConfig.destinations_firestore.token].filename);
      }
      const {
        firestore,
      } = global.firebase[targetConfig.destinations_firestore.token];

      const twitterUser = await twitter.getUser(twitterUserId).catch(err => {
        errorLogger.error(`Failed to resolve user profile of ${twitterUserId}`);
        return null;
      });
      if(twitterUser === null) return;
      const {
        data: {
          name: twitterUserScreenName,
          username: twitterUserName,
        },
      } = twitterUser;
    
      return Promise.allSettled([
        Promise.allSettled(flags.created.map(created => {
          return new Promise((resolveHandleCreated, rejectHandleCreated) => {
            const {
              id,
            } = created;

            // handle created
            Promise.allSettled([
              new Promise(async (resolveNotifAll, rejectNotifAll) => {
                // notify
                const querySnap = await firestore.collection(destCollectionPath).where('userIds', 'array-contains', twitterUserId).get().catch(err => {
                  errorLogger.error(`Failed to load endpoints for ${twitterUserId} from database. / ${err.code} ${err.name} ${err.message}`);
                  rejectNotifAll(err);
                  return null;
                });
                if(querySnap === null) return;

                if(querySnap.empty) resolveNotifAll();

                Promise.allSettled(querySnap.docs.map(endpoint => {
                  return new Promise((resolveNotif, rejectNotif) => { 
                    const {
                      dest,
                      destDetails,
                    } = endpoint.data();
                    logger.info(`userId: ${twitterUserId}, dest: ${dest}, dest details: ${JSON.stringify(destDetails)}`);

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
                          content: `${twitterUserScreenName} (@${twitterUserName}) が Twitter Space を開始しました.\rhttps://twitter.com/i/spaces/${id}`,
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
                              username: twitterUserName,
                              screenName: twitterUserScreenName,
                              userId: twitterUserId,
                              id,
                            };
                          }
                          case 'GET': {
                            config.params = {
                              username: twitterUserName,
                              screenName: twitterUserScreenName,
                              userId: twitterUserId,
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
                      logger.info(`Sent to ${config.url} for ${twitterUserId}. (id: ${endpoint.id})`);
                      resolveNotif(endpoint.id);
                    }).catch(err => {
                      errorLogger.error(`Failed to send to ${config.url} for ${twitterUserId}. (id: ${endpoint.id}). / ${err.code} ${err.name} ${err.message}`);
                      rejectNotif(err);
                    });
                  });
                })).then(notifResults => {
                  const resolvedCount = notifResults.filter(r => r.status === 'fulfilled').length;
                  const rejectedCount = notifResults.filter(r => r.status === 'rejected').length;
                  logger.info(`${resolvedCount}/${notifResults.length} notified for ${twitterUserId}. (${rejectedCount} failed)`);
                  resolveNotifAll({
                    resolvedCount,
                    rejectedCount,
                  });
                });
              }),
              new Promise((resolveStore, rejectStore) => {
                // store start
                firestore.doc(`${historyCollectionPath}/${id}`).set({
                  username: twitterUserName,
                  userId: twitterUserId,
                  startAt: FieldValue.serverTimestamp(),
                }).then(() => {
                  logger.info(`Stored space ${id} of user ${twitterUserId}.`);
                  resolveStore(id);
                }).catch(err => {
                  errorLogger.error(`Failed to store space ${id} of user ${twitterUserId} / ${err.code} ${err.name} ${err.message}`);
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
            firestore.doc(`${historyCollectionPath}/${id}`).update({
              endAt: FieldValue.serverTimestamp(),
            }).then(() => {
              logger.info(`Stored removed time of ${id} of user ${twitterUserId}.`);
              resolveHandleRemoved(id);
            }).catch(err => {
              errorLogger.error(`Failed to store removed time of ${id} of user ${twitterUserId}. / ${err.code} ${err.name} ${err.message}`);
              rejectHandleRemoved(err);
            });
          });
        })),
      ]).then(handleUserResult => {
        // rewrite current state
        return fs.writeFile(
          stateFilePath,
          JSON.stringify(currentSpaces)
        ).catch(err => {
          errorLogger.error(`Failed to update state-${twitterUserId}.json. / ${err.code} ${err.name} ${err.message}`);
          throw err;
        }).then(() => {
          logger.info(`Completed processing ${twitterUserId}.`);
          return;
        });
      });
    });
  });
};


// Launch
logger.info('Loading config.yml');
fs.readFile(
  '/usr/src/notif-app/config.yml',
  'utf8'
).catch(err => {
  errorLogger.error(`Failed to read config.yml. ([${err.code} / ${err.name}] ${err.message})`);
  return null;
}).then(configFile => {
  if(configFile === null) return null;
  try {
    return YAML.parse(configFile);
  }
  catch(err) {
    errorLogger.error(`Failed to parse config.yml. ([${err.code} / ${err.name}] ${err.message})`);
    return null;
  }
}).then(config => {
  global.config = config;
  return Promise.allSettled(Object.keys(config.targets).map(async twitterUserId => {
    const targetConfig = config.targets[twitterUserId];

    const stateFilePath = `/usr/data/notif/state-${twitterUserId}.json`;

    return fs.readFile(
      stateFilePath,
      'utf8'
    ).then(() => {
      logger.info(`state-${twitterUserId}.json already exists.`);
      return true;
    }).catch(err => {
      if(err.code === 'ENOENT') {
        logger.info(`creating state-${twitterUserId}.json....`);
        return fs.writeFile(
          stateFilePath,
          '{}',
          'utf8'
        ).catch(err => {
          errorLogger.error(`Failed to create empty state-${twitterUserId}.json`);
          throw err;
        }).then(() => {
          logger.info(`created empty state-${twitterUserId}.json`);
          return;
        });
      }
      else {
        errorLogger.error(`${err.code} ${err.name} ${err.message}`);
        throw err;
      }
    }).then(() => {
      cron.schedule(
        targetConfig.interval || '* */5 * * * *',
        () => main(twitterUserId, targetConfig)
      );
      logger.info(`Start cron for ${twitterUserId}.`);
      return;
    }).catch(err => {
      logger.info(`${twitterUserId} was skipped.`);
      return;
    });
  }));
});

