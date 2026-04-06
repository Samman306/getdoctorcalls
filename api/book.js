const { google } = require('googleapis');

// Google OAuth credentials (set these in Vercel environment variables)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, email, phone, practice, date, time } = req.body;

        if (!name || !email || !phone || !date || !time) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Parse date and time
        const bookingDate = new Date(date);
        const [timeStr, period] = time.split(' ');
        let [hours, minutes] = timeStr.split(':').map(Number);

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        bookingDate.setHours(hours, minutes, 0, 0);

        // End time (15 minutes later)
        const endDate = new Date(bookingDate.getTime() + 15 * 60 * 1000);

        // Create calendar event
        const event = {
            summary: `GetDoctorCalls: ${name}${practice ? ` - ${practice}` : ''}`,
            description: `Consultation call with ${name}\n\nPhone: ${phone}\nEmail: ${email}${practice ? `\nPractice: ${practice}` : ''}\n\nBooked via GetDoctorCalls.com`,
            start: {
                dateTime: bookingDate.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            end: {
                dateTime: endDate.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            attendees: [
                { email: email, displayName: name }
            ],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 60 },
                    { method: 'popup', minutes: 15 },
                ],
            },
            conferenceData: {
                createRequest: {
                    requestId: `getdoctorcalls-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            sendUpdates: 'all',
            conferenceDataVersion: 1
        });

        console.log('Event created:', response.data.htmlLink);

        return res.status(200).json({
            success: true,
            eventId: response.data.id,
            meetLink: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri
        });

    } catch (error) {
        console.error('Booking error:', error);
        return res.status(500).json({
            error: 'Failed to create booking',
            details: error.message
        });
    }
};
