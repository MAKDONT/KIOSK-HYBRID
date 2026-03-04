import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, CheckCircle, Video, XCircle, ChevronRight, Clock, ArrowLeft, LogOut } from "lucide-react";

interface Consultation {
  id: number;
  student_id: string;
  student_name: string;
  status: "waiting" | "next" | "serving";
  created_at: string;
  source: string;
  meet_link?: string;
}

interface Faculty {
  id: string;
  name: string;
  full_name?: string;
  department: string;
  status: string;
}

export default function FacultyDashboard() {
  const { id: selectedFaculty } = useParams();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [queue, setQueue] = useState<Consultation[]>([]);
  const [meetLink, setMeetLink] = useState(() => localStorage.getItem("faculty_meet_link") || "");
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<{day: string, start: string, end: string}[]>([]);

  useEffect(() => {
    if (localStorage.getItem("user_role") !== "staff") {
      navigate("/");
      return;
    }
    fetchFaculty();
  }, [navigate]);

  useEffect(() => {
    if (selectedFaculty) {
      fetchQueue();
      // Setup WebSocket for real-time updates
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "queue_updated") {
          fetchQueue();
        }
        if (data.type === "faculty_updated") {
          fetchFaculty();
        }
      };

      return () => ws.close();
    }
  }, [selectedFaculty]);

  const fetchFaculty = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculty(data);
      } else {
        console.error("Failed to fetch faculty: Not an array", data);
      }
    } catch (err) {
      console.error("Failed to fetch faculty", err);
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    }
  };

  const fetchQueue = async (retries = 3) => {
    try {
      const res = await fetch(`/api/faculty/${selectedFaculty}/queue`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
      } else {
        console.error("Failed to fetch queue: Not an array", data);
      }
    } catch (err) {
      console.error("Failed to fetch queue", err);
      if (retries > 0) {
        setTimeout(() => fetchQueue(retries - 1), 2000);
      }
    }
  };

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{ blob: Blob } | null>(null);

  useEffect(() => {
    const checkDriveStatus = async () => {
      try {
        const res = await fetch(`/api/drive/status`);
        const data = await res.json();
        setDriveConnected(data.connected);
      } catch (err) {
        console.error("Failed to check drive status", err);
      }
    };
    checkDriveStatus();
  }, []);

  const handleSaveToDrive = async () => {
    if (!recordedAudio) return;
    
    if (driveConnected) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', recordedAudio.blob, `consultation-audio-${new Date().toISOString().replace(/:/g, '-')}.webm`);
      formData.append('faculty_id', selectedFaculty!.toString());
      
      try {
        const res = await fetch('/api/drive/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          alert(`Audio saved to Admin Google Drive: ${data.link}`);
          setRecordedAudio(null);
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        console.error("Failed to upload to drive", err);
        alert("Failed to save to Google Drive. Downloading locally instead.");
        downloadLocally(recordedAudio.blob);
        setRecordedAudio(null);
      } finally {
        setUploading(false);
      }
    } else {
      downloadLocally(recordedAudio.blob);
      setRecordedAudio(null);
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudio({ blob });
        
        setIsRecording(false);
        setMediaRecorder(null);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      // Handle user stopping microphone via browser UI
      stream.getAudioTracks()[0].onended = () => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };
    } catch (err) {
      console.error("Error starting audio recording:", err);
      alert("Could not start audio recording. Please ensure you have granted microphone permissions.");
    }
  };

  const downloadLocally = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consultation-audio-${new Date().toISOString().replace(/:/g, '-')}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const updateStatus = async (id: number, status: string, link?: string, autoCallNext: boolean = false) => {
    try {
      const res = await fetch(`/api/queue/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, meet_link: link }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        console.error("Failed to update status:", errData);
        alert(`Error updating status: ${errData.error}`);
        return;
      }
      
      if (status === "completed" || status === "cancelled") {
        stopAudioRecording();
      }
      
      if (autoCallNext && (status === "completed" || status === "cancelled")) {
        const alreadyNext = queue.find(s => s.status === "next" && s.id !== id);
        if (!alreadyNext) {
          const nextStudent = queue.find(s => s.status === "waiting" && s.id !== id);
          if (nextStudent) {
            await fetch(`/api/queue/${nextStudent.id}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "next" }),
            });
          }
        }
      }
      
      fetchQueue();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleStartSession = async (id: number, existingLink?: string) => {
    let finalLink = existingLink || meetLink;
    
    if (!finalLink) {
      alert("Please provide your Google Meet link before starting the consultation.");
      return;
    }
    
    if (!finalLink.startsWith("http")) {
      finalLink = "https://" + finalLink;
    }

    localStorage.setItem("faculty_meet_link", finalLink);
    
    window.open(finalLink, '_blank');
    
    await startAudioRecording();
    updateStatus(id, "serving", finalLink);
  };

  const selectedFacultyData = faculty.find(f => f.id === selectedFaculty);

  const toggleFacultyStatus = async () => {
    if (!selectedFacultyData) return;
    const newStatus = selectedFacultyData.status === 'available' ? 'offline' : 'available';
    try {
      await fetch(`/api/faculty/${selectedFaculty}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchFaculty();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const openAvailabilityModal = () => {
    if (!selectedFacultyData) return;
    try {
      const parsed = JSON.parse(selectedFacultyData.full_name || "[]");
      if (Array.isArray(parsed)) {
        setAvailabilitySlots(parsed);
      } else {
        setAvailabilitySlots([]);
      }
    } catch (e) {
      setAvailabilitySlots([]);
    }
    setShowAvailabilityModal(true);
  };

  const saveAvailability = async () => {
    try {
      await fetch(`/api/faculty/${selectedFaculty}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability: availabilitySlots }),
      });
      setShowAvailabilityModal(false);
      fetchFaculty();
    } catch (err) {
      console.error("Failed to save availability", err);
    }
  };

  const addSlot = () => {
    setAvailabilitySlots([...availabilitySlots, { day: "Monday", start: "09:00", end: "10:00" }]);
  };

  const removeSlot = (index: number) => {
    setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: string, value: string) => {
    const newSlots = [...availabilitySlots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setAvailabilitySlots(newSlots);
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 60; j += 15) {
        const hour = i.toString().padStart(2, '0');
        const minute = j.toString().padStart(2, '0');
        const time = `${hour}:${minute}`;
        const ampm = i >= 12 ? 'PM' : 'AM';
        const displayHour = i === 0 ? 12 : i > 12 ? i - 12 : i;
        const displayTime = `${displayHour}:${minute} ${ampm}`;
        options.push({ value: time, label: displayTime });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="bg-white shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
              Faculty Dashboard
            </h1>
          </div>
          {/* Mobile Sign Out */}
          <button
            onClick={() => {
              localStorage.removeItem("user_role");
              localStorage.removeItem("user_id");
              navigate("/");
            }}
            className="sm:hidden p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={openAvailabilityModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-xl transition-colors flex-1 sm:flex-none justify-center"
          >
            <Clock className="w-4 h-4" /> Availability
          </button>
          <span className="text-neutral-600 font-medium hidden sm:block">
            {selectedFacultyData ? selectedFacultyData.name : "Loading..."}
          </span>
          <button
            onClick={() => {
              localStorage.removeItem("user_role");
              localStorage.removeItem("user_id");
              navigate("/");
            }}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Active Session Virtual Room */}
        {queue.find(q => q.status === "serving") && (() => {
          const activeSession = queue.find(q => q.status === "serving")!;
          return (
            <div className="lg:col-span-3 mb-2 bg-white rounded-2xl p-4 shadow-sm border border-neutral-200 flex flex-col h-[600px]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <Video className="w-6 h-6 text-indigo-600" />
                  Active Consultation: {activeSession.student_name}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(activeSession.id, "completed", undefined, true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-medium rounded-xl transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Complete
                  </button>
                  <button
                    onClick={() => updateStatus(activeSession.id, "cancelled", undefined, true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-medium rounded-xl transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200 p-8 text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Video className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Consultation in Progress</h3>
                <p className="text-neutral-500 max-w-md mb-6">
                  The consultation is happening in a separate Google Meet window. The audio is currently being recorded.
                </p>
                <a 
                  href={activeSession.meet_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm inline-flex items-center gap-2"
                >
                  <Video className="w-5 h-5" /> Re-open Google Meet
                </a>
              </div>
            </div>
          );
        })()}

        {/* Queue List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-neutral-900">Live Queue (FIFO)</h2>
            <span className="px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full font-medium">
              {queue.length} Students Waiting
            </span>
          </div>

          <div className="space-y-4">
            {queue.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center text-neutral-500 shadow-sm border border-neutral-200">
                <Clock className="w-16 h-16 mx-auto mb-4 text-neutral-300" />
                <p className="text-xl">No students in queue.</p>
              </div>
            ) : (
              queue.map((student, index) => (
                <div
                  key={student.id}
                  className={`bg-white rounded-2xl p-4 sm:p-6 shadow-sm border-l-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    student.status === "serving"
                      ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/50"
                      : student.status === "next"
                      ? "border-amber-500 ring-2 ring-amber-500/20"
                      : "border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-3xl sm:text-4xl font-black text-neutral-200 w-10 sm:w-12 text-center shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-neutral-900 truncate">
                        {student.student_name}
                      </h3>
                      <p className="text-neutral-500 font-mono text-sm sm:text-base truncate">{student.student_id}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs sm:text-sm text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          {new Date(student.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <span className="px-2 py-0.5 bg-neutral-100 rounded text-[10px] sm:text-xs uppercase tracking-wider">
                          {student.source}
                        </span>
                        {student.status === "serving" && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Currently Serving
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                    {(student.status === "waiting" || student.status === "next") && (
                      <div className="flex flex-col gap-2 items-stretch sm:items-end w-full sm:w-auto">
                        {student.meet_link ? (
                          <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl text-sm w-full sm:w-64 border border-indigo-100">
                            <Video className="w-4 h-4 text-indigo-500 shrink-0" />
                            <a 
                              href={student.meet_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-indigo-700 hover:underline truncate flex-1 font-medium"
                            >
                              Virtual Room Ready
                            </a>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="Paste Google Meet Link"
                            value={meetLink}
                            onChange={(e) => setMeetLink(e.target.value)}
                            className="px-4 py-3 sm:py-2 border border-neutral-300 rounded-xl text-sm w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        )}
                        <div className="flex items-center gap-2 w-full">
                          <button
                            onClick={() => handleStartSession(student.id, student.meet_link)}
                            className="flex items-center gap-2 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors w-full justify-center"
                          >
                            <Video className="w-4 h-4" /> Start Consultation
                          </button>
                          <button
                            onClick={() => updateStatus(student.id, "completed", undefined, true)}
                            className="flex items-center justify-center p-3 sm:p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl transition-colors shrink-0"
                            title="Mark as Complete"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => updateStatus(student.id, "cancelled", undefined, true)}
                            className="flex items-center justify-center p-3 sm:p-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-xl transition-colors shrink-0"
                            title="Cancel Consultation"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {student.status === "serving" && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => updateStatus(student.id, "completed", undefined, true)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors shadow-sm"
                        >
                          <CheckCircle className="w-4 h-4" /> Complete
                        </button>
                        <button
                          onClick={() => updateStatus(student.id, "cancelled", undefined, true)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-red-100 hover:bg-red-200 text-red-800 font-medium rounded-xl transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar / Stats */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-4">Session Controls</h3>
            {selectedFacultyData ? (
              <div className="space-y-4">
                <div className="p-4 bg-neutral-50 rounded-xl">
                  <p className="text-sm text-neutral-500 mb-1">Current Status</p>
                  <p className={`text-lg font-medium flex items-center gap-2 ${
                    selectedFacultyData.status === 'available' ? 'text-emerald-600' : 
                    selectedFacultyData.status === 'busy' ? 'text-amber-600' : 'text-neutral-600'
                  }`}>
                    <span className={`w-3 h-3 rounded-full ${
                      selectedFacultyData.status === 'available' ? 'bg-emerald-500 animate-pulse' : 
                      selectedFacultyData.status === 'busy' ? 'bg-amber-500' : 'bg-neutral-500'
                    }`} />
                    {selectedFacultyData.status === 'available' ? 'Accepting Consultations' : 
                     selectedFacultyData.status === 'busy' ? 'Busy' : 'Offline'}
                  </p>
                </div>
                <button 
                  onClick={toggleFacultyStatus}
                  className="w-full py-3 px-4 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-medium rounded-xl transition-colors"
                >
                  {selectedFacultyData.status === 'available' ? 'Go Offline' : 'Go Available'}
                </button>

                <div className="pt-4 border-t border-neutral-200">
                  <p className="text-sm font-bold text-neutral-900 mb-3">Integrations</p>
                  {driveConnected ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                          <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                          <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                          <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-800 truncate">Admin Drive Connected</p>
                        <p className="text-xs text-emerald-600 truncate">Audio saves automatically</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0 opacity-50">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                          <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                          <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                          <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-600 truncate">Drive Not Connected</p>
                        <p className="text-xs text-neutral-500 truncate">Admin needs to connect</p>
                      </div>
                    </div>
                  )}
                  {uploading && (
                    <p className="text-xs text-indigo-600 mt-2 text-center animate-pulse">Uploading audio to Drive...</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">Select a faculty member.</p>
            )}
          </div>
        </div>
      </main>

      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-neutral-900">Consultation Hours</h2>
              <button onClick={() => setShowAvailabilityModal(false)} className="text-neutral-400 hover:text-neutral-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {availabilitySlots.length === 0 ? (
                <p className="text-neutral-500 text-center py-8">No time slots set. Add your available hours below.</p>
              ) : (
                availabilitySlots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-4 bg-neutral-50 p-4 rounded-xl">
                    <select
                      value={slot.day}
                      onChange={(e) => updateSlot(index, "day", e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={slot.start}
                      onChange={(e) => updateSlot(index, "start", e.target.value)}
                      className="px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {timeOptions.map((time) => (
                        <option key={time.value} value={time.value}>{time.label}</option>
                      ))}
                    </select>
                    <span className="text-neutral-400 font-medium">to</span>
                    <select
                      value={slot.end}
                      onChange={(e) => updateSlot(index, "end", e.target.value)}
                      className="px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {timeOptions.map((time) => (
                        <option key={time.value} value={time.value}>{time.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeSlot(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-between items-center pt-6 border-t border-neutral-100">
              <button
                onClick={addSlot}
                className="px-6 py-3 bg-indigo-50 text-indigo-700 font-medium rounded-xl hover:bg-indigo-100 transition-colors"
              >
                + Add Time Slot
              </button>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowAvailabilityModal(false)}
                  className="px-6 py-3 text-neutral-600 font-medium hover:bg-neutral-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAvailability}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {recordedAudio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Consultation Completed</h2>
            <p className="text-neutral-600 mb-8">The consultation audio has been recorded successfully. Would you like to save it to Google Drive?</p>
            
            <div className="space-y-3">
              <button
                onClick={handleSaveToDrive}
                disabled={uploading}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <span className="animate-pulse">Uploading...</span>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="currentColor"/>
                      <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="currentColor"/>
                      <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="currentColor"/>
                      <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="currentColor"/>
                    </svg>
                    Save to Google Drive
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  downloadLocally(recordedAudio.blob);
                  setRecordedAudio(null);
                }}
                disabled={uploading}
                className="w-full py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
              >
                Download Locally
              </button>
              <button
                onClick={() => setRecordedAudio(null)}
                disabled={uploading}
                className="w-full py-3 px-4 text-neutral-500 hover:text-neutral-700 font-medium transition-colors"
              >
                Discard Recording
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
