import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import KioskView from "./components/KioskView";
import Login from "./components/Login";
import FacultyDashboard from "./components/FacultyDashboard";
import StudentTracking from "./components/StudentTracking";
import AdminDashboard from "./components/AdminDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/kiosk" element={<KioskView />} />
        <Route path="/faculty/:id" element={<FacultyDashboard />} />
        <Route path="/student/:id" element={<StudentTracking />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        {/* Redirect old routes */}
        <Route path="/faculty" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
