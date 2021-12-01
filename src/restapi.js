import express from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = express();
app.use(
  cors({
    origin: process.env.NOTIF_ALLOW_ORIGIN,
  })
);

// Initialize Firebase Admin SDK
const firebase = initializeApp();
const firebaseAuth = getAuth(firebase);

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

    return firebaseAuth.verifyIdToken(idToken, true).catch(err => {
      return res.status(401).send('Invalid token');
    });
  };
  
  // Test of Firebase Auth
  app.post('/api/debug-with-token', (req, res) => {
    return requireIdToken(req, res).then(decodedToken => {
      return res.status(200).send('Hello from Express.js with Firebase Auth Token!');
    });
  });
  
  // Listen
  app.listen(8080, () => {
    console.log('REST API server started');
  });
};
  
