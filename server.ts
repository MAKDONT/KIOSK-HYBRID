import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

const TOKEN_PATH = 'drive-tokens.json';

function getAdminTokens() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      const ageInDays = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);
      if (ageInDays > 60) {
        return null;
      }
      return data.tokens;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveAdminTokens(tokens: any) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({
    tokens,
    timestamp: Date.now()
  }));
}

let supabaseClient: SupabaseClient | null = null;

// Setup Nodemailer Transporter
let transporter: nodemailer.Transporter | null = null;

async function setupTransporter() {
  // Try Google OAuth2 first
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.GMAIL_USER) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URL || 'https://kiosk-sp.up.railway.app/auth/callback'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      const accessToken = credentials.access_token;

      const tempTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.GMAIL_USER,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
          accessToken: accessToken,
        },
      });

      // Verify the connection configuration
      await tempTransporter.verify();
      transporter = tempTransporter;
      console.log("Gmail OAuth2 Transporter Created and Verified Successfully");
      return;
    } catch (error: any) {
      console.error("Failed to setup Gmail OAuth2. Attempting App Password fallback.");
      console.error("Error details:", error.message);
    }
  }

  // Fallback to App Password
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const tempTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      // Verify the connection configuration
      await tempTransporter.verify();
      transporter = tempTransporter;
      console.log("Gmail App Password Transporter Created and Verified Successfully");
      return;
    } catch (error: any) {
      console.error("Failed to verify Gmail credentials. Falling back to Ethereal Email.");
      console.error("Error details:", error.message);
    }
  } else if (!process.env.GMAIL_USER) {
    console.warn("GMAIL_USER not set. Falling back to Ethereal Email.");
  }

  // Fallback to Ethereal
  try {
    const account = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: {
        user: account.user,
        pass: account.pass,
      },
    });
    console.log("Ethereal Email Test Account Created");
  } catch (error) {
    console.error("Failed to create Ethereal test account:", error);
  }
}
setupTransporter();

