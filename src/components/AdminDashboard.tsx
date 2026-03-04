import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Plus, Building, UserPlus, ArrowLeft, Trash2, KeyRound, AlertTriangle } from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  
  // College form
  const [collegeName, setCollegeName] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [addingCollege, setAddingCollege] = useState(false);
  const [collegeError, setCollegeError] = useState("");
  
  // Department form
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState("");
  
  // Faculty form
  const [facName, setFacName] = useState("");
  const [facDept, setFacDept] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [facPassword, setFacPassword] = useState("");
  const [addingFac, setAddingFac] = useState(false);
  const [facError, setFacError] = useState("");

  // Confirmation Modals
  const [deleteCollegeModal, setDeleteCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [deleteFacultyModal, setDeleteFacultyModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [resetPasswordModal, setResetPasswordModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });

  const [driveConnected, setDriveConnected] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("user_role") !== "admin") {
      navigate("/");
      return;
    }
    fetchDepartments();
    fetchColleges();
    fetchFaculties();
    checkDriveStatus();
  }, [navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setDriveConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch(`/api/drive/status`);
      const data = await res.json();
      setDriveConnected(data.connected);
    } catch (err) {
      console.error("Failed to check drive status", err);
    }
  };

  const handleConnectDrive = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/auth/google/callback`;
      const response = await fetch(`/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      alert('Failed to initiate Google Drive connection.');
    }
  };

  const handleDisconnectDrive = async () => {
    if (!confirm("Are you sure you want to disconnect Google Drive? New recordings will not be uploaded until you reconnect.")) return;
    
    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setDriveConnected(false);
      alert("Google Drive disconnected successfully.");
    } catch (err) {
      console.error("Failed to disconnect drive", err);
      alert("Failed to disconnect Google Drive.");
    }
  };

  const fetchFaculties = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculties(data);
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchFaculties(retries - 1), 2000);
      }
    }
  };

  const fetchColleges = async (retries = 3) => {
    try {
      const res = await fetch("/api/colleges");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setColleges(data);
        if (data.length > 0) {
          setCollegeId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchColleges(retries - 1), 2000);
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
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
  };

  const handleAddCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollegeError("");

    if (!collegeName.trim()) {
      setCollegeError("College name is required.");
      return;
    }
    if (!collegeCode.trim()) {
      setCollegeError("College code is required.");
      return;
    }

    setAddingCollege(true);
    try {
      const res = await fetch("/api/colleges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: collegeName.trim(), code: collegeCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add college");
      setCollegeName("");
      setCollegeCode("");
      fetchColleges();
      alert("College added successfully");
    } catch (err: any) {
      console.error(err);
      setCollegeError(err.message);
    } finally {
      setAddingCollege(false);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptError("");

    if (!deptName.trim()) {
      setDeptError("Department name is required.");
      return;
    }
    if (!deptCode.trim()) {
      setDeptError("Department code is required.");
      return;
    }
    if (!collegeId) {
      setDeptError("College selection is required.");
      return;
    }

    setAddingDept(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName.trim(), code: deptCode.trim(), college_id: collegeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add department");
      setDeptName("");
      setDeptCode("");
      fetchDepartments();
      alert("Department added successfully");
    } catch (err: any) {
      console.error(err);
      setDeptError(err.message);
    } finally {
      setAddingDept(false);
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setFacError("");

    if (!facName.trim()) {
      setFacError("Faculty name is required.");
      return;
    }
    if (!facDept) {
      setFacError("Department selection is required.");
      return;
    }
    if (!facEmail.trim()) {
      setFacError("Email is required.");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(facEmail.trim())) {
      setFacError("Please enter a valid email address.");
      return;
    }

    if (!facPassword.trim()) {
      setFacError("Password is required.");
      return;
    }
    if (facPassword.trim().length < 6) {
      setFacError("Password must be at least 6 characters long.");
      return;
    }

    setAddingFac(true);
    try {
      const id = crypto.randomUUID();
      const res = await fetch("/api/faculty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: facName.trim(),
          department_id: facDept,
          email: facEmail.trim(),
          password: facPassword.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add faculty");
      setFacName("");
      setFacDept("");
      setFacEmail("");
      setFacPassword("");
      fetchFaculties();
      alert("Faculty added successfully");
    } catch (err: any) {
      console.error(err);
      setFacError(err.message);
    } finally {
      setAddingFac(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user_role");
    navigate("/");
  };

  const handleDeleteCollege = async () => {
    try {
      const res = await fetch(`/api/colleges/${deleteCollegeModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete college");
      fetchColleges();
      setDeleteCollegeModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteFaculty = async () => {
    try {
      const res = await fetch(`/api/faculty/${deleteFacultyModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete faculty");
      fetchFaculties();
      setDeleteFacultyModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      const res = await fetch(`/api/faculty/${resetPasswordModal.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "earist2024" })
      });
      if (!res.ok) throw new Error("Failed to reset password");
      setResetPasswordModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="bg-white shadow-sm p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-neutral-600" />
          </button>
          <Shield className="w-8 h-8 text-red-600" />
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Admin Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4 border-r border-neutral-200 pr-4">
            {driveConnected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                    <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                    <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                    <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                  </svg>
                  <span className="text-sm font-medium">Drive Connected</span>
                </div>
                <button
                  onClick={handleDisconnectDrive}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-100 transition-colors"
                  title="Disconnect Google Drive"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectDrive}
                className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-600 rounded-lg border border-neutral-200 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                  <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                  <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                  <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                </svg>
                <span className="text-sm font-medium">Connect Drive</span>
              </button>
            )}
          </div>
          <button
            onClick={async () => {
              const res = await fetch('/api/test/make-all-available');
              const data = await res.json();
              alert('Updated: ' + JSON.stringify(data));
              fetchFaculties();
            }}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Make All Faculty Available (Test)
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add College */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-100 rounded-2xl">
              <Building className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add College</h2>
          </div>

          <form onSubmit={handleAddCollege} className="space-y-4">
            {collegeError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {collegeError}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                College Name
              </label>
              <input
                type="text"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. College of Engineering"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-purple-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                College Code
              </label>
              <input
                type="text"
                value={collegeCode}
                onChange={(e) => setCollegeCode(e.target.value)}
                placeholder="e.g. COE"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-purple-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingCollege || !collegeName || !collegeCode}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              {addingCollege ? "Adding..." : "Add College"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Existing Colleges</h3>
            <ul className="space-y-2">
              {colleges.length === 0 ? (
                <li className="text-neutral-400 text-sm">No colleges found.</li>
              ) : (
                colleges.map((c: any) => (
                  <li key={c.id} className="p-3 bg-neutral-50 rounded-xl text-neutral-700 font-medium flex items-center justify-between group">
                    <span>{c.name} ({c.code})</span>
                    <button
                      onClick={() => setDeleteCollegeModal({ isOpen: true, id: c.id, name: c.name })}
                      className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete College"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Add Department */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-2xl">
              <Building className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add Department</h2>
          </div>

          <form onSubmit={handleAddDepartment} className="space-y-4">
            {deptError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {deptError}
              </div>
            )}
            {colleges.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  Select College
                </label>
                <select
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value)}
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                  required
                >
                  <option value="" disabled>Select College</option>
                  {colleges.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  College ID (Required)
                </label>
                <input
                  type="text"
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department Name
              </label>
              <input
                type="text"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Computer Engineering"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department Code
              </label>
              <input
                type="text"
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                placeholder="e.g. BSCpE"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingDept || !deptName || !deptCode}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              {addingDept ? "Adding..." : "Add Department"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Existing Departments</h3>
            <ul className="space-y-2">
              {departments.length === 0 ? (
                <li className="text-neutral-400 text-sm">No departments found.</li>
              ) : (
                departments.map((d: any) => (
                  <li key={d.id} className="p-3 bg-neutral-50 rounded-xl text-neutral-700 font-medium">
                    {d.name}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Add Faculty */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-emerald-100 rounded-2xl">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add Faculty Member</h2>
          </div>

          <form onSubmit={handleAddFaculty} className="space-y-4">
            {facError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {facError}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Full Name
              </label>
              <input
                type="text"
                value={facName}
                onChange={(e) => setFacName(e.target.value)}
                placeholder="e.g. Dr. Alan Turing"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department
              </label>
              <select
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              >
                <option value="" disabled>Select Department</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Email Address
              </label>
              <input
                type="email"
                value={facEmail}
                onChange={(e) => setFacEmail(e.target.value)}
                placeholder="e.g. aturing@earist.edu.ph"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Password
              </label>
              <input
                type="password"
                value={facPassword}
                onChange={(e) => setFacPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingFac || !facName || !facDept || !facEmail || !facPassword}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              {addingFac ? "Adding..." : "Add Faculty"}
            </button>
          </form>
        </div>
      </main>

      {/* Registered Faculties Table */}
      <section className="px-8 pb-12 max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-3xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-neutral-900 mb-6">Registered Faculties</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-100">
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Name</th>
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Email</th>
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Faculty Code</th>
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Department</th>
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Status</th>
                  <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {faculties.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      No faculties registered yet.
                    </td>
                  </tr>
                ) : (
                  faculties.map((fac) => (
                    <tr key={fac.id} className="hover:bg-neutral-50 transition-colors group">
                      <td className="py-4 px-4 font-medium text-neutral-900">{fac.name}</td>
                      <td className="py-4 px-4 text-neutral-600">{fac.email}</td>
                      <td className="py-4 px-4 font-mono text-sm text-neutral-500">{fac.faculty_code}</td>
                      <td className="py-4 px-4 text-neutral-600">
                        {fac.department || "Unknown"}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          fac.status === 'available' ? 'bg-green-100 text-green-800' :
                          fac.status === 'busy' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {fac.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setResetPasswordModal({ isOpen: true, id: fac.id, name: fac.name })}
                            className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Reset Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteFacultyModal({ isOpen: true, id: fac.id, name: fac.name })}
                            className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Faculty"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Modals */}
      {deleteCollegeModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete College</h2>
            </div>
            <p className="text-neutral-600 mb-8">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteCollegeModal.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteCollegeModal({ isOpen: false, id: "", name: "" })}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCollege}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFacultyModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete Faculty</h2>
            </div>
            <p className="text-neutral-600 mb-8">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteFacultyModal.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteFacultyModal({ isOpen: false, id: "", name: "" })}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFaculty}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Reset Password</h2>
            </div>
            <p className="text-neutral-600 mb-8">
              Are you sure you want to reset the password for <span className="font-bold text-neutral-900">{resetPasswordModal.name}</span> to <span className="font-mono bg-neutral-100 px-2 py-1 rounded">earist2024</span>?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setResetPasswordModal({ isOpen: false, id: "", name: "" })}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
