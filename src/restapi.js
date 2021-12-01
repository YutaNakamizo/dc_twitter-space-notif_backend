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
  
  // Test of Firebase Auth
  app.post('/api/debug-with-token', (req, res) => {
    // Verify token
    const [ authType, idToken ] = req.get('Authorization').split(' ');

    if(!authType === 'Bearer') {
      return res.status(401).send('Invalid type');
    }

    return firebaseAuth.verifyIdToken(idToken, true).then((decodedToken) => {
      return res.status(200).send('Hello from Express.js with Firebase Auth Token!');
    }).catch(err => {
      return res.status(401).send('Invalid token');
    });
  });
  
  // Listen
  app.listen(8080, () => {
    console.log('REST API server started');
  });
};
  
