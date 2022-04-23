import {
  initializeApp,
  cert,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue as FirestoreFieldValue } from 'firebase-admin/firestore';

export const getFirebase = (jsonPath) => {
  const firebase = initializeApp({
    credential: cert(jsonPath),
  });
  
  return {
    auth: getAuth(firebase),
    firestore: getFirestore(firebase),
  };
};

export const FieldValue = FirestoreFieldValue;

