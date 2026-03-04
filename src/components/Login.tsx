import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Shield, GraduationCap, LogIn, ScanLine, Keyboard, Clock } from "lucide-react";

type Role = "student" | "staff" | "admin";

interface Faculty {
  id: string;
  name: string;
  full_name?: string;
  department: string;
  status: "available" | "busy" | "offline";
}

interface Department {
  id: string;
  name: string;
  code: string;
}

export default function Login() {
  const [role, setRole] = useState<Role>("student");
  const [inputMode, setInputMode] = useState<"scan" | "manual">("scan");
  
  // Student Fields
  const [identifier, setIdentifier] = useState(""); // Student ID or Email
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [course, setCourse] = useState("");
  
  // Staff/Admin Fields
  const [password, setPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    fetchFaculty();
    fetchDepartments();
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "faculty_updated" || data.type === "queue_updated") {
        fetchFaculty();
      }
    };

    return () => ws.close();
  }, []);

  const fetchFaculty = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculty(data);
      }
    } catch (err) {
      console.error("Failed to fetch faculty", err);
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    }
  };

  const fetchDepartments = async (retries = 3) => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to fetch departments", err);
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
  };

  const getAvailabilityRange = (f: Faculty) => {
    try {
      const parsed = JSON.parse(f.full_name || "[]");
      if (Array.isArray(parsed)) {
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayDay = daysOfWeek[new Date().getDay()];
        
        const todaySlots = parsed.filter((slot: any) => slot.day === todayDay && slot.start && slot.end);
        
        if (todaySlots.length > 0) {
          const formatTime = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            const d = new Date();
            d.setHours(h, m, 0, 0);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          };
          
          return todaySlots.map((s: any) => `${formatTime(s.start)} - ${formatTime(s.end)}`).join(', ');
        }
      }
    } catch (e) {
      // ignore
    }
    return "No availability set for today";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (role === "admin") {
        const adminRes = await fetch("/api/admin/password");
        const adminData = await adminRes.json();
        const adminPass = adminData.password || "EARIST";
        
        if (password === adminPass) {
          localStorage.setItem("user_role", "admin");
          navigate("/admin/dashboard");
        } else {
          throw new Error("Invalid admin password");
        }
      } else if (role === "staff") {
        const res = await fetch("/api/faculty/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        
        localStorage.setItem("user_role", "staff");
        localStorage.setItem("user_id", data.id);
        navigate(`/faculty/${data.id}`);
      } else if (role === "student") {
        if (inputMode === "scan") {
          // Check if student exists
          const res = await fetch(`/api/students/${identifier}`);
          if (!res.ok) {
            throw new Error("Student not found in database. Please use Manual Input.");
          }
          const studentData = await res.json();
          localStorage.setItem("student_id", studentData.id);
          localStorage.setItem("student_name", studentData.name);
          localStorage.setItem("student_email", studentData.email || "");
          localStorage.setItem("student_course", studentData.course || "");
        } else {
          // Manual input
          if (!identifier || !studentName || !studentEmail || !course) {
            throw new Error("Please fill in all fields.");
          }
          localStorage.setItem("student_id", identifier);
          localStorage.setItem("student_name", studentName);
          localStorage.setItem("student_email", studentEmail);
          localStorage.setItem("student_course", course);
        }
        
        localStorage.setItem("user_role", "student");
        
        // Check for active queue
        const queueRes = await fetch(`/api/student/${identifier}/active-queue`);
        const queueData = await queueRes.json();
        
        if (queueRes.ok && queueData.id) {
          navigate(`/student/${queueData.id}`);
        } else {
          navigate(`/kiosk`);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col lg:flex-row">
      {/* Live Monitor Sidebar */}
      <div className="w-full lg:w-96 bg-white border-r border-neutral-200 p-6 flex flex-col overflow-hidden shadow-lg z-10">
        <h2 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          Live Monitor
        </h2>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {faculty.filter(f => f.status === 'available').length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p>No faculty members are currently available.</p>
            </div>
          ) : (
            faculty.filter(f => f.status === 'available').map(f => (
              <div key={f.id} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <h3 className="font-bold text-emerald-900">{f.name}</h3>
                <p className="text-sm text-emerald-700">{f.department}</p>
                <div className="mt-2 text-sm font-medium text-emerald-800 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {getAvailabilityRange(f)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-neutral-500">Select your role to continue</p>
          </div>

        <div className="flex p-1 bg-neutral-100 rounded-xl">
          <button
            type="button"
            onClick={() => { setRole("student"); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              role === "student" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <GraduationCap className="w-4 h-4" /> Student
          </button>
          <button
            type="button"
            onClick={() => { setRole("staff"); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              role === "staff" ? "bg-white text-indigo-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Users className="w-4 h-4" /> Staff
          </button>
          <button
            type="button"
            onClick={() => { setRole("admin"); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              role === "admin" ? "bg-white text-red-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Shield className="w-4 h-4" /> Admin
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {role === "student" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setInputMode("scan"); setError(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "scan" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <ScanLine className="w-4 h-4" /> Scan ID
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode("manual"); setError(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "manual" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Keyboard className="w-4 h-4" /> Manual Input
                </button>
              </div>

              {inputMode === "scan" ? (
                <div className="space-y-4">
                  <div className="w-full h-32 border-2 border-dashed border-emerald-300 rounded-2xl flex flex-col items-center justify-center bg-emerald-50 text-emerald-500 animate-pulse">
                    <ScanLine className="w-10 h-10 mb-2" />
                    <span className="text-sm font-bold">Scan ID Here</span>
                  </div>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Or type Student ID and press Enter"
                    className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors text-lg"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Student ID (e.g. 2021-0001)"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    placeholder="Email Address"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors appearance-none"
                    required
                  >
                    <option value="" disabled>Select Course / Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {role === "staff" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  Email Address
                </label>
                <input
                  type="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. faculty@earist.edu.ph"
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors text-lg"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors text-lg"
                  required
                />
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Admin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-red-500 focus:ring-0 outline-none transition-colors text-lg"
                required
              />
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || (role === "student" ? !identifier : role === "admin" ? !password : !identifier || !password)}
            className={`w-full flex items-center justify-center gap-2 py-4 px-4 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              role === "student" ? "bg-emerald-600 hover:bg-emerald-700" :
              role === "staff" ? "bg-indigo-600 hover:bg-indigo-700" :
              "bg-red-600 hover:bg-red-700"
            }`}
          >
            {loading ? "Please wait..." : (
              <>
                <LogIn className="w-5 h-5" />
                {role === "student" ? "Continue" : "Login"}
              </>
            )}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
