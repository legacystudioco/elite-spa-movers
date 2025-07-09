const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
  origin: [
    'https://legacystudioco.github.io',
    'https://your-wix-site.wixsite.com', // <-- add your actual Wix site URL here
  ],
});

admin.initializeApp();
const db = admin.firestore();

// --- Appointment Availability Endpoint ---
exports.checkAvailability = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { date, time, serviceType } = req.query;
      if (!date || !time || !serviceType) {
        return res.status(400).json({ error: 'Missing required parameters.' });
      }
      // Check for existing appointments with overlapping time
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

// --- Appointment Creation Endpoint ---
exports.createAppointment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const data = req.body && Object.keys(req.body).length ? req.body : req.body = JSON.parse(req.rawBody);
      if (!data) {
        return res.status(400).json({ error: 'Missing request body.' });
      }

      // Validate required fields as needed
      const requiredFields = ['name', 'phone', 'email', 'serviceType', 'requestedDate', 'requestedTime', 'address'];
      for (let field of requiredFields) {
        if (!data[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }

      // Save appointment to Firestore
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('appointments').add(data);

      return res.json({ success: true, message: 'Appointment created successfully!' });
    } catch (err) {
      console.error('Error creating appointment:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});
