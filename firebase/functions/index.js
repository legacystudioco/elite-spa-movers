const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// [1] Check Availability
exports.checkAvailability = functions.https.onRequest(async (req, res) => {
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

// [2] Create Appointment
exports.createAppointment = functions.https.onRequest(async (req, res) => {
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
