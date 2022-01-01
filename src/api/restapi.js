import express from 'express';
import cors from 'cors';
import validator from 'validator';
import log4js from 'log4js';
import {
  auth,
  firestore,
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
  },
});

const logger = log4js.getLogger();
const errorLogger = log4js.getLogger('error');

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN,
    methods: [ 'GET', 'HEAD', 'POST', 'PUT', 'DELETE' ],
    preflightContinue: true,
  })
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


  // Endpoint
  //// Register
  app.post('/api/endpoints', (req, res) => {
    const {
      username,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        typeof username !== 'string'
        || username.trim() === ''
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
      })()
    ) {
      return res.status(400).send('Bad request body');
    }

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      console.log('[POST /api/endpoints]', uid, label, dest, JSON.stringify(destDetails));

      return firestore.collection('endpoints').add({
        owner: uid,
        username,
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
        console.error(err);
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

      console.log('[GET /api/endpoints]', uid);

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
        console.error(err);
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
      username,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        typeof username !== 'string'
        || username.trim() === ''
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

        console.log(`[PUT /api/endpoints/${id}]`, uid);

        return targetDocRef.update({
          username,
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
          console.error(err);
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
        
        console.log(`[DELETE /api/endpoints/${id}]`, uid);

        return targetDocRef.delete().then(result => {
          return res.status(200).send({
            data: {
              id,
            },
          });
        }).catch(err => {
          console.error(err);
          return res.status(500).send('Internal error occured');
        });
      });
    });
  });
  

  // Listen
  app.listen(8080, () => {
    console.log('REST API server started');
  });
};
  
