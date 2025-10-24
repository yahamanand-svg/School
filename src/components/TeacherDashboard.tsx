import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2, BookOpen } from 'lucide-react';
import MarksManagement from './MarksManagement';
import { supabase } from '../lib/supabase';

interface TeacherData {
  name: string;
  teacherId?: string;
  loggedAs?: string;
  profilePhoto?: string;
  classes?: string[];
  sections?: string[];
}

const TeacherDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Prefer route state, otherwise fall back to localStorage session
  let teacher: TeacherData | undefined = location.state?.user;
  let loggedUser: any = null;
  try {
    const raw = localStorage.getItem('loggedUser');
    if (raw) loggedUser = JSON.parse(raw);
  } catch (e) {
    loggedUser = null;
  }
  if (!teacher && loggedUser && loggedUser.loggedAs === 'teacher') {
    teacher = loggedUser as TeacherData;
  }

  const [activeTab, setActiveTab] = useState<'homework' | 'marks'>('homework');
  const [classSection, setClassSection] = useState('');
  const [availableClassSections, setAvailableClassSections] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submissionDate, setSubmissionDate] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [studentsCount, setStudentsCount] = useState<number | null>(null);
  const [teacherMap, setTeacherMap] = useState<Record<string,string>>({});

  const loadHomeworks = async () => {
    try {
      const { data } = await supabase
        .from('homework')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) setHomeworks(data);
    } catch (e) {
      console.error('Error loading homeworks:', e);
    }
  };

  useEffect(() => {
    loadHomeworks();
  }, []);

  // load teacher profile - prefer Supabase, fall back to local JSON files for demos
  useEffect(() => {
    (async () => {
      try {
        // find teacher id from location state or localStorage
        let rawUser: any = teacher;
        if (!rawUser) {
          const raw = localStorage.getItem('loggedUser');
          if (raw) rawUser = JSON.parse(raw);
        }
        const teacherId = rawUser?.teacherId || rawUser?.teacher_id || rawUser?.name || rawUser?.email;
        if (!teacherId) return;

        // Try Supabase first for teachers list
        let tList: any[] = [];
        try {
          const { data: teachersData, error: tError } = await supabase.from('teachers').select('*');
          if (tError) throw tError;
          if (Array.isArray(teachersData)) tList = teachersData;
        } catch (err) {
          // fallback to local JSON in public/data
          try {
            const tRes = await fetch('/data/teachers.json');
            if (tRes.ok) tList = await tRes.json();
          } catch (e) {
            // ignore fallback failure
          }
        }

        if (!Array.isArray(tList) || tList.length === 0) return;

        // Match teacher by various possible id fields
        const found = tList.find((t: any) => {
          const candidates = [t.teacher_id, t.teacherId, t.id, t.email, t.name];
          return candidates.some((c: any) => String(c) === String(teacherId));
        });

        if (found) {
          // Normalize some field names to match previous local JSON shape
          const normalized = {
            ...found,
            teacherId: found.teacher_id || found.teacherId || found.id || found.email || found.name,
            profilePhoto: found.profile_photo || found.profilePhoto || found.profilePhotoUrl || found.avatar,
          };

          setProfile(normalized);

          const { data: classSections } = await supabase
            .from('teacher_class_sections')
            .select('class_section, subject')
            .eq('teacher_id', found.id);

          if (classSections && classSections.length > 0) {
            const uniqueClassSections = [...new Set(classSections.map((cs: any) => cs.class_section))];
            setAvailableClassSections(uniqueClassSections);
            if (uniqueClassSections.length > 0) {
              setClassSection(uniqueClassSections[0]);
              const firstSubject = classSections.find((cs: any) => cs.class_section === uniqueClassSections[0])?.subject;
              if (firstSubject) setSubject(firstSubject);
            }
          }
        }

        // also populate teacherMap for resolving createdBy (from tList)
        try {
          const teachersList = Array.isArray(tList) ? tList : [];
          const map: Record<string,string> = {};
          teachersList.forEach((t: any) => {
            const id = t.teacher_id || t.teacherId || t.id || t.email || t.name;
            const display = t.name || t.display_name || t.email || String(id);
            if (id) map[String(id)] = display;
            if (t.email) map[String(t.email)] = display;
            if (t.name) map[String(t.name)] = display;
          });
          setTeacherMap(map);
        } catch (e) {
          // ignore
        }

        // compute students count for classes/sections this teacher handles
        let users: any[] = [];
        try {
          const { data: studentsData, error: sError } = await supabase.from('students').select('*');
          if (!sError && Array.isArray(studentsData)) users = studentsData;
        } catch (e) {
          // fallback to users.json
          try {
            const uRes = await fetch('/data/users.json');
            if (uRes.ok) users = await uRes.json();
          } catch (e) {
            // ignore
          }
        }

        if (Array.isArray(users) && availableClassSections.length > 0) {
          const classSectionsSet = new Set(availableClassSections.map((cs: any) => String(cs).trim()));
          const count = users.filter((u: any) => {
            if (u.roles && Array.isArray(u.roles) && !u.roles.includes('student')) return false;
            const userClassSection = u.class_section || '';
            return classSectionsSet.has(String(userClassSection).trim());
          }).length;
          setStudentsCount(count);
        }
      } catch (e) {
        // ignore top-level errors
      }
    })();
  }, [teacher]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!title.trim()) {
      setMessage('Please provide a title for the homework.');
      return;
    }
    if (!classSection) {
      setMessage('Please select a class-section.');
      return;
    }
    if (availableClassSections.length > 0 && !availableClassSections.includes(classSection)) {
      setMessage(`You cannot assign homework to ${classSection}.`);
      return;
    }

    try {
      // Get teacher from teachers table
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id, name')
        .eq('teacher_id', profile?.teacherId || teacher?.teacherId)
        .maybeSingle();

      const hw = {
        title: title.trim(),
        description: description.trim(),
        subject: subject || '',
        class_section: String(classSection).trim(),
        submission_date: submissionDate || null,
        created_by: teacherData?.id || null,
        teacher_name: teacherData?.name || profile?.name || teacher?.name || 'Teacher',
        status: 'active'
      };

      const { error } = await supabase.from('homework').insert(hw);

      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      setMessage('Homework assigned successfully! Students in the class will see it.');
      setTitle('');
      setDescription('');
      setSubmissionDate('');
      loadHomeworks();
    } catch (e: any) {
      setMessage(`Could not save homework: ${e.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this homework?')) return;
    try {
      const { error } = await supabase.from('homework').delete().eq('id', id);

      if (error) {
        setMessage(`Error deleting homework: ${error.message}`);
        return;
      }

      setMessage('Homework deleted successfully.');
      loadHomeworks();
    } catch (e: any) {
      setMessage(`Could not delete homework: ${e.message}`);
    }
  };

  if (!teacher) {
    // If someone is logged in but as a student, show a specific message
    if (loggedUser && loggedUser.loggedAs === 'student') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">You are logged in as a student</h2>
            <p className="text-gray-600 mb-4">Use the Student Portal to access student features.</p>
            <button
              onClick={() => navigate('/student-dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Go to Student Portal
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">Please login to access your teacher dashboard</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
      <div className="bg-white rounded-3xl shadow-2xl border overflow-hidden">
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-cyan-50">
          <div className="flex space-x-3">
            <button
              onClick={() => setActiveTab('homework')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-sm ${
                activeTab === 'homework'
                  ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
              }`}
            >
              <BookOpen size={20} />
              <span>Homework</span>
            </button>
            <button
              onClick={() => setActiveTab('marks')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-sm ${
                activeTab === 'marks'
                  ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
              }`}
            >
              <BookOpen size={20} />
              <span>Marks Management</span>
            </button>
          </div>
        </div>
        <div className="p-8 bg-gradient-to-r from-blue-500 to-cyan-500">
          <div className="flex items-center gap-6">
            <div className="relative">
              <img src={profile?.profilePhoto || teacher.profilePhoto} alt="teacher" className="w-28 h-32 object-cover rounded-2xl border-4 border-white shadow-xl" />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-white"></div>
            </div>
            <div className="flex-1 text-white">
              <h2 className="text-3xl font-bold mb-2">{profile?.name || teacher.name}</h2>
              <div className="text-sm opacity-90 mb-3">Teacher ID: <span className="font-semibold">{profile?.teacherId || teacher.teacherId}</span></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
                  <div className="text-xs opacity-90 mb-1">Class-Sections</div>
                  <div className="text-2xl font-bold">{availableClassSections.length || '—'}</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
                  <div className="text-xs opacity-90 mb-1">Students</div>
                  <div className="text-2xl font-bold">{studentsCount ?? '—'}</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
                  <div className="text-xs opacity-90 mb-1">Homeworks</div>
                  <div className="text-2xl font-bold">{homeworks.length}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-white">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
              <div className="text-xs opacity-75">Class-Sections</div>
              <div className="text-sm font-medium mt-1">{availableClassSections.length > 0 ? availableClassSections.join(', ') : '—'}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
              <div className="text-xs opacity-75">Total Assignments</div>
              <div className="text-sm font-medium mt-1">{availableClassSections.length} Class-Section(s)</div>
            </div>
          </div>
        </div>
        {activeTab === 'homework' ? (
          <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Assign Homework</h3>
              <p className="text-gray-600">Create and assign homework to your students</p>
            </div>
          <form onSubmit={handleAssign} className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Class-Section *</label>
              {availableClassSections.length > 0 ? (
                <select
                  value={classSection}
                  onChange={e => {
                    setClassSection(e.target.value);
                  }}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableClassSections.map(cs => <option key={cs} value={cs}>{cs}</option>)}
                </select>
              ) : (
                <input
                  value={classSection}
                  onChange={e => setClassSection(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter class-section"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Submission Date</label>
              <input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter homework title" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter subject" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={3} placeholder="Enter homework description" />
            </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="submit" className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-3 rounded-xl font-medium hover:shadow-lg transition-all">Assign Homework</button>
              {message && <div className="text-sm font-medium text-green-600">{message}</div>}
            </div>
          </form>

          {homeworks.length > 0 && (
            <div className="mt-8">
              <h4 className="text-xl font-bold text-gray-800 mb-4">Recent Homeworks</h4>
              <div className="space-y-3">
                {homeworks.slice(0, 8).map(hw => (
                  <div key={hw.id} className="bg-white border-2 border-gray-100 rounded-xl p-5 hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">{hw.class_section}</span>
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">{hw.subject}</span>
                        </div>
                        <h5 className="font-bold text-lg text-gray-900 mb-1">{hw.title}</h5>
                        <p className="text-sm text-gray-600 mb-2">{hw.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>By: {hw.teacher_name || 'Teacher'}</span>
                          {hw.submission_date && <span>Due: {new Date(hw.submission_date).toLocaleDateString()}</span>}
                          <span>Posted: {new Date(hw.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(hw.id)} title="Delete" className="p-2 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        ) : (
          <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
            <MarksManagement
              userRole="teacher"
              userId={profile?.teacherId || teacher?.teacherId || ''}
              teacherId={profile?.teacherId || teacher?.teacherId}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
