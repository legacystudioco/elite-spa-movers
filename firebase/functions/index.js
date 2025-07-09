const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Your email transporter setup (use your credentials here)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'pastor.tyler.woodruff@gmail.com',       // replace with your gmail address
    pass: 'Pickles54' // use app password for 2FA
  }
});

// Check availability function - V3
exports.checkAvailabilityV3 = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
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

// Create appointment function - V3
exports.createAppointmentV3 = functions.https.onRequest((req, res) => {
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
      const requiredFields = ['name', 'phoneNumber', 'email', 'serviceType', 'requestedDate', 'requestedTime', 'address']; 
      for (let field of requiredFields) {
        if (!data[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('appointments').add(data);

      // Send confirmation email to customer
      const mailOptions = {
        from: 'pastor.tyler.woodruff@gmail.com', // your Gmail
        to: data.email,
        subject: 'Appointment Request Received',
        text: `Thank you ${data.name} for your appointment request. We will contact you within 24 hours to confirm.`
      };
      await transporter.sendMail(mailOptions);

      return res.json({ success: true, message: 'Appointment created successfully!' });
    } catch (err) {
      console.error('Error creating appointment:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});