async function sendEmailNotification(to: string, subject: string, html: string) {
  if (!transporter) {
    console.log("Email transporter not ready yet.");
    return;
  }
  try {
    const fromEmail = process.env.GMAIL_USER || '"Consultation System" <noreply@example.com>';
    const info = await transporter.sendMail({
      from: fromEmail,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}`);
    if (!process.env.GMAIL_USER) {
      console.log(`[Email] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.");
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // WebSocket Broadcast Helper
  function broadcast(type: string, payload: any) {
    try {
      const message = JSON.stringify({ type, payload });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
          } catch (e) {
            console.error("WebSocket send error:", e);
          }
        }
      });
    } catch (err) {
      console.error("Broadcast error:", err);
    }
  }

  // --- API Routes ---

  // Admin: Get all colleges (if exists)
  app.get("/api/colleges", async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("colleges").select("*").neq("code", "ADMIN_PASS");
      if (error) {
        return res.json([]); // Return empty if table doesn't exist
      }
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get admin password
  app.get("/api/admin/password", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("colleges")
        .select("name")
        .eq("code", "ADMIN_PASS")
        .maybeSingle();
      
      if (error || !data) {
        res.json({ password: "EARIST" });
      } else {
        res.json({ password: data.name });
      }
    } catch (err: any) {
      res.json({ password: "EARIST" });
    }
  });

  // Admin: Set admin password
  app.post("/api/admin/password", async (req, res) => {
    try {
      const { password } = req.body;
      const { data: existing } = await getSupabase()
        .from("colleges")
        .select("id")
        .eq("code", "ADMIN_PASS")
        .maybeSingle();

      if (existing) {
        await getSupabase()
          .from("colleges")
          .update({ name: password })
          .eq("code", "ADMIN_PASS");
      } else {
        await getSupabase()
          .from("colleges")
          .insert({ name: password, code: "ADMIN_PASS" });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add College
  app.post("/api/colleges", async (req, res) => {
    try {
      const { name, code } = req.body;
      let { data, error } = await getSupabase()
        .from("colleges")
        .insert({ name, code })
        .select()
        .single();
        
      if (error && error.message.includes("null value in column \"id\"")) {
        // Fallback if DB requires explicit UUID
        const { data: d2, error: e2 } = await getSupabase()
          .from("colleges")
          .insert({ id: crypto.randomUUID(), name, code })
          .select()
          .single();
        data = d2;
        error = e2;
      }
      
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all departments
  app.get("/api/departments", async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("departments").select("*");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Add department
  app.post("/api/departments", async (req, res) => {
    try {
      const { name, code, college_id } = req.body;
      const { data, error } = await getSupabase()
        .from("departments")
        .insert({ name, code, college_id })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Temporary endpoint to make all faculty available
  app.get("/api/test/make-all-available", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ status: "available" })
        .neq("status", "available")
        .select();
      if (error) throw error;
      res.json({ success: true, updated: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Temporary endpoint to get queue columns
  app.get("/api/test/queue-columns", async (req, res) => {
    try {
      // Fetch from a non-existent table to get the error message which might contain hints,
      // or just fetch from a known table.
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      const data = await response.json();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-run the update on server start for testing
  setTimeout(async () => {
    try {
      console.log("Auto-updating all faculty to 'available' for testing...");
      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ status: "available" })
        .neq("status", "available")
        .select();
      if (error) {
        console.error("Auto-update failed:", error);
      } else {
        console.log("Auto-update success. Updated rows:", data?.length);
      }
    } catch (err) {
      console.error("Auto-update error:", err);
    }
  }, 2000);

  // Admin: Delete college
  app.delete("/api/colleges/:id", async (req, res) => {
    try {
      const { error } = await getSupabase()
        .from("colleges")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete faculty
  app.delete("/api/faculty/:id", async (req, res) => {
    try {
      const { error } = await getSupabase()
        .from("faculty")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reset faculty password
  app.post("/api/faculty/:id/reset-password", async (req, res) => {
    try {
      const { password } = req.body;
      const { error } = await getSupabase()
        .from("faculty")
        .update({ password })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Add faculty
  app.post("/api/faculty", async (req, res) => {
    try {
      const { id, name, department_id, email, password } = req.body;
      
      // Auto-generate a unique faculty code (e.g., FAC-A1B2C3)
      const faculty_code = "FAC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data, error } = await getSupabase()
        .from("faculty")
        .insert({ id, name, full_name: name, faculty_code, department_id, email, password, status: "available" })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Student Active Queue
  app.get("/api/student/:id/active-queue", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("queue")
        .select("id")
        .eq("student_id", req.params.id)
        .in("status", ["waiting", "next", "serving", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "No active queue found" });
      
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faculty Login
  app.post("/api/faculty/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const { data, error } = await getSupabase()
        .from("faculty")
        .select("*")
        .eq("email", email)
        .eq("password", password)
        .single();

      if (error || !data) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update faculty availability
  app.post("/api/faculty/:id/availability", async (req, res) => {
    try {
      const { availability } = req.body;
      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ full_name: JSON.stringify(availability) })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all faculty
  app.get("/api/faculty", async (req, res) => {
    try {
      const { data: facultyData, error: facultyError } = await getSupabase()
        .from("faculty")
        .select("*");
      if (facultyError) throw facultyError;

      const { data: deptData, error: deptError } = await getSupabase()
        .from("departments")
        .select("*");
      if (deptError) throw deptError;

      const formattedData = (facultyData || []).map((f: any) => {
        const dept = (deptData || []).find((d: any) => d.id === f.department_id);
        return {
          ...f,
          department: dept ? dept.name : "Unknown Department"
        };
      });
      
      res.json(formattedData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Faculty Status
  app.post("/api/faculty/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const { error } = await getSupabase()
        .from("faculty")
        .update({ status })
        .eq("id", req.params.id);

      if (error) throw error;

      broadcast("faculty_updated", { faculty_id: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get student by ID (for Kiosk scan)
  app.get("/api/students/:id", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("students")
        .select("*")
        .eq("student_number", req.params.id)
        .single();
      if (error || !data) {
        res.status(404).json({ error: "Student not found" });
      } else {
        res.json({
          id: data.student_number,
          name: data.full_name,
          email: data.email
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Join Queue
  app.post("/api/queue/join", async (req, res) => {
    try {
      const { student_id, faculty_id, source, student_name, student_email, course, purpose, time_period } = req.body;

      // Check if student exists
      let { data: student } = await getSupabase()
        .from("students")
        .select("*")
        .eq("student_number", student_id)
        .single();

      if (!student) {
        if (student_name) {
          // Create student
          const { data: newStudent, error: createError } = await getSupabase()
            .from("students")
            .insert({ 
              student_number: student_id, 
              full_name: student_name, 
              email: student_email || null
            })
            .select()
            .single();
          
          if (createError) {
            console.error("Create student error:", createError);
            return res.status(500).json({ error: createError.message || "Failed to create student record" });
          }
          student = newStudent;
        } else {
          return res.status(404).json({ error: "Student not found. Please use Manual Input to register." });
        }
      } else if (student_email && student.email !== student_email) {
        // Update existing student's email/course if provided and different
        await getSupabase()
          .from("students")
          .update({ 
            email: student_email || student.email
          })
          .eq("id", student.id);
      }

      // Check if already in queue
      const { data: existing } = await getSupabase()
        .from("queue")
        .select("*")
        .eq("student_id", student.id)
        .in("status", ["waiting", "next", "serving", "ongoing"])
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: "Student already in queue" });
      }

      const targetEmail = student_email || student?.email;
      const meetLinkToSave = time_period ? `${time_period}|` : null;

      const { data: info, error } = await getSupabase()
        .from("queue")
        .insert({
          student_id: student.id,
          faculty_id,
          status: "waiting",
          student_email: targetEmail || null,
          meet_link: meetLinkToSave
        })
        .select()
        .single();

      if (error) throw error;

      const { data: newConsultation } = await getSupabase()
        .from("queue")
        .select(`
          *,
          students (full_name),
          faculty (name)
        `)
        .eq("id", info.id)
        .single();

      const formatted = {
        ...newConsultation,
        student_name: (newConsultation as any)?.students?.full_name,
        faculty_name: (newConsultation as any)?.faculty?.name,
      };

      if (targetEmail) {
        sendEmailNotification(
          targetEmail,
          "Consultation Booking Receipt",
          `
          <h2>Booking Confirmed</h2>
          <p>Hi ${formatted.student_name || 'Student'},</p>
          <p>You have successfully joined the queue for a consultation with <strong>${formatted.faculty_name || 'your selected faculty'}</strong>.</p>
          ${time_period ? `<p><strong>Time Slot:</strong> ${time_period}</p>` : ''}
          <p><strong>Virtual Consultation Room:</strong> The faculty will provide the Google Meet link when it is your turn.</p>
          <p>Please keep this email. You can track your status on the kiosk or wait for further notifications.</p>
          <br/>
          <p>Thank you!</p>
          `
        );
      }

      broadcast("queue_updated", { faculty_id });
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Booked Slots for Today
  app.get("/api/queue/booked-slots", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await getSupabase()
        .from("queue")
        .select("faculty_id, meet_link")
        .eq("queue_date", today)
        .in("status", ["waiting", "next", "serving", "ongoing"]);

      if (error) throw error;

      const bookedSlots = data.map((q: any) => {
        const parts = q.meet_link ? q.meet_link.split('|') : [];
        return {
          faculty_id: q.faculty_id,
          time_period: parts.length > 0 ? parts[0] : null
        };
      }).filter((q: any) => q.time_period);

      res.json(bookedSlots);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Queue for Faculty
  app.get("/api/faculty/:faculty_id/queue", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("queue")
        .select(`
          id, student_id, status, created_at, meet_link,
          students (full_name)
        `)
        .eq("faculty_id", req.params.faculty_id)
        .in("status", ["waiting", "next", "serving", "ongoing"])
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formatted = data.map((c: any) => {
        const parts = c.meet_link ? c.meet_link.split('|') : [];
        const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
        const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
        const isCancelled = parts.length > 2 && parts[2] === 'cancelled';
        
        let mappedStatus = c.status;
        if (c.status === 'ongoing') mappedStatus = 'serving';
        if (c.status === 'done') {
          mappedStatus = isCancelled ? 'cancelled' : 'completed';
        }

        return {
          ...c,
          status: mappedStatus,
          student_name: c.students?.full_name,
          meet_link: actual_link,
          time_period: time_period
        };
      });

      // Sort by time_period to ensure correct queue order
      formatted.sort((a: any, b: any) => {
        if (!a.time_period && !b.time_period) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (!a.time_period) return 1;
        if (!b.time_period) return -1;
        
        const parseTime = (tp: string) => {
          const match = tp.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          return hours * 60 + mins;
        };
        
        return parseTime(a.time_period) - parseTime(b.time_period);
      });

      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Temporary route to check constraint
  app.get("/api/check-constraint", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from('queue')
        .select('status')
        .limit(1);
      
      const { data: d2, error: e2 } = await getSupabase()
        .rpc('get_constraint_def', { constraint_name: 'queue_status_check' });
        
      res.json({ data, error, d2, e2 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faculty Action: Update Consultation Status
  app.post("/api/queue/:id/status", async (req, res) => {
    try {
      const { status, meet_link } = req.body;
      const consultationId = req.params.id;

      const { data: consultation, error: fetchError } = await getSupabase()
        .from("queue")
        .select("*")
        .eq("id", consultationId)
        .single();

      if (fetchError || !consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }

      // Map frontend statuses to DB allowed statuses (waiting, ongoing, done)
      let dbStatus = status;
      if (status === "serving") dbStatus = "ongoing";
      if (status === "completed" || status === "cancelled") dbStatus = "done";

      const updates: any = { status: dbStatus };

      if (status === "serving") {
        if (meet_link) {
          const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
          const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
          updates.meet_link = time_period ? `${time_period}|${meet_link}` : meet_link;
        }
        // Automatically set faculty to busy
        await getSupabase()
          .from("faculty")
          .update({ status: "busy" })
          .eq("id", consultation.faculty_id);
        broadcast("faculty_updated", { faculty_id: consultation.faculty_id });
      } else if (status === "completed" || status === "cancelled") {
        if (status === "cancelled") {
           const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
           const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
           const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
           updates.meet_link = `${time_period || ''}|${actual_link || ''}|cancelled`;
        }

        // Set faculty back to available if they were busy
        const { data: fac } = await getSupabase()
          .from("faculty")
          .select("status")
          .eq("id", consultation.faculty_id)
          .maybeSingle();
        
        if (fac?.status === "busy") {
          await getSupabase()
            .from("faculty")
            .update({ status: "available" })
            .eq("id", consultation.faculty_id);
          broadcast("faculty_updated", { faculty_id: consultation.faculty_id });
        }
      }

      const { error: updateError } = await getSupabase()
        .from("queue")
        .update(updates)
        .eq("id", consultationId);

      if (updateError) throw updateError;

      // Notification Logic
      const { data: studentData } = await getSupabase()
        .from("students")
        .select("email, full_name")
        .eq("id", consultation.student_id)
        .maybeSingle();
      
      const targetEmail = consultation.student_email || studentData?.email;
      const studentName = studentData?.full_name || "Student";
      
      const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
      const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
      const final_email_link = meet_link || actual_link;

      if (targetEmail) {
        if (status === "serving") {
          sendEmailNotification(
            targetEmail,
            "It's your turn!",
            `
            <h2>Consultation Started</h2>
            <p>Hi ${studentName},</p>
            <p>It's your turn for the consultation!</p>
            ${final_email_link ? `<p>Join the meeting here: <a href="${final_email_link}">${final_email_link}</a></p>` : ''}
            `
          );
        } else if (status === "completed") {
          sendEmailNotification(
            targetEmail,
            "Consultation Completed",
            `
            <h2>Consultation Completed</h2>
            <p>Hi ${studentName},</p>
            <p>Your consultation has been marked as completed. Thank you!</p>
            `
          );
        } else if (status === "cancelled") {
          sendEmailNotification(
            targetEmail,
            "Consultation Cancelled",
            `
            <h2>Consultation Cancelled</h2>
            <p>Hi ${studentName},</p>
            <p>Your consultation has been cancelled.</p>
            `
          );
        }
      }

      broadcast("queue_updated", { faculty_id: consultation.faculty_id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get specific consultation status (for student tracking)
  app.get("/api/queue/:id", async (req, res) => {
    try {
      const { data: consultation, error } = await getSupabase()
        .from("queue")
        .select(`
          id, status, created_at, faculty_id, meet_link,
          faculty (name)
        `)
        .eq("id", req.params.id)
        .single();

      if (error || !consultation) {
        res.status(404).json({ error: "Consultation not found" });
      } else {
        const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
        const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
        const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
        const isCancelled = parts.length > 2 && parts[2] === 'cancelled';

        let mappedStatus = consultation.status;
        if (consultation.status === 'ongoing') mappedStatus = 'serving';
        if (consultation.status === 'done') {
          mappedStatus = isCancelled ? 'cancelled' : 'completed';
        }

        res.json({
          ...consultation,
          status: mappedStatus,
          faculty_name: (consultation as any).faculty?.name,
          meet_link: (mappedStatus === "serving" || mappedStatus === "next") ? actual_link : null,
          time_period: time_period
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Data Purging: Delete records older than 48 hours
  setInterval(async () => {
    console.log("[Data Purge] Running 48-hour cleanup...");
    try {
      const fortyEightHoursAgo = new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString();
      const { error } = await getSupabase()
        .from("queue")
        .delete()
        .lte("created_at", fortyEightHoursAgo);

      if (error) {
        console.error("[Data Purge] Error:", error.message);
      } else {
        console.log(`[Data Purge] Deleted old records.`);
      }
    } catch (err) {
      console.error("[Data Purge] Error:", err);
    }
  }, 60 * 60 * 1000); // Run every hour

  // Auto-expire waiting consultations that have passed their time period
  setInterval(async () => {
    try {
      const { data: waitingQueue } = await getSupabase()
        .from("queue")
        .select("id, meet_link, faculty_id, created_at")
        .eq("status", "waiting");

      if (!waitingQueue) return;

      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      for (const item of waitingQueue) {
        if (!item.meet_link) continue;
        const parts = item.meet_link.split('|');
        if (parts.length < 2) continue;
        
        const time_period = parts[0]; // e.g. "Sunday 05:40 PM - 05:55 PM"
        const dayMatch = time_period.match(/^([a-zA-Z]+)/);
        
        let isExpired = false;
        
        if (dayMatch) {
          const dayName = dayMatch[1];
          const todayName = days[now.getDay()];
          
          if (dayName.toLowerCase() === todayName.toLowerCase()) {
            const timeMatch = time_period.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1], 10);
              const mins = parseInt(timeMatch[2], 10);
              const ampm = timeMatch[3].toUpperCase();
              if (ampm === 'PM' && hours < 12) hours += 12;
              if (ampm === 'AM' && hours === 12) hours = 0;
              
              const endTime = new Date();
              endTime.setHours(hours, mins, 0, 0);
              
              if (now > endTime) {
                isExpired = true;
              }
            }
          } else {
            // Different day. If created_at is older than 24 hours, expire it.
            const createdAt = new Date(item.created_at);
            if (now.getTime() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
              isExpired = true;
            }
          }
        }
        
        if (isExpired) {
          const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
          const new_meet_link = `${time_period || ''}|${actual_link || ''}|cancelled`;
          await getSupabase()
            .from("queue")
            .update({ status: "done", meet_link: new_meet_link })
            .eq("id", item.id);
          broadcast("queue_updated", { faculty_id: item.faculty_id });
        }
      }
    } catch (err) {
      console.error("[Auto-Expire] Error:", err);
    }
  }, 60 * 1000); // Run every minute

  // Google Drive OAuth and Upload
  const getOAuth2Client = (redirectUri: string) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google Client ID or Secret is not configured in environment variables.");
    }
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
  };

  // Cleanup old recordings every minute (for testing)
  setInterval(async () => {
    const tokens = getAdminTokens();
    if (!tokens) return;
    
    try {
      const oauth2Client = getOAuth2Client('http://localhost:3000');
      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      
      // 5 minutes ago for testing
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const response = await drive.files.list({
        q: `appProperties has { key='source' and value='consultation-system' } and createdTime < '${fiveMinutesAgo}'`,
        fields: 'files(id, name)',
      });
      
      const files = response.data.files || [];
      for (const file of files) {
        if (file.id) {
          await drive.files.delete({ fileId: file.id });
          console.log(`[Drive Cleanup] Deleted old recording: ${file.name}`);
        }
      }
    } catch (err) {
      console.error("[Drive Cleanup] Error:", err);
    }
  }, 60 * 1000); // Run every minute

  app.get("/api/auth/google/url", (req, res) => {
    try {
      const redirectUri = req.query.redirect_uri as string;
      if (!redirectUri) return res.status(400).json({ error: "redirect_uri required" });
      
      const oauth2Client = getOAuth2Client(redirectUri);
      
      const stateString = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');
      
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        state: stateString,
        prompt: 'consent'
      });
      res.json({ url });
    } catch (err: any) {
      console.error("OAuth URL Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
      if (!state) throw new Error("Missing state parameter");
      
      let stateObj;
      try {
        stateObj = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      } catch (e) {
        // Fallback for older non-base64 encoded states if any
        stateObj = JSON.parse(state as string);
      }
      
      const redirectUri = stateObj.redirectUri;

      if (!redirectUri) throw new Error("Missing redirectUri in state");

      const oauth2Client = getOAuth2Client(redirectUri);
      
      const { tokens } = await oauth2Client.getToken(code as string);
      
      saveAdminTokens(tokens);
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("OAuth Callback Error:", err);
      res.status(500).send(`Authentication failed: ${err.message || 'Unknown error'}`);
    }
  });

  app.get("/api/drive/status", (req, res) => {
    res.json({ connected: !!getAdminTokens() });
  });

  app.post("/api/drive/disconnect", (req, res) => {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Drive Disconnect Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/drive/upload", upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "Missing file" });
      }
      
      const tokens = getAdminTokens();
      if (!tokens) {
        return res.status(401).json({ error: "Admin Google Drive not connected" });
      }
      
      // redirectUri doesn't matter here since we already have tokens
      const oauth2Client = getOAuth2Client('http://localhost:3000');
      
      oauth2Client.setCredentials(tokens);
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      
      const fileMetadata = {
        name: file.originalname,
        appProperties: {
          source: 'consultation-system'
        }
      };
      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      };
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });
      
      // Clean up local file
      fs.unlinkSync(file.path);
      
      res.json({ success: true, link: response.data.webViewLink });
    } catch (err: any) {
      console.error("Drive Upload Error:", err);
      // Clean up local file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
