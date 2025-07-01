const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// Business configuration
const BUSINESS_CONFIG = {
  timezone: 'America/New_York', // Adjust to your timezone
  businessHours: {
    start: 9, // 9 AM
    end: 17,  // 5 PM
    workDays: [1, 2, 3, 4, 5] // Monday-Friday (0=Sunday, 6=Saturday)
  },
  serviceDurations: {
    'Hot Tub Moving & Delivery': 180, // 3 hours
    'Basketball System Install/Removal': 120, // 2 hours
    'Furniture & Equipment Assembly': 90, // 1.5 hours
    'Pool & Game Table Setup': 120 // 2 hours
  },
  adminEmail: 'tylersbangerang@gmail.com'
};

// Email transporter setup (configure with your email service)
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: functions.config().email.user,
    pass: functions.config().email.pass
  }
});

// Helper function to check if time slot is available
async function isTimeSlotAvailable(requestedDate, requestedTime, serviceType, excludeId = null) {
  const serviceDuration = BUSINESS_CONFIG.serviceDurations[serviceType] || 120;
  const requestedStart = moment.tz(`${requestedDate} ${requestedTime}`, BUSINESS_CONFIG.timezone);
  const requestedEnd = requestedStart.clone().add(serviceDuration, 'minutes');
  
  // Check business hours
  const dayOfWeek = requestedStart.day();
  const hour = requestedStart.hour();
  
  if (!BUSINESS_CONFIG.businessHours.workDays.includes(dayOfWeek)) {
    return { available: false, reason: 'Outside business days' };
  }
  
  if (hour < BUSINESS_CONFIG.businessHours.start || hour >= BUSINESS_CONFIG.businessHours.end) {
    return { available: false, reason: 'Outside business hours' };
  }
  
  // Check for conflicts with existing appointments
  const appointmentsRef = db.collection('appointments');
  let query = appointmentsRef
    .where('status', 'in', ['pending', 'confirmed'])
    .where('requestedDate', '==', requestedDate);
    
  if (excludeId) {
    query = query.where(admin.firestore.FieldPath.documentId(), '!=', excludeId);
  }
  
  const snapshot = await query.get();
  
  for (const doc of snapshot.docs) {
    const appointment = doc.data();
    const existingStart = moment.tz(`${appointment.requestedDate} ${appointment.requestedTime}`, BUSINESS_CONFIG.timezone);
    const existingDuration = BUSINESS_CONFIG.serviceDurations[appointment.serviceType] || 120;
    const existingEnd = existingStart.clone().add(existingDuration, 'minutes');
    
    // Check for overlap
    if (requestedStart.isBefore(existingEnd) && requestedEnd.isAfter(existingStart)) {
      return { 
        available: false, 
        reason: 'Time slot conflicts with existing appointment',
        conflictingAppointment: doc.id
      };
    }
  }
  
  return { available: true };
}

