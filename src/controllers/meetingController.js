console.log("Meeting controller loading...");
import Meeting from "../models/Meeting.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import ActivityLog from "../models/ActivityLog.js";
import { 
  getZoomAuthUrl, 
  exchangeZoomCode, 
  createZoomMeeting,
  refreshZoomToken 
} from "../service/zoomService.js";
import { 
  getGoogleAuthUrl, 
  exchangeGoogleCode, 
  createGoogleMeet 
} from "../service/googleMeetService.js";
import { 
  createNotification, 
  createProjectNotification 
} from "./notificationController.js";

// @desc    Initiate OAuth for a platform
// @route   GET /api/meetings/auth/:platform
// @access  Private
export const initiateAuth = async (req, res) => {
  const { platform } = req.params;
  const userId = req.user._id;

  try {
    let authUrl = "";
    if (platform === "zoom") {
      authUrl = getZoomAuthUrl(userId.toString());
    } else if (platform === "google") {
      authUrl = getGoogleAuthUrl(userId.toString());
    } else {
      return res.status(400).json({ success: false, message: "Invalid platform" });
    }

    // Set a cookie as a fallback for the state parameter
    res.cookie("oauth_userId", userId.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 300000, // 5 minutes
      sameSite: "lax"
    });

    res.json({ success: true, authUrl });
    console.log(`Generated Auth URL for ${platform}: ${authUrl}`);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Handle OAuth callback
// @route   GET /api/meetings/callback/:platform
// @access  Public (Callback from platform)
export const handleCallback = async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query; // state is userId (might be missing from some platforms)
  const cookieUserId = req.cookies?.oauth_userId;

  console.log(`OAuth Callback Received - Platform: ${platform}, State (UserId): ${state}, Cookie (UserId): ${cookieUserId}`);

  try {
    const userId = state || cookieUserId;
    if (!userId) {
       console.error("No state or cookie (userId) provided in callback");
       return res.status(400).json({ success: false, message: "No user state provided" });
    }
    
    const user = await User.findById(userId);

    if (!user) {
      console.error(`User with ID ${userId} not found in database`);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Clear the fallback cookie
    res.clearCookie("oauth_userId");

    if (platform === "zoom") {
      const tokens = await exchangeZoomCode(code);
      user.externalAccounts.zoom = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(Date.now() + tokens.expires_in * 1000),
        zoomId: tokens.user_id,
      };
    } else if (platform === "google") {
      const tokens = await exchangeGoogleCode(code);
      user.externalAccounts.google = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date),
        email: user.email, // Or fetch from Google
      };
    }

    await user.save();

    // Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?status=success&platform=${platform}`);
  } catch (error) {
    console.error(`OAuth callback error for ${platform}:`, error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?status=error&message=${encodeURIComponent(error.message)}`);
  }
};

// @desc    Create a new meeting
// @route   POST /api/meetings
// @access  Private
export const createMeeting = async (req, res) => {
  const { title, description, startTime, endTime, platform, projectId } = req.body;
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    let meetingData = null;

    if (platform === "zoom") {
      // Check if zoom is connected
      if (!user.externalAccounts.zoom?.accessToken) {
        return res.status(400).json({ success: false, message: "Zoom not connected" });
      }

      // Check if token expired and refresh
      if (new Date() > user.externalAccounts.zoom.expiryDate) {
        try {
          const tokens = await refreshZoomToken(user.externalAccounts.zoom.refreshToken);
          user.externalAccounts.zoom.accessToken = tokens.access_token;
          user.externalAccounts.zoom.refreshToken = tokens.refresh_token || user.externalAccounts.zoom.refreshToken;
          user.externalAccounts.zoom.expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
          await user.save();
        } catch (refreshError) {
          console.error("Zoom token refresh failed:", refreshError.response?.data || refreshError.message);
          
          // If token is invalid or expired, clear and ask to reconnect
          if (refreshError.response?.status === 400 || refreshError.response?.status === 401) {
            user.externalAccounts.zoom = undefined;
            await user.save();
            return res.status(401).json({ 
              success: false, 
              message: "Zoom connection has expired. Please disconnect and reconnect your Zoom account in the Dashboard." 
            });
          }
          throw refreshError;
        }
      }

      const duration = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
      const zoomMeeting = await createZoomMeeting(user.externalAccounts.zoom.accessToken, {
        title,
        startTime,
        duration,
        description,
      });

      meetingData = {
        title,
        description,
        startTime,
        endTime,
        platform: "zoom",
        platformMeetingId: zoomMeeting.id.toString(),
        joinUrl: zoomMeeting.join_url,
        host: userId,
        projectId,
        attendees: [{ user: userId, name: user.name, email: user.email }]
      };
    } else if (platform === "google_meet") {
      // Check if google is connected
      if (!user.externalAccounts.google?.accessToken) {
        return res.status(400).json({ success: false, message: "Google Calendar not connected" });
      }

      // googleapis handles token refresh if we provide tokens object
      const googleTokens = {
        access_token: user.externalAccounts.google.accessToken,
        refresh_token: user.externalAccounts.google.refreshToken,
        expiry_date: user.externalAccounts.google.expiryDate.getTime(),
      };

      const googleMeeting = await createGoogleMeet(googleTokens, {
        title,
        description,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });

      meetingData = {
        title,
        description,
        startTime,
        endTime,
        platform: "google_meet",
        platformMeetingId: googleMeeting.id,
        joinUrl: googleMeeting.hangoutLink,
        host: userId,
        projectId,
        attendees: [{ user: userId, name: user.name, email: user.email }]
      };
    }

    if (meetingData) {
      const meeting = await Meeting.create(meetingData);

      // Log activity and create notification
      try {
        // Only fetch project if projectId is a valid ObjectId string
        const isValidProjectId = projectId && projectId.match(/^[0-9a-fA-F]{24}$/);
        const project = isValidProjectId ? await Project.findById(projectId) : null;
        await ActivityLog.meetingCreated(userId, meeting, project);

        if (project) {
          const platformName = platform === "zoom" ? "Zoom" : "Google Meet";
          await createProjectNotification({
            project,
            sender: userId,
            type: "MEETING_SCHEDULED",
            message: `${req.user.name} scheduled a ${platformName} meeting: "${title}"`,
            relatedId: meeting._id,
            relatedModel: "Meeting",
            link: `/dashboard`,
            details: {
              meetingTitle: title,
              startTime: meeting.startTime,
              platform: platformName,
              projectName: project.name
            }
          });
        }
      } catch (logError) {
        console.error("Failed to log meeting creation or notification:", logError);
      }

      return res.status(201).json({ success: true, data: meeting });
    }

    res.status(400).json({ success: false, message: "Invalid platform or meeting creation failed" });
  } catch (error) {
    console.error("Create meeting error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user meetings
// @route   GET /api/meetings
// @access  Private
export const getMeetings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { workspaceId } = req.query;
    console.log(`Fetching meetings for user: ${req.user._id}, workspace: ${workspaceId}`);

    // Find projects where the user is a member or owner, optionally filtered by workspace
    const projectFilter = {
      $or: [
        { owner: req.user._id },
        { "members.user": req.user._id }
      ]
    };

    if (workspaceId) {
      projectFilter.workspaceId = workspaceId;
    }

    const projects = await Project.find(projectFilter).select("_id");
    
    const projectIds = projects ? projects.map(p => p._id) : [];
    console.log(`Found ${projectIds.length} projects for filter: ${JSON.stringify(projectFilter)}`);

    const meetingQuery = { 
      $or: [
        { host: req.user._id },
        { projectId: { $in: projectIds } }
      ]
    };

    // If workspaceId is active, strictly filter by the projects in that workspace
    if (workspaceId) {
      delete meetingQuery.$or;
      meetingQuery.projectId = { $in: projectIds };
    }

    const meetings = await Meeting.find(meetingQuery)
    .populate('attendees.user', 'name profilePicture')
    .populate({
      path: 'projectId',
      select: 'name icon members',
      populate: {
        path: 'members.user',
        select: 'name profilePicture'
      }
    })
    .sort({ startTime: 1 })
    .lean();

    console.log(`Found ${meetings.length} meetings`);

    res.json({ success: true, data: meetings || [] });
  } catch (error) {
    console.error("Get meetings error details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a meeting
// @route   DELETE /api/meetings/:id
// @access  Private
export const deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    // Only host can delete the meeting
    if (meeting.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the host can delete this meeting" });
    }

    const meetingId = meeting._id;
    const meetingTitle = meeting.title;
    const meetingProjectId = meeting.projectId;

    await meeting.deleteOne();

    // Log activity and create notification
    try {
      // Only fetch project if meetingProjectId is a valid ObjectId string
      const isValidProjectId = meetingProjectId && meetingProjectId.toString().match(/^[0-9a-fA-F]{24}$/);
      const project = isValidProjectId ? await Project.findById(meetingProjectId) : null;
      await ActivityLog.meetingDeleted(req.user._id, meetingId, meetingTitle, project);

      if (project) {
        await createProjectNotification({
          project,
          sender: req.user._id,
          type: "MEETING_DELETED",
          message: `${req.user.name} cancelled the meeting: "${meetingTitle}"`,
          relatedId: meetingId,
          relatedModel: "Meeting",
          link: `/dashboard`,
          details: {
            meetingTitle,
            projectName: project.name
          }
        });
      }
    } catch (logError) {
      console.error("Failed to log meeting deletion or notification:", logError);
    }

    res.json({ success: true, message: "Meeting deleted successfully" });
  } catch (error) {
    console.error("Delete meeting error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Disconnect an external account
// @route   DELETE /api/meetings/disconnect/:platform
// @access  Private
export const disconnectPlatform = async (req, res) => {
  const { platform } = req.params;
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    
    if (platform === "zoom") {
      user.externalAccounts.zoom = undefined;
    } else if (platform === "google") {
      user.externalAccounts.google = undefined;
    } else {
      return res.status(400).json({ success: false, message: "Invalid platform" });
    }

    await user.save();
    res.json({ success: true, message: `${platform} disconnected successfully` });
  } catch (error) {
    console.error("Disconnect platform error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
