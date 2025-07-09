const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
  origin: [
    'https://legacystudioco.github.io',
    'https://your-wix-site.wixsite.com'
  ],
});
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// --- SETUP YOUR SENDER EMAIL BELOW (REQUIRED) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'pastor.tyler.woodruff@gmail.com',      // Change to your sender email
    pass: 'Pickles54'           // Use Gmail App Password
  }
});

// ----------- Appointment Availability Check -----------
exports.checkAvailability = functions.https.onRequest((req, res) => {
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

// ----------- Create Appointment & Email Confirmation -----------
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

      // ------ Confirmation Email ------
      const mailOptions = {
        from: 'yourcompany@gmail.com',           // Your sender email
        to: data.email,                          // Customer's email
        subject: 'Appointment Request Recieved!',
        text: `Hi ${data.name || 'there'},\n\nThank you for requesting an appointment with Elite Spa Movers. We’ve received your request and will get back to you within 24 hours to confirm your booking.\n\nIf you have questions, reply to this email or call us anytime!\n\n— Elite Spa Movers Team`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending confirmation email:', error);
        } else {
          console.log('Confirmation email sent:', info.response);
        }
      });

      return res.json({ success: true, message: 'Appointment created and confirmation email sent!' });
    } catch (err) {
      console.error('Error creating appointment:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});

// ----------- Completion Email Endpoint (For App/Staff) -----------
exports.sendCompletionEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    try {
      const { email, name } = req.body && Object.keys(req.body).length ? req.body : JSON.parse(req.rawBody);

      if (!email) {
        return res.status(400).json({ error: 'Missing customer email.' });
      }

      const mailOptions = {
        from: 'yourcompany@gmail.com',           // Your sender email
        to: email,
        subject: 'Thanks For Choosing Elite Home Sources!',
        text: `Hi ${name || 'there'},\n\nThank you for trusting Elite How Sources! We hope you had a fantastic experience.\n\nWe’d love your feedback! Please consider leaving us a review:\n- Google: https://g.page/r/CZrJ8xXXX/review\n- Facebook: https://facebook.com/EliteSpaMovers/reviews\n\nIf you have any questions, just reply to this email.\n\n— Elite Spa Movers Team`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending completion email:', error);
          return res.status(500).json({ error: 'Error sending email.' });
        }
        console.log('Completion email sent:', info.response);
        return res.json({ success: true, message: 'Completion email sent.' });
      });

    } catch (err) {
      console.error('Error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });
});
