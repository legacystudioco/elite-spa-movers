// wix-integration/booking-form.js

// Configuration - REPLACE WITH YOUR ACTUAL FIREBASE PROJECT URL
const API_BASE_URL = 'https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net';

// Form elements
const form = document.getElementById('bookingForm');
const submitBtn = document.getElementById('submitBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const alertContainer = document.getElementById('alertContainer');
const photoUpload = document.getElementById('photoUpload');
const filePreview = document.getElementById('filePreview');

// Set minimum date to today
const today = new Date().toISOString().split('T')[0];
document.getElementById('requestedDate').min = today;

// File upload preview
photoUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            showAlert('Please select a JPG or PNG image file.', 'error');
            this.value = '';
            return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showAlert('File size must be less than 10MB.', 'error');
            this.value = '';
            return;
        }

        filePreview.style.display = 'block';
        filePreview.innerHTML = `✅ Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    } else {
        filePreview.style.display = 'none';
    }
});

// Form submission
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Validate business hours
    const requestedDate = document.getElementById('requestedDate').value;
    const requestedTime = document.getElementById('requestedTime').value;
    
    if (!isValidBusinessTime(requestedDate, requestedTime)) {
        showAlert('Please select a time during business hours (Monday-Friday, 9:00 AM - 5:00 PM).', 'error');
        return;
    }

    // Show loading state
    setLoadingState(true);

    try {
        // Check availability first
        const availability = await checkAvailability(requestedDate, requestedTime, document.getElementById('serviceType').value);
        
        if (!availability.available) {
            throw new Error(availability.reason || 'Time slot not available');
        }

        // Upload photo if present
        let photoUrl = null;
        const photoFile = photoUpload.files[0];
        if (photoFile) {
            photoUrl = await uploadPhoto(photoFile);
        }

        // Prepare form data
        const formData = {
            fullName: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            address: document.getElementById('address').value,
            serviceType: document.getElementById('serviceType').value,
            requestedDate: requestedDate,
            requestedTime: requestedTime,
            notes: document.getElementById('notes').value,
            photoUrl: photoUrl
        };

        // Submit appointment
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
            filePreview.style.display = 'none';
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

// Helper functions
function isValidBusinessTime(date, time) {
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a weekday (Monday = 1, Friday = 5)
    if (dayOfWeek < 1 || dayOfWeek > 5) {
        return false;
    }

    // Check if time is within business hours (9:00 - 17:00)
    const timeHour = parseInt(time.split(':')[0]);
    return timeHour >= 9 && timeHour < 17;
}

async function checkAvailability(date, time, serviceType) {
    try {
        const response = await fetch(`${API_BASE_URL}/checkAvailability?date=${date}&time=${time}&serviceType=${encodeURIComponent(serviceType)}`);
        return await response.json();
    } catch (error) {
        console.error('Error checking availability:', error);
        return { available: true }; // Assume available if check fails
    }
}

async function uploadPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const response = await fetch(`${API_BASE_URL}/uploadPhoto`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        imageData: e.target.result,
                        fileName: file.name
                    })
                });

                const result = await response.json();
                
                if (response.ok) {
                    resolve(result.photoUrl);
                } else {
                    throw new Error(result.error || 'Failed to upload photo');
                }
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsDataURL(file);
    });
}

function setLoadingState(loading) {
    if (loading) {
        submitBtn.style.display = 'none';
        loadingSpinner.style.display = 'block';
        // Disable form inputs
        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => input.disabled = true);
    } else {
        submitBtn.style.display = 'block';
        loadingSpinner.style.display = 'none';
        // Re-enable form inputs
        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => input.disabled = false);
    }
}

function showAlert(message, type) {
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}