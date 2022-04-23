import express from 'express';
import cors from 'cors';
import validator from 'validator';
import log4js from 'log4js';
import {
  auth,
  firestore,
} from './firebase.js'; 

log4js.configure({
  appenders: {
    console: {
      type: 'console',
    },
    system: {
      type: 'dateFile',
      filename: '/var/log/api-app/system.log',
      pattern: '-yyyy-MM-dd',
    },
    error: {
      type: 'dateFile',
      filename: '/var/log/api-app/error.log',
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
    api_default: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
    api_error: {
      appenders: [
        'console',
        'error',
      ],
      level: 'warn',
    },
    api_express: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
  },
});

const logger = log4js.getLogger('api_default');
const errorLogger = log4js.getLogger('api_error');

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN,
    methods: [ 'GET', 'HEAD', 'POST', 'PUT', 'DELETE' ],
    preflightContinue: true,
  })
);
app.use(
  log4js.connectLogger(
    log4js.getLogger('api_express')
  )
);

export const launch = () => {
  app.get('/', (req, res) => {
    return res.status(200).send('Hello from Express.js');
  });

  // Verify token
  const requireIdToken = (req, res) => {
    const [ authType, idToken ] = req.get('Authorization').split(' ');

    if(!authType === 'Bearer') {
      return res.status(401).send('Invalid type');
    }

    return auth.verifyIdToken(idToken, true).catch(err => {
      return res.status(401).send('Invalid token');
    });
  };
  
  // Test of Firebase Auth
  app.post('/api/debug-with-token', (req, res) => {
    return requireIdToken(req, res).then(decodedToken => {
      return res.status(200).send('Hello from Express.js with Firebase Auth Token!');
    });
  });
  

  // Target users
  //// Provide acceptable target users
  app.get('/api/acceptableTargetUsernames', (req, res) => {
    const targets = process.env.NOTIF_TARGETS.split(',');
    return res.status(200).send(targets);
  });

  // Endpoint
  //// Register
  app.post('/api/endpoints', (req, res) => {
    const {
      usernames,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        !Array.isArray(usernames)
        || usernames.some(val => typeof val !== 'string' || val === '')
      ) || (
        typeof label !== 'string'
        || label.trim() === ''
      ) || (
        typeof dest !== 'string'
      ) || (() => {
        switch(dest) {
          case 'discord-webhook': {
            const {
              url,
            } = destDetails;

            return !(
              validator.isURL(url, {
                require_protocol: true,
                require_valid_protocol: true,
                protocols: [
                  'http',
                  'https',
                ],
                require_host: true,
                require_port: false,
                allow_protocol_relative_urls: false,
                allow_fragments: true,
                allow_query_components: true,
                validate_length: true,
              })
              && url.startsWith('https://discord.com/api/webhooks/')
            );
          }
          case 'json': {
            const {
              method,
              url,
            } = destDetails;

            return !(
              [ 'POST', 'GET' ].includes(method)
              && (
                validator.isURL(url, {
                  require_protocol: true,
                  require_valid_protocol: true,
                  protocols: [
                    'http',
                    'https',
                  ],
                  require_host: true,
                  require_port: false,
                  allow_protocol_relative_urls: false,
                  allow_fragments: true,
                  allow_query_components: true,
                  validate_length: true,
                })
              )
            );
          }
          default:
            return true;
        }
      })() || (() => {
        const targets = process.env.NOTIF_TARGETS.split(',');
        return usernames.some(username => (
          !targets.includes(username)
        ));
      })()
    ) {
      return res.status(400).send('Bad request body');
    }

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Add endpoint / ${uid} ${label} ${dest} ${JSON.stringify(destDetails)}`);

      return firestore.collection('endpoints').add({
        owner: uid,
        usernames,
        label,
        dest,
        destDetails,
      }).then(docRef => {
        return res.status(200).send({
          data: {
            id: docRef.id,
          },
        });
      }).catch(err => {
        errorLogger.error(`Failed to add endpoint. / ${err.code} ${err.name} ${err.message}`);
        return res.status(500).send('Internal error occured');
      });
    });
  });

  //// List
  app.get('/api/endpoints', (req, res) => {
    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Get endpoints / ${uid}`);

      const query = firestore.collection('endpoints').where('owner', '==', uid);
      return query.get().then(querySnapshot => {
        const rtnEndpoints = [];
        
        for(const doc of querySnapshot.docs) {
          rtnEndpoints.push({
            id: doc.id,
            createTime: doc.createTime.toDate().getTime(),
            updateTime: doc.updateTime.toDate().getTime(),
            ...doc.data(),
          });
        }

        return res.status(200).send(rtnEndpoints);
      }).catch(err => {
        errorLogger.error(`Failed to get endpoints of ${uid}. / ${err.code} ${err.name} ${err.message}`);
        return res.status(500).send('Internal error occured');
      });
    });
  });
  
  //// Update
  app.put('/api/endpoints/:id', (req, res) => {
    const {
      id,
    } = req.params;

    const {
      usernames,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        !Array.isArray(usernames)
        || usernames.some(val => typeof val !== 'string' || val === '')
      ) || (
        typeof label !== 'string'
        || label.trim() === ''
      ) || (
        typeof dest !== 'string'
      ) || (() => {
        switch(dest) {
          case 'discord-webhook': {
            const {
              url,
            } = destDetails;

            return !(
              validator.isURL(url, {
                require_protocol: true,
                require_valid_protocol: true,
                protocols: [
                  'http',
                  'https',
                ],
                require_host: true,
                require_port: false,
                allow_protocol_relative_urls: false,
                allow_fragments: true,
                allow_query_components: true,
                validate_length: true,
              })
              && url.startsWith('https://discord.com/api/webhooks/')
            );
          }
          case 'json': {
            const {
              method,
              url,
            } = destDetails;

            return !(
              [ 'POST', 'GET' ].includes(method)
              && (
                validator.isURL(url, {
                  require_protocol: true,
                  require_valid_protocol: true,
                  protocols: [
                    'http',
                    'https',
                  ],
                  require_host: true,
                  require_port: false,
                  allow_protocol_relative_urls: false,
                  allow_fragments: true,
                  allow_query_components: true,
                  validate_length: true,
                })
              )
            );
          }
          default:
            return true;
        }
      })() || (() => {
        const targets = process.env.NOTIF_TARGETS.split(',');
        return usernames.some(username => (
          !targets.includes(username)
        ));
      })()
    ) {
      return res.status(400).send('Bad request body');
    }

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      const targetDocRef = firestore.doc(`endpoints/${id}`);
      return targetDocRef.get().then(doc => {
        if(!doc.exists) {
          return res.status(404).send('Endpoint does not exist');
        }

        if(!doc.data().owner === id) {
          return res.status(403).send('You don\'t have access');
        }

        logger.info(`Update endpoint ${id} / ${uid}`);

        return targetDocRef.update({
          usernames,
          label,
          dest,
          destDetails,
        }).then(() => {
          return res.status(200).send({
            data: {
              id,
            },
          });
        }).catch(err => {
          errorLogger.error(`Failed to update endpoint ${id}. / ${err.code} ${err.name} ${err.message}`);
          return res.status(404).send('Endpoint does not exist');
        });
      });
    });
  });


  /// Remove
  app.delete('/api/endpoints/:id', (req, res) => {
    const {
      id,
    } = req.params;

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;
      
      const targetDocRef = firestore.doc(`endpoints/${id}`);
      return targetDocRef.get().then(doc => {
        if(!doc.exists) {
          return res.status(404).send('Endpoint does not exist');
        }

        if(!doc.data().owner === id) {
          return res.status(403).send('You don\'t have access');
        }
        
        logger.info(`Delete endpoint ${id} / ${uid}`);

        return targetDocRef.delete().then(result => {
          return res.status(200).send({
            data: {
              id,
            },
          });
        }).catch(err => {
          errorLogger.error(`Failed to delete endpoint ${id}. / ${err.code} ${err.name} ${err.message}`);
          return res.status(500).send('Internal error occured');
        });
      });
    });
  });
  

  // Listen
  app.listen(8080, () => {
    logger.info('REST API server started');
  });
};

