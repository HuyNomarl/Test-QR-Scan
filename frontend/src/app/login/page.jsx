'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Leaf } from 'lucide-react';
import api from '@/utils/api';
import { saveTokenToIDB } from '@/utils/offlineDB';

export default function LoginPage() {
  const router = useRouter();
  const [tab,        setTab]        = useState('employee'); // 'employee' | 'admin'
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!identifier || !password) return toast.error('All fields required.');
    setLoading(true);
    try {
      if (tab === 'employee') {
        const { data } = await api.post('/auth/login', { identifier, password });
        localStorage.setItem('employee_token', data.token);
        localStorage.setItem('employee_data',  JSON.stringify(data.employee));
        await saveTokenToIDB(data.token).catch(() => {});
        toast.success(`Welcome, ${data.employee.full_name}!`);
        router.push('/employee');
      } else {
        const { data } = await api.post('/auth/admin/login', { email: identifier, password });
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_data',  JSON.stringify(data.admin));
        toast.success(`Welcome, ${data.admin.name}!`);
        router.push('/admin');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen gradient-brand flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-fade-in">

        {/* Logo header */}
        <div className="text-center pt-8 pb-5 px-8">
          <img src="/logo.jpeg" alt="Manikstu Agro"
               className="w-20 h-20 mx-auto rounded-full object-contain shadow-lg mb-4" />
          <h1 className="text-2xl font-extrabold text-brand-primary">Manikstu Agro</h1>
          <p className="text-xs tracking-widest uppercase text-brand-secondary font-semibold mt-0.5">
            Attendance System
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex mx-6 mb-6 bg-gray-100 p-1 rounded-xl">
          {['employee', 'admin'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setIdentifier(''); setPassword(''); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                tab === t
                  ? 'bg-white shadow text-brand-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'employee' ? '👤 Employee' : '🔧 Admin'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="px-8 pb-8 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {tab === 'employee' ? 'Employee ID / Phone / Email' : 'Admin Email'}
            </label>
            <input
              className="input"
              type={tab === 'admin' ? 'email' : 'text'}
              placeholder={tab === 'employee' ? 'MKA-001 or phone...' : 'admin@manikstuagro.com'}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : `Sign In as ${tab === 'employee' ? 'Employee' : 'Admin'}`}
          </button>

          <p className="text-center text-xs text-gray-400 pt-2">
            Just marking attendance?{' '}
            <a href="/attend" className="text-brand-primary font-semibold hover:underline">
              Scan QR Code →
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
