// wix-integration/booking-form.js

const API_BASE_URL = 'https://us-central1-elite-spa-movers.cloudfunctions.net';

// Form elements
const form = document.getElementById('bookingForm');
const submitBtn = document.getElementById('submitBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const alertContainer = document.getElementById('alertContainer');

// Set minimum date to today
const today = new Date().toISOString().split('T')[0];
document.getElementById('requestedDate').min = today;

// Form submission
form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const requestedDate = document.getElementById('requestedDate').value;
    const requestedTime = document.getElementById('requestedTime').value;

    if (!isValidBusinessTime(requestedDate, requestedTime)) {
        showAlert('Please select a time during business hours (Monday-Friday, 9:00 AM - 5:00 PM).', 'error');
        return;
    }

    setLoadingState(true);

    try {
        const serviceType = document.getElementById('serviceType').value;
        const availability = await checkAvailability(requestedDate, requestedTime, serviceType);

        if (!availability.available) {
            throw new Error(availability.reason || 'Time slot not available');
        }

        // No photo support
        let photoUrl = null;

        const formData = {
            fullName: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            address: document.getElementById('address').value,
            serviceType,
            requestedDate,
            requestedTime,
            notes: document.getElementById('notes').value,
            photoUrl
        };

        const response = await fetch(`${API_BASE_URL}/createAppointment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showAlert('🎉 Appointment request submitted successfully! We\'ll contact you within 24 hours to confirm.', 'success');
            form.reset();
        } else {
            throw new Error(result.error || 'Failed to submit appointment');
        }

    } catch (error) {
        console.error('Error submitting appointment:', error);
        showAlert('❌ ' + error.message, 'error');
    } finally {
        setLoadingState(false);
    }
});

// Business time validator
function isValidBusinessTime(date, time) {
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay();
    if (dayOfWeek < 1 || dayOfWeek > 5) return false;
    const timeHour = parseInt(time.split(':')[0]);
    return timeHour >= 9 && timeHour < 17;
}

// Check availability
async function checkAvailability(date, time, serviceType) {
    try {
        const response = await fetch(`${API_BASE_URL}/checkAvailability?date=${date}&time=${time}&serviceType=${encodeURIComponent(serviceType)}`);
        return await response.json();
    } catch (error) {
        console.error('Error checking availability:', error);
        return { available: true }; // fallback
    }
}

// Loading state
function setLoadingState(loading) {
    if (loading) {
        submitBtn.style.display = 'none';
        loadingSpinner.style.display = 'block';
        form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
    } else {
        submitBtn.style.display = 'block';
        loadingSpinner.style.display = 'none';
        form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);
    }
}

// Alert message
function showAlert(message, type) {
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;
    if (type === 'success') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}
