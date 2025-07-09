const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { setGlobalOptions } = require('firebase-functions');

admin.initializeApp();
const db = admin.firestore();

// Set max concurrent requests per function
setGlobalOptions({ maxInstances: 10 });

// [1] Check Availability (CORS-enabled)
exports.checkAvailability = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    const { date, time, serviceType } = req.query;
    if (!date || !time || !serviceType) {
      return res.status(400).json({ available: false, reason: 'Missing parameters' });
    }
    try {
      const snapshot = await db.collection('appointments')
        .where('requestedDate', '==', date)
        .where('requestedTime', '==', time)
        .where('serviceType', '==', serviceType)
        .get();
      if (!snapshot.empty) {
        return res.json({ available: false, reason: 'Slot already booked' });
      }
      return res.json({ available: true });
    } catch (error) {
      console.error('Error checking availability:', error);
      return res.status(500).json({ available: false, reason: 'Server error' });
    }
  });
});

// [2] Create Appointment (CORS-enabled)
exports.createAppointment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    const data = req.body;
    if (
      !data.fullName ||
      !data.email ||
      !data.phoneNumber ||
      !data.requestedDate ||
      !data.requestedTime ||
      !data.serviceType
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      await db.collection('appointments').add({
        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        address: data.address || '',
        serviceType: data.serviceType,
        requestedDate: data.requestedDate,
        requestedTime: data.requestedTime,
        notes: data.notes || '',
        photoUrl: data.photoUrl || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error creating appointment:', error);
      return res.status(500).json({ error: 'Failed to create appointment' });
    }
  });
});