// Create appointment endpoint
exports.createAppointment = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const {
        fullName,
        email,
        phoneNumber,
        address,
        serviceType,
        requestedDate,
        requestedTime,
        notes,
        photoUrl
      } = req.body;
      
      // Validate required fields
      if (!fullName || !email || !phoneNumber || !address || !serviceType || !requestedDate || !requestedTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Check if time slot is available
      const availability = await isTimeSlotAvailable(requestedDate, requestedTime, serviceType);
      if (!availability.available) {
        return res.status(409).json({ 
          error: 'Time slot not available',
          reason: availability.reason
        });
      }
      
      // Create appointment document
      const appointmentData = {
        fullName,
        email,
        phoneNumber,
        address,
        serviceType,
        requestedDate,
        requestedTime,
        notes: notes || '',
        photoUrl: photoUrl || null,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await db.collection('appointments').add(appointmentData);
      
      // Send email notification
      await sendEmailNotification(docRef.id, appointmentData);
      
      // Send push notification to admin app
      await sendPushNotification('New appointment request', `${fullName} requested ${serviceType}`);
      
      res.status(201).json({
        success: true,
        appointmentId: docRef.id,
        message: 'Appointment request submitted successfully'
      });
      
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Check availability endpoint
exports.checkAvailability = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { date, time, serviceType } = req.query;
      
      if (!date || !time || !serviceType) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      const availability = await isTimeSlotAvailable(date, time, serviceType);
      
      res.json({
        available: availability.available,
        reason: availability.reason || null
      });
      
    } catch (error) {
      console.error('Error checking availability:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Get appointments (admin only)
exports.getAppointments = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      // Verify admin token
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
      }
      
      const token = authHeader.split(' ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Check if user is admin (you can implement custom claims or check email)
      if (!decodedToken.admin && decodedToken.email !== BUSINESS_CONFIG.adminEmail) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { status, limit = 50 } = req.query;
      
      let query = db.collection('appointments').orderBy('createdAt', 'desc').limit(parseInt(limit));
      
      if (status) {
        query = query.where('status', '==', status);
      }
      
      const snapshot = await query.get();
      const appointments = [];
      
      snapshot.forEach(doc => {
        appointments.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        });
      });
      
      res.json({ appointments });
      
    } catch (error) {
      console.error('Error getting appointments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Update appointment (admin only)
exports.updateAppointment = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      // Verify admin token
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
      }
      
      const token = authHeader.split(' ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      if (!decodedToken.admin && decodedToken.email !== BUSINESS_CONFIG.adminEmail) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const appointmentId = req.path.split('/').pop();
      const updates = req.body;
      
      // If rescheduling, check availability
      if (updates.requestedDate && updates.requestedTime && updates.serviceType) {
        const availability = await isTimeSlotAvailable(
          updates.requestedDate, 
          updates.requestedTime, 
          updates.serviceType,
          appointmentId
        );
        
        if (!availability.available) {
          return res.status(409).json({ 
            error: 'New time slot not available',
            reason: availability.reason
          });
        }
      }
      
      // Update appointment
      await db.collection('appointments').doc(appointmentId).update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ success: true, message: 'Appointment updated successfully' });
      
    } catch (error) {
      console.error('Error updating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Upload photo endpoint
exports.uploadPhoto = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      // This is a simplified version - in production, you'd handle multipart/form-data
      // For now, assuming base64 encoded image in request body
      const { imageData, fileName } = req.body;
      
      if (!imageData || !fileName) {
        return res.status(400).json({ error: 'Missing image data or filename' });
      }
      
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      const mimeType = imageData.split(';')[0].split(':')[1];
      
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: 'Invalid file type. Only JPG and PNG allowed.' });
      }
      
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Check file size (10MB limit)
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      }
      
      // Upload to Firebase Storage
      const bucket = storage.bucket();
      const file = bucket.file(`appointment-photos/${Date.now()}-${fileName}`);
      
      await file.save(buffer, {
        metadata: {
          contentType: mimeType
        }
      });
      
      // Make file publicly readable
      await file.makePublic();
      
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
      
      res.json({
        success: true,
        photoUrl: publicUrl
      });
      
    } catch (error) {
      console.error('Error uploading photo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Helper function to send email notification
async function sendEmailNotification(appointmentId, appointmentData) {
  const mailOptions = {
    from: `Elite Spa Movers <${functions.config().email.user}>`,
    to: BUSINESS_CONFIG.adminEmail,
    subject: `New Appointment Request - ${appointmentData.serviceType}`,
    html: `
      <h2>New Appointment Request</h2>
      <p><strong>Appointment ID:</strong> ${appointmentId}</p>
      <p><strong>Customer:</strong> ${appointmentData.fullName}</p>
      <p><strong>Email:</strong> ${appointmentData.email}</p>
      <p><strong>Phone:</strong> ${appointmentData.phoneNumber}</p>
      <p><strong>Address:</strong> ${appointmentData.address}</p>
      <p><strong>Service:</strong> ${appointmentData.serviceType}</p>
      <p><strong>Requested Date:</strong> ${appointmentData.requestedDate}</p>
      <p><strong>Requested Time:</strong> ${appointmentData.requestedTime}</p>
      ${appointmentData.notes ? `<p><strong>Notes:</strong> ${appointmentData.notes}</p>` : ''}
      ${appointmentData.photoUrl ? `<p><strong>Photo:</strong> <a href="${appointmentData.photoUrl}">View Photo</a></p>` : ''}
      
      <p>Please review and respond to this appointment request in your admin app.</p>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log('Email notification sent successfully');
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}

// Helper function to send push notification
async function sendPushNotification(title, body) {
  try {
    // Get admin FCM tokens from Firestore
    const tokensSnapshot = await db.collection('adminTokens').get();
    const tokens = [];
    
    tokensSnapshot.forEach(doc => {
      tokens.push(doc.data().token);
    });
    
    if (tokens.length > 0) {
      const message = {
        notification: {
          title,
          body
        },
        tokens
      };
      
      await admin.messaging().sendMulticast(message);
      console.log('Push notification sent successfully');
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}