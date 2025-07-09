const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
  origin: [
    'https://legacystudioco.github.io',
    'https://your-wix-site.wixsite.com'
  ],
});
admin.initializeApp();
const db = admin.firestore();

exports.checkAvailability = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      // Respond to preflight request
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    try {
      const { date, time, serviceType } = req.query;
      if (!date || !time || !serviceType) {
        return res.status(400).json({ error: 'Missing required parameters.' });
      }
      const snapshot = await db.collection('appointments')
        .where('requestedDate', '==', date)
        .where('requestedTime', '==', time)
        .where('serviceType', '==', serviceType)
        .get();
      if (snapshot.empty) {
        return res.json({ available: true });
      } else {
        return res.json({ available: false });
      }
    } catch (err) {
      console.error('Error checking availability:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});

exports.createAppointment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    try {
      const data = req.body && Object.keys(req.body).length ? req.body : JSON.parse(req.rawBody);
      if (!data) {
        return res.status(400).json({ error: 'Missing request body.' });
      }
      const requiredFields = ['name', 'phone', 'email', 'serviceType', 'requestedDate', 'requestedTime', 'address'];
      for (let field of requiredFields) {
        if (!data[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('appointments').add(data);

      return res.json({ success: true, message: 'Appointment created successfully!' });
    } catch (err) {
      console.error('Error creating appointment:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});
