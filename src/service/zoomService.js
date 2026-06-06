import axios from "axios";
import qs from "qs";

export const getZoomAuthUrl = (state) => {
  const params = {
    response_type: "code",
    client_id: process.env.ZOOM_CLIENT_ID,
    redirect_uri: process.env.ZOOM_REDIRECT_URI,
    state: state,
    scope: "meeting:write:meeting meeting:read:meeting user:read:meeting",
  };
  return `https://zoom.us/oauth/authorize?${qs.stringify(params)}`;
};

export const exchangeZoomCode = async (code) => {
  const auth = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    "https://zoom.us/oauth/token",
    qs.stringify({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: process.env.ZOOM_REDIRECT_URI,
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
};

export const refreshZoomToken = async (refreshToken) => {
  const auth = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    "https://zoom.us/oauth/token",
    qs.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
};

export const createZoomMeeting = async (accessToken, meetingDetails) => {
  const { title, startTime, duration, description } = meetingDetails;

  const response = await axios.post(
    "https://api.zoom.us/v2/users/me/meetings",
    {
      topic: title,
      type: 2, // Scheduled meeting
      start_time: startTime, // ISO 8601
      duration: duration, // in minutes
      agenda: description,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        watermark: false,
        use_pmi: false,
        approval_type: 0,
        audio: "both",
        auto_recording: "none",
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};

let cachedToken = null;
let tokenExpiry = null;

export const getZoomServerToken = async () => {
  // Check if we have a valid cached token (with 60 seconds safety buffer)
  if (cachedToken && tokenExpiry && Date.now() < (tokenExpiry - 60000)) {
    return cachedToken;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom Server-to-Server OAuth credentials are not fully configured (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET).");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await axios.post(
    "https://zoom.us/oauth/token",
    qs.stringify({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000);

  return cachedToken;
};

