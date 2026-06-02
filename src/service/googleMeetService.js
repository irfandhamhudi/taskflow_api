import { google } from "googleapis";

const getOauth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

export const getGoogleAuthUrl = (state) => {
  const client = getOauth2Client();
  console.log("Generating Google Auth URL with Redirect URI:", client.redirectUri);
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  return client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    prompt: "consent",
  });
};

export const exchangeGoogleCode = async (code) => {
  const client = getOauth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
};

export const createGoogleMeet = async (tokens, meetingDetails) => {
  const { title, description, startTime, endTime } = meetingDetails;
  const client = getOauth2Client();

  client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: client });

  const event = {
    summary: title,
    description: description,
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
    conferenceDataVersion: 1,
  });

  return response.data;
};
