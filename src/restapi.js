import express from 'express';

const app = express();

export const launch = () => {
  app.get('/', (req, res) => {
    res.status(200).send('Hello from Express.js');
  });
  
  // Test of Firebase Auth
  app.get('/demo', (req, res) => {
    // Verify token
    const hasAccess = true;

    if(!hasAccess) {
      return res.status(403).send('Access Denied');
    }

    return res.status(200).send('Hello from Express.js with Firebase Auth Token!');
  });
  
  // Listen
  app.listen(8080, () => {
    console.log('REST API server started');
  });
};
  
